import React, { useState } from 'react'
import ImportModal from '../components/ImportModal.jsx'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'

// ── Three-line drag handle ─────────────────────────────────────────────────────
function DragHandle(props) {
  return (
    <div
      {...props}
      className="flex flex-col justify-center gap-[5px] px-2 py-3 cursor-grab active:cursor-grabbing touch-none select-none"
      aria-label="Drag to reorder"
    >
      <span className="block w-5 h-[2px] bg-gray-300 rounded-full"/>
      <span className="block w-5 h-[2px] bg-gray-300 rounded-full"/>
      <span className="block w-5 h-[2px] bg-gray-300 rounded-full"/>
    </div>
  )
}

// ── Confirm delete modal ───────────────────────────────────────────────────────
function ConfirmModal({ name, subtitle, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 animate-pop-in"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6"/>
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🗑️</div>
          <h3 className="font-black text-gray-900 text-xl">Delete "{name}"?</h3>
          {subtitle && <p className="text-gray-400 text-sm mt-2">{subtitle}</p>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold
                       py-3.5 rounded-2xl shadow-lg shadow-rose-200 active:scale-95 transition-transform"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function SizeToggle({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-xl text-xs font-black border-2 transition-all duration-200 active:scale-90
        ${active
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200'
          : 'bg-white border-gray-200 text-gray-400'}`}
    >
      {label}
    </button>
  )
}

// ── Sortable item row ──────────────────────────────────────────────────────────
function SortableItemRow({ item, sizes, onDelete, onToggleSize }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.75 : 1,
  }

  const itemSizeIds = new Set((item.item_sizes || []).map(is => is.size_id))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border flex items-center gap-1.5 pr-2
                  transition-shadow duration-200
                  ${isDragging
                    ? 'shadow-xl shadow-indigo-200 border-indigo-200 scale-[1.02]'
                    : 'shadow-sm border-gray-100'}`}
    >
      <DragHandle {...attributes} {...listeners} />
      <span className="flex-1 font-semibold text-gray-800 py-3 text-sm">{item.name}</span>
      <div className="flex gap-1 flex-wrap justify-end max-w-[160px]">
        {sizes.map(size => (
          <SizeToggle
            key={size.id}
            active={itemSizeIds.has(size.id)}
            label={size.name}
            onClick={() => onToggleSize(item, size.id)}
          />
        ))}
      </div>
      <button onClick={() => onDelete(item)}
        className="text-gray-300 active:text-rose-500 transition-colors text-xl pl-1.5 py-3">×</button>
    </div>
  )
}

// ── Sortable market row ────────────────────────────────────────────────────────
function SortableMarketRow({ market, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: market.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.75 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border flex items-center gap-1.5 pr-2
                  transition-shadow duration-200
                  ${isDragging
                    ? 'shadow-xl shadow-indigo-200 border-indigo-200 scale-[1.02]'
                    : 'shadow-sm border-gray-100'}`}
    >
      <DragHandle {...attributes} {...listeners} />
      <span className="flex-1 font-semibold text-gray-800 py-3 text-sm">{market.name}</span>
      <button onClick={() => onDelete(market)}
        className="text-gray-300 active:text-rose-500 transition-colors text-xl pl-1.5 py-3">×</button>
    </div>
  )
}

// ── Sortable size row ──────────────────────────────────────────────────────────
function SortableSizeRow({ size, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: size.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.75 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-2xl border flex items-center gap-1.5 pr-2
                  transition-shadow duration-200
                  ${isDragging
                    ? 'shadow-xl shadow-indigo-200 border-indigo-200 scale-[1.02]'
                    : 'shadow-sm border-gray-100'}`}
    >
      <DragHandle {...attributes} {...listeners} />
      <span className="flex-1 font-semibold text-gray-800 py-3 text-sm">{size.name}</span>
      <button onClick={() => onDelete(size)}
        className="text-gray-300 active:text-rose-500 transition-colors text-xl pl-1.5 py-3">×</button>
    </div>
  )
}

