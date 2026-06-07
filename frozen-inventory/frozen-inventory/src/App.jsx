import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase.js'
import WeekSetup from './pages/WeekSetup.jsx'
import MarketInput from './pages/MarketInput.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const NAV = [
  { id: 'week',     label: 'Week',      emoji: '📦' },
  { id: 'markets',  label: 'Markets',   emoji: '🏪' },
  { id: 'dash',     label: 'Dashboard', emoji: '📊' },
  { id: 'settings', label: 'Settings',  emoji: '⚙️' },
]

function BottomNav({ active, setActive }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="glass border-t border-white/60 shadow-2xl shadow-indigo-100">
        <div className="flex">
          {NAV.map(n => {
            const isActive = active === n.id
            return (
              <button key={n.id} onClick={() => setActive(n.id)}
                className="flex-1 flex flex-col items-center py-3 relative transition-all duration-200">
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1
                                   rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 animate-pop-in" />
                )}
                <span className={`text-2xl leading-tight transition-transform duration-200
                  ${isActive ? 'scale-110' : 'scale-100 opacity-50'}`}>{n.emoji}</span>
                <span className={`text-xs font-semibold mt-0.5 transition-colors duration-200
                  ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>{n.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  const [page, setPage]                       = useState('week')
  const [items, setItems]                     = useState([])
  const [markets, setMarkets]                 = useState([])
  const [sizes, setSizes]                     = useState([])
  const [allSessions, setAllSessions]         = useState([])
  const [currentSession, setCurrentSession]   = useState(null)
  const [loading, setLoading]                 = useState(true)

  // Items now include their item_sizes join so components know which sizes each item has
  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('items')
      .select('*, item_sizes(size_id)')
      .eq('active', true)
      .order('display_order')
    setItems(data || [])
  }, [])

  const loadMarkets = useCallback(async () => {
    const { data } = await supabase.from('markets').select('*').eq('active', true).order('display_order')
    setMarkets(data || [])
  }, [])

  const loadSizes = useCallback(async () => {
    const { data } = await supabase.from('sizes').select('*').order('display_order')
    setSizes(data || [])
  }, [])

  const loadAllSessions = useCallback(async (keepSelected = false) => {
    const { data } = await supabase
      .from('weekly_sessions').select('*').order('week_start', { ascending: true })
    const sessions = data || []
    setAllSessions(sessions)
    if (!keepSelected) {
      setCurrentSession(sessions.length > 0 ? sessions[sessions.length - 1] : null)
    } else {
      setCurrentSession(prev =>
        prev ? (sessions.find(s => s.id === prev.id) ?? sessions[sessions.length - 1] ?? null) : null
      )
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadItems(), loadMarkets(), loadSizes(), loadAllSessions()])
      setLoading(false)
    }
    init()
  }, [loadItems, loadMarkets, loadSizes, loadAllSessions])

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase.channel('app-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' },           () => loadItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_sizes' },      () => loadItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' },         () => loadMarkets())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sizes' },           () => loadSizes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_sessions' }, () => loadAllSessions(true))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadItems, loadMarkets, loadSizes, loadAllSessions])

  const createSession = useCallback(async (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    const day = d.getDay()
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
    const weekStart = d.toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('weekly_sessions')
      .upsert({ week_start: weekStart }, { onConflict: 'week_start' })
      .select().single()
    if (error) { alert('Error creating week: ' + error.message); return null }

    // ── Carry over "now" inventory from the most recent prior session ──────────
    // Only carry over if this session has no starting_inventory yet (i.e. it's brand new)
    const { data: existingInv } = await supabase
      .from('starting_inventory').select('id').eq('session_id', data.id).limit(1)

    if (!existingInv || existingInv.length === 0) {
      // Find the most recent session that existed before this new week
      const priorSession = [...allSessions]
        .filter(s => s.week_start < weekStart)
        .sort((a, b) => b.week_start.localeCompare(a.week_start))[0]

      if (priorSession) {
        // Load prior week's starting inventory and transactions in parallel
        const [{ data: startInv }, { data: txns }] = await Promise.all([
          supabase.from('starting_inventory').select('item_id, size_id, qty').eq('session_id', priorSession.id),
          supabase.from('market_transactions').select('item_id, size_id, given, returned, restock').eq('session_id', priorSession.id),
        ])

        // Build start map: { itemId: { sizeId: qty } }
        const startMap = {}
        for (const row of startInv || []) {
          if (!startMap[row.item_id]) startMap[row.item_id] = {}
          startMap[row.item_id][row.size_id] = row.qty
        }

        // Accumulate sold & restock per item+size across all markets
        const txnMap = {}
        for (const row of txns || []) {
          if (!txnMap[row.item_id]) txnMap[row.item_id] = {}
          if (!txnMap[row.item_id][row.size_id]) txnMap[row.item_id][row.size_id] = { sold: 0, restock: 0 }
          txnMap[row.item_id][row.size_id].sold    += Math.max(0, (row.given || 0) - (row.returned || 0))
          txnMap[row.item_id][row.size_id].restock += (row.restock || 0)
        }

        // nowQty = start - sold + restock  (floor at 0)
        const carryRows = []
        for (const itemId of Object.keys(startMap)) {
          for (const sizeId of Object.keys(startMap[itemId])) {
            const startQty = startMap[itemId][sizeId] || 0
            const sold     = txnMap[itemId]?.[sizeId]?.sold    || 0
            const restock  = txnMap[itemId]?.[sizeId]?.restock || 0
            const nowQty   = Math.max(0, startQty - sold + restock)
            carryRows.push({ session_id: data.id, item_id: itemId, size_id: sizeId, qty: nowQty })
          }
        }
        if (carryRows.length > 0) {
          await supabase.from('starting_inventory').insert(carryRows)
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    await loadAllSessions(false)
    setCurrentSession(data)
    return data
  }, [loadAllSessions, allSessions])

  const goToPrevSession = useCallback(() => {
    const idx = allSessions.findIndex(s => s.id === currentSession?.id)
    if (idx > 0) setCurrentSession(allSessions[idx - 1])
  }, [allSessions, currentSession])

  const goToNextSession = useCallback(() => {
    const idx = allSessions.findIndex(s => s.id === currentSession?.id)
    if (idx < allSessions.length - 1) setCurrentSession(allSessions[idx + 1])
  }, [allSessions, currentSession])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}>
        <div className="text-center animate-slide-up">
          <div className="text-7xl mb-4 animate-bounce">❄️</div>
          <p className="text-indigo-400 font-semibold text-lg">Loading inventory…</p>
        </div>
      </div>
    )
  }

  const ctx = {
    items, setItems, loadItems,
    markets, setMarkets, loadMarkets,
    sizes, loadSizes,
    allSessions,
    currentSession, setCurrentSession,
    loadAllSessions,
    createSession,
    goToPrevSession, goToNextSession,
  }

  const pages = {
    week:     <WeekSetup />,
    markets:  <MarketInput />,
    dash:     <Dashboard />,
    settings: <Settings />,
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #ecfdf5 100%)' }}>
        <div className="pb-24 max-w-lg mx-auto">
          {pages[page]}
        </div>
        <BottomNav active={page} setActive={setPage} />
      </div>
    </AppContext.Provider>
  )
}
