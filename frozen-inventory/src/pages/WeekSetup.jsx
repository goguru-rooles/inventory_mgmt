import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import WeekNavigator from '../components/WeekNavigator.jsx'

function getMondayOfWeek(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Color palette cycling per size index
const SIZE_COLORS = [
  { btn: 'bg-indigo-100 text-indigo-600 active:bg-indigo-200', num: 'text-indigo-700', label: 'text-indigo-400' },
  { btn: 'bg-violet-100 text-violet-600 active:bg-violet-200', num: 'text-violet-700', label: 'text-violet-400' },
  { btn: 'bg-sky-100 text-sky-600 active:bg-sky-200',          num: 'text-sky-700',    label: 'text-sky-400'   },
  { btn: 'bg-rose-100 text-rose-600 active:bg-rose-200',       num: 'text-rose-700',   label: 'text-rose-400'  },
  { btn: 'bg-amber-100 text-amber-600 active:bg-amber-200',    num: 'text-amber-700',  label: 'text-amber-400' },
]

// ── Compact inline stepper ─────────────────────────────────────────────────────
function Stepper({ value, onChange, colors }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onPointerDown={() => onChange(Math.max(0, value - 1))}
        className={`stepper-btn w-7 h-7 rounded-lg font-bold text-base flex items-center justify-center select-none ${colors.btn}`}
      >−</button>
      <input
        type="number" inputMode="numeric" min="0"
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className={`w-9 text-center font-bold text-sm bg-transparent border-none outline-none ${colors.num}`}
      />
      <button
        onPointerDown={() => onChange(value + 1)}
        className={`stepper-btn w-7 h-7 rounded-lg font-bold text-base flex items-center justify-center select-none ${colors.btn}`}
      >+</button>
    </div>
  )
}

