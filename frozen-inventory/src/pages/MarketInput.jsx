import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import WeekNavigator from '../components/WeekNavigator.jsx'

function getMondayOfWeek(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// Module-level so both ItemCard and getRemainingBySize can use it
function calcSold(given, returned, pastWeek) {
  return pastWeek
    ? Math.max(0, given - returned)
    : (returned > 0 ? Math.max(0, given - returned) : 0)
}

const MARKET_GRADIENTS = [
  'from-sky-500 to-cyan-400',
  'from-violet-500 to-purple-400',
  'from-emerald-500 to-teal-400',
  'from-rose-500 to-pink-400',
  'from-amber-500 to-orange-400',
]

const SIZE_LABEL_COLORS = [
  'text-indigo-400',
  'text-violet-400',
  'text-sky-400',
  'text-rose-400',
  'text-amber-400',
]

function useDebounce(fn, delay = 600) {
  const timer = useRef(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fnRef.current(...args), delay)
  }, [delay])
}

// ── Animated sold number ───────────────────────────────────────────────────────
function SoldBadge({ value }) {
  const [key, setKey] = useState(0)
  const prev = useRef(value)
  useLayoutEffect(() => {
    if (value !== prev.current) { setKey(k => k + 1); prev.current = value }
  }, [value])
  if (value === null) return <span className="font-black text-gray-300 text-base">—</span>
  if (value === 0)    return <span className="font-black text-gray-400 text-base">0</span>
  return <span key={key} className="font-black text-emerald-500 text-base sold-flash">{value}</span>
}

// ── Remaining stock badge ──────────────────────────────────────────────────────
function StockLeft({ qty }) {
  if (qty === undefined || qty === null) return null
  const cls = qty <= 0
    ? 'bg-rose-50 text-rose-600'
    : qty < 5
      ? 'bg-amber-50 text-amber-600'
      : 'bg-emerald-50 text-emerald-600'
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${cls}`}>
      {qty} left
    </span>
  )
}

// ── Allocated-to-other-markets badge ──────────────────────────────────────────
function AllocatedBadge({ qty }) {
  if (!qty) return null
  return (
    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-500">
      {qty} out
    </span>
  )
}

// ── Tiny stepper ───────────────────────────────────────────────────────────────
function MiniStepper({ label, value, onChange, accent }) {
  const styles = {
    blue:   { label: 'text-sky-500',    btn: 'bg-sky-100 text-sky-600',       num: 'text-sky-700'    },
    orange: { label: 'text-orange-500', btn: 'bg-orange-100 text-orange-600', num: 'text-orange-700' },
    purple: { label: 'text-purple-500', btn: 'bg-purple-100 text-purple-600', num: 'text-purple-700' },
  }
  const s = styles[accent] || styles.blue
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-[10px] font-bold uppercase ${s.label}`}>{label}</span>
      <div className="flex items-center gap-0.5">
        <button onPointerDown={() => onChange(Math.max(0, value - 1))}
          className={`stepper-btn w-6 h-6 rounded-md text-sm font-bold flex items-center justify-center select-none ${s.btn}`}>−</button>
        <input
          type="number" inputMode="numeric" min="0"
          value={value === 0 ? '' : value} placeholder="0"
          onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className={`w-8 text-center font-bold text-sm bg-transparent border-none outline-none ${s.num}`}
        />
        <button onPointerDown={() => onChange(value + 1)}
          className={`stepper-btn w-6 h-6 rounded-md text-sm font-bold flex items-center justify-center select-none ${s.btn}`}>+</button>
      </div>
    </div>
  )
}

