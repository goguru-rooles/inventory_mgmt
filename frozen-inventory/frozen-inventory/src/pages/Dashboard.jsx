import React, { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, AreaChart, Area
} from 'recharts'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'

const MARKET_GRADIENTS  = ['from-sky-500 to-cyan-400', 'from-violet-500 to-purple-400', 'from-emerald-500 to-teal-400', 'from-rose-500 to-pink-400', 'from-amber-500 to-orange-400']
const MARKET_COLORS     = ['#0ea5e9', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b']
const MARKET_LIGHT      = ['#e0f2fe', '#ede9fe', '#d1fae5', '#ffe4e6', '#fef3c7']

function predictNextWeek(history) {
  const recent = history.slice(-8).filter(v => v >= 0)
  if (recent.length === 0) return { predicted: 0, avg: 0, low: 0, high: 0 }
  const weights  = recent.map((_, i) => i + 1)
  const total    = weights.reduce((a, b) => a + b, 0)
  const weighted = recent.reduce((s, v, i) => s + v * weights[i], 0)
  return {
    predicted: Math.ceil((weighted / total) * 1.1),
    avg:  Math.round(recent.reduce((a, b) => a + b, 0) / recent.length),
    low:  Math.min(...recent),
    high: Math.max(...recent),
  }
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Custom tooltip for charts
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-lg p-3 text-sm">
      <p className="font-bold text-gray-600 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: <span className="font-black">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { items, markets } = useApp()
  const [allSessions, setAllSessions] = useState([])
  const [allTxns, setAllTxns]         = useState([])
  const [activeMarket, setActiveMarket] = useState(null)
  const [activeItem, setActiveItem]     = useState(null)
  const [view, setView]                 = useState('summary')
  const [loading, setLoading]           = useState(true)

  useEffect(() => { if (markets.length && !activeMarket) setActiveMarket(markets[0].id) }, [markets, activeMarket])
  useEffect(() => { if (items.length && !activeItem) setActiveItem(items[0].id) }, [items, activeItem])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [{ data: sessions }, { data: txns }] = await Promise.all([
      supabase.from('weekly_sessions').select('*').order('week_start', { ascending: true }),
      supabase.from('market_transactions').select('*'),
    ])
    setAllSessions(sessions || [])
    setAllTxns(txns || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // Sum sold units across all sizes for a given session+market+item
  const soldUnits = useCallback((sessionId, marketId, itemId) => {
    const rows = allTxns.filter(t =>
      t.session_id === sessionId && t.market_id === marketId && t.item_id === itemId
    )
    return rows.reduce((sum, row) => sum + Math.max(0, (row.given || 0) - (row.returned || 0)), 0)
  }, [allTxns])

  const currentWeekSummary = useCallback((marketId) => {
    const session = allSessions[allSessions.length - 1]
    if (!session) return []
    return items.map(item => {
      const rows = allTxns.filter(t =>
        t.session_id === session.id && t.market_id === marketId && t.item_id === item.id
      )
      const given    = rows.reduce((s, r) => s + (r.given    || 0), 0)
      const returned = rows.reduce((s, r) => s + (r.returned || 0), 0)
      const sold     = rows.reduce((s, r) => s + Math.max(0, (r.given || 0) - (r.returned || 0)), 0)
      return { item, given, returned, sold }
    })
  }, [allSessions, allTxns, items])

  const multiMarketHistory = useCallback((itemId) => {
    return allSessions.map(session => {
      const row = { week: fmtDate(session.week_start) }
      for (const m of markets) {
        row[m.name] = soldUnits(session.id, m.id, itemId)
      }
      return row
    })
  }, [allSessions, markets, soldUnits])

  const itemHistory = useCallback((marketId, itemId) => {
    return allSessions.map(session => ({
      week: fmtDate(session.week_start),
      sold: soldUnits(session.id, marketId, itemId),
    }))
  }, [allSessions, soldUnits])

  const getPredictions = useCallback((itemId) => {
    return markets.map((m, idx) => {
      const history = allSessions.map(s => soldUnits(s.id, m.id, itemId))
      return { market: m, color: MARKET_COLORS[idx % MARKET_COLORS.length],
               light: MARKET_LIGHT[idx % MARKET_LIGHT.length], ...predictNextWeek(history) }
    })
  }, [markets, allSessions, soldUnits])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="text-center animate-slide-up">
          <div className="text-5xl mb-3 animate-bounce">📊</div>
          <p className="text-indigo-400 font-semibold">Loading data…</p>
        </div>
      </div>
    )
  }

  if (allSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-6 text-center animate-slide-up">
        <div className="text-7xl mb-6">📊</div>
        <h2 className="text-2xl font-black text-gray-700 mb-2">No data yet</h2>
        <p className="text-gray-400">Start a week and enter market data to see your dashboard.</p>
      </div>
    )
  }

  const activeMarketIdx  = markets.findIndex(m => m.id === activeMarket)
  const activeGradient   = MARKET_GRADIENTS[activeMarketIdx % MARKET_GRADIENTS.length]
  const summaryData      = activeMarket ? currentWeekSummary(activeMarket) : []
  const totalGiven       = summaryData.reduce((s, r) => s + r.given, 0)
  const totalSold        = summaryData.reduce((s, r) => s + r.sold, 0)
  const totalReturned    = summaryData.reduce((s, r) => s + r.returned, 0)
  const histData         = (activeMarket && activeItem) ? itemHistory(activeMarket, activeItem) : []
  const multiData        = activeItem ? multiMarketHistory(activeItem) : []
  const predData         = activeItem ? getPredictions(activeItem) : []

  const VIEWS = [
    { id: 'summary', label: 'This Week', emoji: '📋' },
    { id: 'history', label: 'History',   emoji: '📈' },
    { id: 'predict', label: 'Predict',   emoji: '🔮' },
  ]

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-4 pt-10 pb-6"
           style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }}>
        <h1 className="text-white text-3xl font-black mb-5">📊 Dashboard</h1>

        {/* View toggle */}
        <div className="flex gap-2 bg-white/10 rounded-2xl p-1">
          {VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all duration-200
                ${view === v.id ? 'bg-white text-indigo-700 shadow-md' : 'text-white/60 hover:text-white/80'}`}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── THIS WEEK ────────────────────────────────────────── */}
        {view === 'summary' && (
          <>
            {/* Market tabs */}
            <div className="flex gap-2 overflow-x-auto">
              {markets.map((m, i) => {
                const isActive = m.id === activeMarket
                return (
                  <button key={m.id} onClick={() => setActiveMarket(m.id)}
                    className={`flex-shrink-0 font-bold text-sm px-4 py-2 rounded-2xl
                                transition-all duration-200 active:scale-95
                      ${isActive
                        ? `bg-gradient-to-r ${MARKET_GRADIENTS[i % MARKET_GRADIENTS.length]} text-white shadow-lg market-tab-active`
                        : 'bg-white text-gray-500 shadow-sm'}`}>
                    {m.name}
                  </button>
                )
              })}
            </div>

            {/* Big stat cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Given',    value: totalGiven,    bg: 'bg-sky-50',     text: 'text-sky-600',     num: 'text-sky-700'    },
                { label: 'Returned', value: totalReturned, bg: 'bg-orange-50',  text: 'text-orange-500',  num: 'text-orange-600' },
                { label: 'Sold',     value: totalSold,     bg: 'bg-emerald-50', text: 'text-emerald-500', num: 'text-emerald-700'},
              ].map((s, i) => (
                <div key={s.label}
                     className={`${s.bg} rounded-3xl p-4 text-center animate-pop-in stagger-${i+1}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{s.label}</p>
                  <p className={`text-4xl font-black mt-1 ${s.num}`}>{s.value || '—'}</p>
                </div>
              ))}
            </div>

            {/* Per-item breakdown */}
            <div className="space-y-2">
              {summaryData.map((row, idx) => (
                row.given + row.sold + row.returned > 0 ? (
                  <div key={row.item.id}
                       className={`bg-white rounded-3xl shadow-sm border border-gray-50 p-4 animate-slide-up stagger-${Math.min(idx+1,5)}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-800">{row.item.name}</span>
                      <div className="flex gap-3 text-sm">
                        <span className="text-sky-600 font-bold">{row.given} <span className="text-gray-400 font-normal text-xs">given</span></span>
                        <span className="text-orange-500 font-bold">{row.returned} <span className="text-gray-400 font-normal text-xs">back</span></span>
                        <span className="text-emerald-600 font-black">{row.sold} <span className="text-gray-400 font-normal text-xs">sold</span></span>
                      </div>
                    </div>
                    {/* Visual sold bar */}
                    {row.given > 0 && (
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full transition-all duration-500"
                             style={{ width: `${Math.min(100, (row.sold / row.given) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                ) : null
              ))}
            </div>
          </>
        )}

        {/* ── HISTORY ──────────────────────────────────────────── */}
        {view === 'history' && (
          <>
            {/* Item picker */}
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Select Item</p>
              <div className="flex gap-2 flex-wrap">
                {items.map(item => (
                  <button key={item.id} onClick={() => setActiveItem(item.id)}
                    className={`px-3 py-1.5 rounded-2xl text-sm font-bold transition-all active:scale-95
                      ${activeItem === item.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500'}`}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-market area chart */}
            <div className="bg-white rounded-3xl shadow-sm p-4 border border-gray-50 animate-slide-up">
              <h3 className="font-black text-gray-800 mb-1">
                {items.find(i => i.id === activeItem)?.name}
              </h3>
              <p className="text-xs text-gray-400 mb-4">Weekly sales by market</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={multiData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    {markets.map((m, i) => (
                      <linearGradient key={m.id} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={MARKET_COLORS[i]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={MARKET_COLORS[i]} stopOpacity={0}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip content={<ChartTooltip />} />
                  {markets.map((m, i) => (
                    <Area key={m.id} type="monotone" dataKey={m.name}
                      stroke={MARKET_COLORS[i % MARKET_COLORS.length]}
                      fill={`url(#grad-${i})`}
                      strokeWidth={2.5} dot={{ r: 3, fill: MARKET_COLORS[i] }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Per-market stat cards */}
            <div className="space-y-3">
              {markets.map((m, i) => {
                const hist = allSessions.map(s =>
                  soldUnits(s.id, m.id, activeItem)
                ).filter(v => v > 0)
                if (!hist.length) return null
                const avg = Math.round(hist.reduce((a, b) => a + b, 0) / hist.length)
                return (
                  <div key={m.id}
                       className={`rounded-3xl overflow-hidden shadow-sm animate-slide-up stagger-${Math.min(i+1,5)}`}>
                    <div className={`bg-gradient-to-r ${MARKET_GRADIENTS[i % MARKET_GRADIENTS.length]} px-4 py-3`}>
                      <span className="text-white font-black text-base">{m.name}</span>
                      <span className="text-white/70 text-xs ml-2">{hist.length} weeks</span>
                    </div>
                    <div className="bg-white px-4 py-4 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-1">Min</p>
                        <p className="text-2xl font-black text-gray-600">{Math.min(...hist)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-1">Average</p>
                        <p className="text-2xl font-black text-indigo-600">{avg}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-1">Max</p>
                        <p className="text-2xl font-black text-emerald-600">{Math.max(...hist)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── PREDICT ──────────────────────────────────────────── */}
        {view === 'predict' && (
          <>
            {/* Item picker */}
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Select Item</p>
              <div className="flex gap-2 flex-wrap">
                {items.map(item => (
                  <button key={item.id} onClick={() => setActiveItem(item.id)}
                    className={`px-3 py-1.5 rounded-2xl text-sm font-bold transition-all active:scale-95
                      ${activeItem === item.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-500'}`}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-4 text-sm text-indigo-700 leading-relaxed">
              <strong>How predictions work:</strong> Weighted average of your last 8 weeks — recent weeks count more — with a 10% buffer so you don't run short.
            </div>

            <div className="space-y-4">
              {predData.map(({ market, color, light, predicted, avg, low, high }, i) => {
                const histFull = allSessions.map(s => ({
                  week: fmtDate(s.week_start),
                  sold: soldUnits(s.id, market.id, activeItem)
                }))
                const hasData = histFull.some(d => d.sold > 0)

                return (
                  <div key={market.id}
                       className={`rounded-3xl overflow-hidden shadow-md animate-slide-up stagger-${Math.min(i+1,5)}`}>
                    {/* Gradient header */}
                    <div className={`bg-gradient-to-r ${MARKET_GRADIENTS[i % MARKET_GRADIENTS.length]} p-4`}>
                      <div className="flex items-center justify-between">
                        <span className="text-white font-black text-lg">{market.name}</span>
                        {!hasData && (
                          <span className="text-white/80 text-xs bg-white/20 px-2 py-1 rounded-full">Need more data</span>
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="text-white/70 text-xs font-medium">Send next week</p>
                        <p className="text-white text-5xl font-black leading-tight">{predicted || '—'}</p>
                        <p className="text-white/70 text-xs">units recommended</p>
                      </div>
                    </div>

                    {/* Stats + mini chart */}
                    <div className="bg-white p-4">
                      {hasData && (
                        <>
                          <div className="grid grid-cols-3 gap-2 text-center mb-4">
                            <div style={{ background: light }} className="rounded-2xl py-2">
                              <p className="text-xs font-medium" style={{ color }}>Min</p>
                              <p className="text-xl font-black text-gray-700">{low}</p>
                            </div>
                            <div style={{ background: light }} className="rounded-2xl py-2">
                              <p className="text-xs font-medium" style={{ color }}>Avg</p>
                              <p className="text-xl font-black text-gray-700">{avg}</p>
                            </div>
                            <div style={{ background: light }} className="rounded-2xl py-2">
                              <p className="text-xs font-medium" style={{ color }}>Max</p>
                              <p className="text-xl font-black text-gray-700">{high}</p>
                            </div>
                          </div>
                          <ResponsiveContainer width="100%" height={80}>
                            <BarChart data={histFull.slice(-8)} margin={{ top: 0, right: 0, bottom: 0, left: -32 }}>
                              <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                              <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar dataKey="sold" fill={color} radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </>
                      )}
                      {!hasData && (
                        <p className="text-center text-gray-300 text-sm py-4">No sales recorded yet</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