// ── Item row ───────────────────────────────────────────────────────────────────
function ItemRow({ item, itemSizes, startQty, currentQty, onChange, index }) {
  const stockBadge = (qty) => {
    if (qty < 0) return 'text-rose-600 bg-rose-50'
    if (qty < 5) return 'text-amber-600 bg-amber-50'
    return 'text-emerald-600 bg-emerald-50'
  }

  return (
    <div className={`animate-slide-up stagger-${Math.min(index + 1, 5)}
                     bg-white rounded-2xl border border-gray-100 px-3 py-2.5`}>
      {/* Name + current stock badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-gray-800 text-sm flex-1 min-w-0 truncate">{item.name}</span>
        <div className="flex gap-1">
          {itemSizes.map(size => (
            <span key={size.id} className={`text-xs font-bold px-2 py-0.5 rounded-full ${stockBadge(currentQty(size.id))}`}>
              {currentQty(size.id)} now
            </span>
          ))}
        </div>
      </div>

      {/* Steppers — one per size */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {itemSizes.map((size, si) => {
          const colors = SIZE_COLORS[si % SIZE_COLORS.length]
          return (
            <div key={size.id} className="flex items-center gap-1.5">
              <span className={`text-xs font-bold w-10 ${colors.label}`}>{size.name}</span>
              <Stepper
                value={startQty(size.id)}
                onChange={v => onChange(size.id, v)}
                colors={colors}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── WeekSetup Page ─────────────────────────────────────────────────────────────
export default function WeekSetup() {
  const { items, sizes, currentSession, createSession, allSessions, loadAllSessions } = useApp()
  const [inventory, setInventory] = useState({})  // { itemId: { sizeId: qty } }
  const [computed, setComputed]   = useState({})  // { itemId: { sizeId: { sold, restock } } }
  const [saving, setSaving]       = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]   = useState(false)

  const getItemSizes = useCallback((item) =>
    sizes.filter(s => (item.item_sizes || []).some(is => is.size_id === s.id)),
  [sizes])

  const deleteWeek = async () => {
    if (!currentSession?.id) return
    setDeleting(true)
    const sid = currentSession.id
    await supabase.from('market_transactions').delete().eq('session_id', sid)
    await supabase.from('starting_inventory').delete().eq('session_id', sid)
    await supabase.from('weekly_sessions').delete().eq('id', sid)
    setShowDeleteConfirm(false)
    setDeleting(false)
    await loadAllSessions(false)
  }

  const loadInventory = useCallback(async (sessionId) => {
    if (!sessionId) { setInventory({}); return }
    const { data } = await supabase.from('starting_inventory').select('*').eq('session_id', sessionId)
    const map = {}
    for (const row of data || []) {
      if (!map[row.item_id]) map[row.item_id] = {}
      map[row.item_id][row.size_id] = row.qty
    }
    setInventory(map)
    setDirty(false)
  }, [])

  const loadComputed = useCallback(async (sessionId, pastWeek) => {
    if (!sessionId) { setComputed({}); return }
    const { data } = await supabase.from('market_transactions')
      .select('item_id, size_id, given, returned, restock')
      .eq('session_id', sessionId)
    const map = {}
    for (const row of data || []) {
      if (!map[row.item_id]) map[row.item_id] = {}
      if (!map[row.item_id][row.size_id]) map[row.item_id][row.size_id] = { sold: 0, restock: 0 }
      const sold = pastWeek
        ? Math.max(0, (row.given || 0) - (row.returned || 0))
        : (row.returned > 0 ? Math.max(0, (row.given || 0) - row.returned) : 0)
      map[row.item_id][row.size_id].sold    += sold
      map[row.item_id][row.size_id].restock += (row.restock || 0)
    }
    setComputed(map)
  }, [])

  const isPastWeek = !!currentSession?.week_start && currentSession.week_start < getMondayOfWeek()

  useEffect(() => {
    loadInventory(currentSession?.id)
    loadComputed(currentSession?.id, isPastWeek)
  }, [currentSession, loadInventory, loadComputed])

  useEffect(() => {
    if (!currentSession?.id) return
    const ch = supabase.channel('week-txn-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_transactions' },
        () => loadComputed(currentSession.id, isPastWeek))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [currentSession?.id, loadComputed, isPastWeek])

  const updateQty = (itemId, sizeId, value) => {
    setInventory(prev => ({ ...prev, [itemId]: { ...prev[itemId], [sizeId]: value } }))
    setDirty(true)
  }

  const saveInventory = async () => {
    if (!currentSession?.id) return
    setSaving(true)
    const rows = []
    for (const item of items) {
      for (const size of getItemSizes(item)) {
        rows.push({ session_id: currentSession.id, item_id: item.id, size_id: size.id, qty: inventory[item.id]?.[size.id] || 0 })
      }
    }
    await supabase.from('starting_inventory').delete().eq('session_id', currentSession.id)
    const { error } = rows.length > 0 ? await supabase.from('starting_inventory').insert(rows) : { error: null }
    if (error) alert('Error saving: ' + error.message)
    else setDirty(false)
    setSaving(false)
  }

  const currentQty = (itemId, sizeId) =>
    (inventory[itemId]?.[sizeId]         || 0) -
    (computed[itemId]?.[sizeId]?.sold    || 0) +
    (computed[itemId]?.[sizeId]?.restock || 0)

  const totalStart   = items.reduce((s, i) => s + getItemSizes(i).reduce((ss, sz) => ss + (inventory[i.id]?.[sz.id] || 0), 0), 0)
  const totalSold    = items.reduce((s, i) => s + getItemSizes(i).reduce((ss, sz) => ss + (computed[i.id]?.[sz.id]?.sold || 0), 0), 0)
  const totalCurrent = items.reduce((s, i) => s + getItemSizes(i).reduce((ss, sz) => ss + currentQty(i.id, sz.id), 0), 0)

  return (
    <div>
      {/* ── Compact gradient header ───────────────────────────── */}
      <div className="px-4 pt-8 pb-4"
           style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white text-xl font-black">❄️ Inventory</h1>
          <div className="flex gap-2">
            {currentSession && dirty && (
              <button onClick={saveInventory} disabled={saving}
                className="bg-emerald-400 text-white font-bold text-xs px-3 py-1.5 rounded-xl
                           shadow active:scale-95 transition-transform disabled:opacity-50">
                {saving ? '…' : '✓ Save'}
              </button>
            )}
            {currentSession && (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15
                           active:bg-rose-400/60 transition-all active:scale-90 text-white/70
                           active:text-white"
                title="Delete this week">
                🗑️
              </button>
            )}
          </div>
        </div>

        <WeekNavigator />

        {currentSession && (
          <div className="flex gap-2 mt-3">
            {[
              { label: 'Started',  value: totalStart,   bg: 'bg-white/20' },
              { label: 'Sold',     value: totalSold,    bg: 'bg-emerald-400/30' },
              { label: 'In Stock', value: totalCurrent, bg: 'bg-white/20' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl px-3 py-1.5 text-center flex-1`}>
                <p className="text-white/70 text-xs">{s.label}</p>
                <p className="text-white text-lg font-black leading-tight">{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Item list ─────────────────────────────────────────── */}
      <div className="px-3 py-3">
        {!currentSession ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-slide-up">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-black text-gray-700 mb-2">No weeks yet</h2>
            <p className="text-gray-400 text-sm">Tap the <strong>+</strong> button above to create your first week.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📋</div>
            <p className="font-semibold text-sm">No items — add in Settings ⚙️</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                itemSizes={getItemSizes(item)}
                index={idx}
                startQty={sizeId => inventory[item.id]?.[sizeId] || 0}
                currentQty={sizeId => currentQty(item.id, sizeId)}
                onChange={(sizeId, val) => updateQty(item.id, sizeId, val)}
              />
            ))}
            {dirty && (
              <p className="text-center text-amber-500 text-xs font-medium pt-1">
                ⚠️ Unsaved changes — tap Save
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Delete week confirmation modal ────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 animate-pop-in"
             onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg px-6 pt-5 shadow-2xl"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
               onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
            <div className="flex items-center gap-4 mb-5">
              <div className="text-4xl">🗑️</div>
              <div>
                <h3 className="font-black text-gray-900 text-lg leading-tight">Delete this week?</h3>
                <p className="text-gray-500 text-sm">Week of <strong>{formatWeekLabel(currentSession?.week_start)}</strong></p>
                <p className="text-rose-500 text-xs mt-0.5">Permanently deletes all market data for this week.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl
                           active:scale-95 transition-transform disabled:opacity-50">
                Cancel
              </button>
              <button onClick={deleteWeek} disabled={deleting}
                className="flex-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold
                           py-3.5 rounded-2xl shadow-lg shadow-rose-200 active:scale-95
                           transition-transform disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete Week'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