// ── Item card ──────────────────────────────────────────────────────────────────
// remainingBySize:  { [sizeId]: number } — remaining stock across all markets
// allocatedBySize:  { [sizeId]: number } — given to OTHER markets this week
function ItemCard({ item, itemSizes, txnBySize, onUpdate, index, isPastWeek, remainingBySize, allocatedBySize }) {
  // Total sold badge across all sizes (only non-null when any given > 0)
  let totalGiven = 0, totalSold = 0
  for (const size of itemSizes) {
    const t = txnBySize[size.id] || {}
    totalGiven += t.given || 0
    totalSold  += calcSold(t.given || 0, t.returned || 0, isPastWeek)
  }
  const badgeValue = totalGiven > 0 ? totalSold : null

  // Total remaining + total allocated for the item header
  const hasRemaining = itemSizes.some(sz => remainingBySize[sz.id] !== undefined)
  const totalRemaining = hasRemaining
    ? itemSizes.reduce((s, sz) => s + (remainingBySize[sz.id] ?? 0), 0)
    : null
  const totalAllocated = itemSizes.reduce((s, sz) => s + (allocatedBySize[sz.id] || 0), 0)

  return (
    <div className={`animate-slide-up stagger-${Math.min(index + 1, 5)}
                     bg-white rounded-2xl border border-gray-100 px-3 py-2.5`}>
      {/* Name + sold + remaining + allocated */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold text-gray-800 text-sm">{item.name}</span>
        <div className="flex items-center gap-2">
          {totalRemaining !== null && (
            <StockLeft qty={totalRemaining} />
          )}
          {totalAllocated > 0 && (
            <AllocatedBadge qty={totalAllocated} />
          )}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">sold</span>
            <SoldBadge value={badgeValue} />
          </div>
        </div>
      </div>

      {/* One row per size: label | Given | Returned | → sold | left | out */}
      {itemSizes.map((size, si) => {
        const t        = txnBySize[size.id] || {}
        const given    = t.given    || 0
        const returned = t.returned || 0
        const restock  = t.restock  || 0
        const sold     = calcSold(given, returned, isPastWeek)
        const labelColor = SIZE_LABEL_COLORS[si % SIZE_LABEL_COLORS.length]
        const remaining  = remainingBySize[size.id]
        const allocated  = allocatedBySize[size.id] || 0

        return (
          <div key={size.id} className="mb-1.5 last:mb-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold w-10 shrink-0 ${labelColor}`}>{size.name}</span>
              <MiniStepper label="Given" value={given}
                onChange={v => onUpdate(size.id, 'given', v)} accent="blue" />
              <MiniStepper label="Returned" value={returned}
                onChange={v => onUpdate(size.id, 'returned', v)} accent="orange" />
              <div className="ml-auto flex items-center gap-1.5">
                {sold > 0 && (
                  <span className="text-xs font-bold text-emerald-500">→ {sold}</span>
                )}
                {remaining !== undefined && (
                  <StockLeft qty={remaining} />
                )}
                {allocated > 0 && (
                  <AllocatedBadge qty={allocated} />
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Restock — one stepper per size */}
      {itemSizes.some((size) => (txnBySize[size.id]?.restock || 0) > 0 || true) && (
        <div className="flex items-center gap-3 pt-1.5 border-t border-gray-100 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">Restock</span>
          {itemSizes.map((size, si) => {
            const t = txnBySize[size.id] || {}
            const labelColor = SIZE_LABEL_COLORS[si % SIZE_LABEL_COLORS.length]
            return (
              <div key={size.id} className="flex items-center gap-1">
                <span className={`text-[10px] font-bold ${labelColor}`}>{size.name}</span>
                <MiniStepper label="" value={t.restock || 0}
                  onChange={v => onUpdate(size.id, 'restock', v)} accent="purple" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── MarketInput Page ───────────────────────────────────────────────────────────
export default function MarketInput() {
  const { items, sizes, markets, currentSession } = useApp()
  const [activeMarket, setActiveMarket] = useState(null)
  // txns: { marketId: { itemId: { sizeId: { given, returned, restock } } } }
  const [txns, setTxns]         = useState({})
  // startInv: { itemId: { sizeId: qty } }
  const [startInv, setStartInv] = useState({})
  const [saveStatus, setSaveStatus] = useState('idle')

  const getItemSizes = useCallback((item) =>
    sizes.filter(s => (item.item_sizes || []).some(is => is.size_id === s.id)),
  [sizes])

  useEffect(() => {
    if (markets.length && !activeMarket) setActiveMarket(markets[0].id)
  }, [markets, activeMarket])

  const loadTxns = useCallback(async () => {
    if (!currentSession?.id) return
    const { data } = await supabase.from('market_transactions').select('*').eq('session_id', currentSession.id)
    const map = {}
    for (const row of data || []) {
      if (!map[row.market_id]) map[row.market_id] = {}
      if (!map[row.market_id][row.item_id]) map[row.market_id][row.item_id] = {}
      map[row.market_id][row.item_id][row.size_id] = row
    }
    setTxns(map)
  }, [currentSession?.id])

  const loadStartInv = useCallback(async () => {
    if (!currentSession?.id) { setStartInv({}); return }
    const { data } = await supabase
      .from('starting_inventory')
      .select('item_id, size_id, qty')
      .eq('session_id', currentSession.id)
    const map = {}
    for (const row of data || []) {
      if (!map[row.item_id]) map[row.item_id] = {}
      map[row.item_id][row.size_id] = row.qty
    }
    setStartInv(map)
  }, [currentSession?.id])

  useEffect(() => { loadTxns(); loadStartInv() }, [loadTxns, loadStartInv])

  useEffect(() => {
    if (!currentSession?.id) return
    const ch = supabase.channel('market-v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_transactions' }, () => loadTxns())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'starting_inventory' }, () => loadStartInv())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [currentSession?.id, loadTxns, loadStartInv])

  const saveRow = useCallback(async (marketId, itemId, sizeId, values) => {
    if (!currentSession?.id) return
    setSaveStatus('saving')
    const { error } = await supabase.from('market_transactions').upsert({
      session_id: currentSession.id,
      market_id:  marketId,
      item_id:    itemId,
      size_id:    sizeId,
      given:      values.given   || 0,
      returned:   values.returned || 0,
      restock:    values.restock  || 0,
    }, { onConflict: 'session_id,market_id,item_id,size_id' })
    setSaveStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setSaveStatus('idle'), 1500)
  }, [currentSession?.id])

  const debouncedSave = useDebounce(saveRow, 700)

  const updateTxn = (marketId, itemId, sizeId, field, value) => {
    setTxns(prev => {
      const existing = prev[marketId]?.[itemId]?.[sizeId] || {}
      return {
        ...prev,
        [marketId]: {
          ...prev[marketId],
          [itemId]: {
            ...prev[marketId]?.[itemId],
            [sizeId]: { ...existing, [field]: value },
          },
        },
      }
    })
    const existing = txns[marketId]?.[itemId]?.[sizeId] || {}
    debouncedSave(marketId, itemId, sizeId, { ...existing, [field]: value })
  }

  // ── Remaining inventory per item (across ALL markets) ─────────────────────
  // remaining = startQty - totalSoldAllMarkets + totalRestockAllMarkets
  const getRemaining = useCallback((itemId, sizeId, pastWeek) => {
    const startQty = startInv[itemId]?.[sizeId]
    if (startQty === undefined) return undefined  // no starting inventory set
    let totalSold = 0, totalRestock = 0
    for (const marketId of Object.keys(txns)) {
      const t = txns[marketId]?.[itemId]?.[sizeId] || {}
      totalSold    += calcSold(t.given || 0, t.returned || 0, pastWeek)
      totalRestock += t.restock || 0
    }
    return startQty - totalSold + totalRestock
  }, [startInv, txns])

  // ── Given to OTHER markets (not the currently active one) ─────────────────
  const getAllocatedElsewhere = useCallback((itemId, sizeId, excludeMarketId) => {
    let total = 0
    for (const [marketId, marketTxns] of Object.entries(txns)) {
      if (marketId === String(excludeMarketId)) continue
      total += marketTxns[itemId]?.[sizeId]?.given || 0
    }
    return total
  }, [txns])

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    const market = markets.find(m => m.id === activeMarket)
    if (!market) return

    const weekLabel = currentSession?.week_start
      ? new Date(currentSession.week_start + 'T00:00:00')
          .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : ''

    const rows = items.map(item => {
      const itemSizes = getItemSizes(item)
      const cells = sizes.map(size => {
        if (!itemSizes.find(s => s.id === size.id)) return '<td class="num"></td><td class="num"></td><td class="num sold"></td>'
        const t = txns[activeMarket]?.[item.id]?.[size.id] || {}
        const g = t.given || 0, r = t.returned || 0
        const s = r > 0 ? Math.max(0, g - r) : 0
        const c = v => v > 0 ? v : ''
        return `<td class="num">${c(g)}</td><td class="num">${c(r)}</td><td class="num sold">${c(s)}</td>`
      }).join('')
      return `<tr><td class="item-name">${item.name}</td>${cells}</tr>`
    }).join('')

    const sizeColHeaders = sizes.map(s => `<th colspan="3">${s.name}</th>`).join('')
    const subHeaders = sizes.map(() => `<th>Given</th><th>Back</th><th>Sold</th>`).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>${market.name} — Inventory</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; color: #111; }
.top-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
.week-label { font-size: 11px; color: #555; }
.market-name { font-size: 20px; font-weight: 900; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #111; padding: 5px 8px; text-align: center; }
th { font-weight: 700; background: #f5f5f5; }
td.item-name { text-align: left; font-weight: 700; font-size: 13px; min-width: 130px; }
td.num { min-width: 40px; font-size: 13px; }
td.sold { background: #f0faf4; }
.section-header th { background: #e8e8e8; font-size: 12px; }
@media print { body { padding: 12px; } @page { margin: 1cm; } }
</style></head><body>
<div class="top-header">
  <div class="week-label">Week of ${weekLabel}</div>
  <div class="market-name">${market.name}</div>
</div>
<table>
  <thead>
    <tr class="section-header"><th rowspan="2" style="text-align:left">Item</th>${sizeColHeaders}</tr>
    <tr class="section-header">${subHeaders}</tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`

    const win = window.open('', '_blank', 'width=900,height=600')
    win.document.write(html)
    win.document.close()
  }

  // ── Market totals ─────────────────────────────────────────────────────────
  const getMarketTotals = (marketId, pastWeek) => {
    let given = 0, returned = 0, sold = 0
    for (const item of items) {
      for (const size of getItemSizes(item)) {
        const t = txns[marketId]?.[item.id]?.[size.id] || {}
        const g = t.given || 0, r = t.returned || 0
        given    += g
        returned += r
        sold     += calcSold(g, r, pastWeek)
      }
    }
    return { given, returned, sold }
  }

  if (!currentSession) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-6">
        <div className="text-6xl mb-4">🏪</div>
        <h2 className="text-xl font-black text-gray-700 mb-2">No active week</h2>
        <p className="text-gray-400 text-sm">Go to Week tab to start a new week first.</p>
      </div>
    )
  }

  const isPastWeek = !!currentSession?.week_start && currentSession.week_start < getMondayOfWeek()
  const activeIdx  = markets.findIndex(m => m.id === activeMarket)
  const gradient   = MARKET_GRADIENTS[activeIdx % MARKET_GRADIENTS.length]
  const totals     = activeMarket ? getMarketTotals(activeMarket, isPastWeek) : null

  const statusEl = {
    saving: <span className="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">Saving…</span>,
    saved:  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full animate-pop-in">✓ Saved</span>,
    error:  <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">⚠ Error</span>,
    idle:   null,
  }[saveStatus]

  return (
    <div>
      {/* ── Compact header ─────────────────────────────────────── */}
      <div className={`px-4 pt-8 pb-3 bg-gradient-to-br ${gradient}`}>
        <div className="flex items-center justify-between mb-2.5">
          <h1 className="text-white text-xl font-black">🏪 Markets</h1>
          <div className="flex items-center gap-2">
            {statusEl}
            <button
              onClick={handlePrint}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/20
                         active:bg-white/30 transition-all active:scale-90 select-none"
              title="Print inventory sheet"
            >🖨️</button>
          </div>
        </div>

        <div className="mb-2.5"><WeekNavigator /></div>

        {/* Market tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {markets.map(m => (
            <button key={m.id} onClick={() => setActiveMarket(m.id)}
              className={`flex-shrink-0 font-bold text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95
                ${m.id === activeMarket
                  ? 'bg-white text-gray-800 shadow market-tab-active'
                  : 'bg-white/20 text-white'}`}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Totals strip ──────────────────────────────────────── */}
      {totals && (
        <div className="mx-3 -mt-3 rounded-2xl bg-white shadow border border-gray-50 px-4 py-2 mb-3 animate-pop-in">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-sky-600 font-black text-lg leading-tight">{totals.given || '—'}</p>
              <p className="text-xs text-gray-400">Given</p>
            </div>
            <div className="w-px bg-gray-100"/>
            <div>
              <p className="text-orange-500 font-black text-lg leading-tight">{totals.returned || '—'}</p>
              <p className="text-xs text-gray-400">Returned</p>
            </div>
            <div className="w-px bg-gray-100"/>
            <div>
              <p className="text-emerald-500 font-black text-lg leading-tight">{totals.sold || '—'}</p>
              <p className="text-xs text-gray-400">Sold</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Item cards ────────────────────────────────────────── */}
      <div className="px-3 space-y-1.5 pb-3">
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-sm font-semibold">No items — add in Settings ⚙️</p>
          </div>
        ) : items.map((item, idx) => {
          const itemSizes = getItemSizes(item)
          // Build remainingBySize for this item (across all markets)
          const remainingBySize = {}
          for (const size of itemSizes) {
            const r = getRemaining(item.id, size.id, isPastWeek)
            if (r !== undefined) remainingBySize[size.id] = r
          }
          // Build allocatedBySize — given to OTHER markets this week
          const allocatedBySize = {}
          for (const size of itemSizes) {
            const a = getAllocatedElsewhere(item.id, size.id, activeMarket)
            if (a > 0) allocatedBySize[size.id] = a
          }
          return (
            <ItemCard
              key={item.id}
              item={item}
              itemSizes={itemSizes}
              txnBySize={txns[activeMarket]?.[item.id] || {}}
              onUpdate={(sizeId, field, value) => updateTxn(activeMarket, item.id, sizeId, field, value)}
              index={idx}
              isPastWeek={isPastWeek}
              remainingBySize={remainingBySize}
              allocatedBySize={allocatedBySize}
            />
          )
        })}
      </div>
    </div>
  )
}