// ── Settings Page ──────────────────────────────────────────────────────────────
export default function Settings() {
  const { items, markets, sizes, loadItems, loadMarkets, loadSizes } = useApp()

  const [newItemName, setNewItemName]       = useState('')
  const [newItemSizeIds, setNewItemSizeIds] = useState([])
  const [newMarketName, setNewMarketName]   = useState('')
  const [newSizeName, setNewSizeName]       = useState('')
  const [deleteTarget, setDeleteTarget]     = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [showImport, setShowImport]         = useState(false)

  // Default new-item size selection to the first available size
  React.useEffect(() => {
    if (sizes.length > 0 && newItemSizeIds.length === 0) {
      setNewItemSizeIds([sizes[0].id])
    }
  }, [sizes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // ── Drag-end: reorder ─────────────────────────────────────────────────────
  const handleItemDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const reordered = arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id))
    await Promise.all(reordered.map((item, idx) => supabase.from('items').update({ display_order: idx + 1 }).eq('id', item.id)))
    loadItems()
  }

  const handleMarketDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const reordered = arrayMove(markets, markets.findIndex(m => m.id === active.id), markets.findIndex(m => m.id === over.id))
    await Promise.all(reordered.map((market, idx) => supabase.from('markets').update({ display_order: idx + 1 }).eq('id', market.id)))
    loadMarkets()
  }

  const handleSizeDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return
    const reordered = arrayMove(sizes, sizes.findIndex(s => s.id === active.id), sizes.findIndex(s => s.id === over.id))
    await Promise.all(reordered.map((size, idx) => supabase.from('sizes').update({ display_order: idx + 1 }).eq('id', size.id)))
    loadSizes()
  }

  // ── Items CRUD ────────────────────────────────────────────────────────────
  const addItem = async () => {
    const name = newItemName.trim()
    if (!name || newItemSizeIds.length === 0) return
    setSaving(true)
    const maxOrder = items.reduce((m, i) => Math.max(m, i.display_order), 0)
    const { data: newItem, error } = await supabase.from('items').insert({
      name, display_order: maxOrder + 1,
      // Keep legacy columns populated for backward compat
      has_12oz: false, has_16oz: false,
    }).select().single()
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    await supabase.from('item_sizes').insert(newItemSizeIds.map(sid => ({ item_id: newItem.id, size_id: sid })))
    setNewItemName('')
    setNewItemSizeIds(sizes.length > 0 ? [sizes[0].id] : [])
    loadItems()
    setSaving(false)
  }

  const toggleItemSize = async (item, sizeId) => {
    const itemSizeIds = (item.item_sizes || []).map(is => is.size_id)
    const hasSize = itemSizeIds.includes(sizeId)
    if (hasSize && itemSizeIds.length === 1) { alert('An item needs at least one size.'); return }
    if (hasSize) {
      await supabase.from('item_sizes').delete().eq('item_id', item.id).eq('size_id', sizeId)
    } else {
      await supabase.from('item_sizes').insert({ item_id: item.id, size_id: sizeId })
    }
    loadItems()
  }

  const deleteItem = async (item) => {
    await supabase.from('items').update({ active: false }).eq('id', item.id)
    loadItems(); setDeleteTarget(null)
  }

  // ── Markets CRUD ──────────────────────────────────────────────────────────
  const addMarket = async () => {
    const name = newMarketName.trim()
    if (!name) return
    setSaving(true)
    const maxOrder = markets.reduce((m, mk) => Math.max(m, mk.display_order), 0)
    const { error } = await supabase.from('markets').insert({ name, display_order: maxOrder + 1 })
    if (error) alert('Error: ' + error.message)
    else { setNewMarketName(''); loadMarkets() }
    setSaving(false)
  }

  const deleteMarket = async (market) => {
    await supabase.from('markets').update({ active: false }).eq('id', market.id)
    loadMarkets(); setDeleteTarget(null)
  }

  // ── Sizes CRUD ────────────────────────────────────────────────────────────
  const addSize = async () => {
    const name = newSizeName.trim()
    if (!name) return
    setSaving(true)
    const maxOrder = sizes.reduce((m, s) => Math.max(m, s.display_order), 0)
    const { error } = await supabase.from('sizes').insert({ name, display_order: maxOrder + 1 })
    if (error) alert('Error: ' + error.message)
    else { setNewSizeName(''); loadSizes() }
    setSaving(false)
  }

  const deleteSize = async (size) => {
    const { count } = await supabase
      .from('item_sizes').select('*', { count: 'exact', head: true }).eq('size_id', size.id)
    if (count > 0) {
      alert(`Can't delete "${size.name}" — ${count} item(s) still use it. Remove the size from those items first.`)
      setDeleteTarget(null)
      return
    }
    await supabase.from('sizes').delete().eq('id', size.id)
    loadSizes(); setDeleteTarget(null)
  }

  const toggleNewItemSize = (sizeId) =>
    setNewItemSizeIds(prev => prev.includes(sizeId) ? prev.filter(id => id !== sizeId) : [...prev, sizeId])

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-8 pb-4"
           style={{ background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-black">⚙️ Settings</h1>
            <p className="text-gray-400 text-xs mt-0.5">Hold ≡ and drag to reorder</p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-white/15 active:bg-white/25 text-white
                       font-bold text-xs px-3 py-2 rounded-xl transition-all active:scale-95"
          >
            📥 Import CSV
          </button>
        </div>
      </div>

      <div className="px-3 py-3 space-y-4">

        {/* ── SIZES ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            Sizes · {sizes.length}
          </h2>

          {sizes.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSizeDragEnd}>
              <SortableContext items={sizes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 mb-2">
                  {sizes.map(size => (
                    <SortableSizeRow
                      key={size.id}
                      size={size}
                      onDelete={s => setDeleteTarget({ type: 'size', record: s })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-dashed border-indigo-200 p-4">
            <p className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-3">Add New Size</p>
            <input
              type="text"
              placeholder="e.g. 8 oz or Family Size"
              value={newSizeName}
              onChange={e => setNewSizeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSize()}
              className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3 text-sm font-semibold
                         text-gray-800 placeholder-gray-300 outline-none focus:ring-2 focus:ring-indigo-300 mb-3"
            />
            <button
              onClick={addSize}
              disabled={!newSizeName.trim() || saving}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black
                         py-3 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-transform
                         disabled:opacity-40 disabled:scale-100"
            >
              + Add Size
            </button>
          </div>
        </section>

        {/* ── ITEMS ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            Items · {items.length}
          </h2>

          {items.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 mb-2">
                  {items.map(item => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      sizes={sizes}
                      onDelete={i  => setDeleteTarget({ type: 'item', record: i })}
                      onToggleSize={toggleItemSize}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-dashed border-indigo-200 p-4">
            <p className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-3">Add New Item</p>
            <input
              type="text"
              placeholder="e.g. Mango Lassi"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3 text-sm font-semibold
                         text-gray-800 placeholder-gray-300 outline-none focus:ring-2 focus:ring-indigo-300 mb-3"
            />
            {sizes.length > 0 && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-gray-400 font-semibold mr-1">Sizes:</span>
                {sizes.map(size => (
                  <SizeToggle
                    key={size.id}
                    active={newItemSizeIds.includes(size.id)}
                    label={size.name}
                    onClick={() => toggleNewItemSize(size.id)}
                  />
                ))}
              </div>
            )}
            <button
              onClick={addItem}
              disabled={!newItemName.trim() || newItemSizeIds.length === 0 || saving}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black
                         py-3 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-transform
                         disabled:opacity-40 disabled:scale-100"
            >
              + Add Item
            </button>
          </div>
        </section>

        {/* ── MARKETS ───────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
            Markets · {markets.length}
          </h2>

          {markets.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMarketDragEnd}>
              <SortableContext items={markets.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 mb-2">
                  {markets.map(market => (
                    <SortableMarketRow
                      key={market.id}
                      market={market}
                      onDelete={m => setDeleteTarget({ type: 'market', record: m })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="bg-white rounded-3xl shadow-sm border border-dashed border-indigo-200 p-4">
            <p className="text-xs font-black text-indigo-400 uppercase tracking-wider mb-3">Add New Market</p>
            <input
              type="text"
              placeholder="e.g. Pasadena"
              value={newMarketName}
              onChange={e => setNewMarketName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMarket()}
              className="w-full bg-gray-50 border-0 rounded-2xl px-4 py-3 text-sm font-semibold
                         text-gray-800 placeholder-gray-300 outline-none focus:ring-2 focus:ring-indigo-300 mb-3"
            />
            <button
              onClick={addMarket}
              disabled={!newMarketName.trim() || saving}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black
                         py-3 rounded-2xl shadow-lg shadow-indigo-100 active:scale-95 transition-transform
                         disabled:opacity-40 disabled:scale-100"
            >
              + Add Market
            </button>
          </div>
        </section>

        <p className="text-center text-gray-200 text-xs pb-4">Frozen Inventory v2.0</p>
      </div>

      {deleteTarget && (
        <ConfirmModal
          name={deleteTarget.record.name}
          subtitle={
            deleteTarget.type === 'item'   ? 'Historical data stays safe. This just hides it from new entries.' :
            deleteTarget.type === 'size'   ? 'Make sure no items use this size before deleting.' :
            undefined
          }
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget.type === 'item')   deleteItem(deleteTarget.record)
            if (deleteTarget.type === 'market') deleteMarket(deleteTarget.record)
            if (deleteTarget.type === 'size')   deleteSize(deleteTarget.record)
          }}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
