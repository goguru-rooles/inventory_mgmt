import React, { useState } from 'react'
import { useApp } from '../App.jsx'

function formatWeekLabel(iso) {
  if (!iso) return 'No week selected'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getMondayOfWeek(date = new Date()) {
  // Always parse date strings as LOCAL midnight (not UTC) to avoid day-shift bugs
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  // Format as YYYY-MM-DD using local date parts so timezone never shifts the day
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ── Past Week Modal ────────────────────────────────────────────────────────────
function PastWeekModal({ onClose, onCreate }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(getMondayOfWeek())
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    await onCreate(date)
    setCreating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50 animate-pop-in"
         onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5"/>
        <h3 className="font-black text-gray-900 text-lg mb-1">Add a Past Week</h3>
        <p className="text-gray-400 text-sm mb-5">
          Pick any date — it'll snap to that week's Monday. Then enter your historical data on the Week and Markets tabs.
        </p>

        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Select a date in that week
        </label>
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-base
                     font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-300 mb-5"
        />

        {/* Preview which Mon–Sun range it snaps to */}
        <div className="bg-indigo-50 rounded-2xl px-4 py-3 mb-5 text-center">
          <p className="text-xs text-indigo-400 font-semibold mb-0.5">Week will be created for</p>
          <p className="text-indigo-700 font-black text-base">
            {(() => {
              const monday = getMondayOfWeek(date)
              const sunDate = new Date(monday + 'T00:00:00')
              sunDate.setDate(sunDate.getDate() + 6)
              const sunStr = `${sunDate.getFullYear()}-${String(sunDate.getMonth()+1).padStart(2,'0')}-${String(sunDate.getDate()).padStart(2,'0')}`
              return `${formatWeekLabel(monday)} – ${formatWeekLabel(sunStr)}`
            })()}
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!date || creating}
            className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold
                       py-3.5 rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform
                       disabled:opacity-50">
            {creating ? 'Creating…' : '+ Create Week'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Week Navigator bar ─────────────────────────────────────────────────────────
export default function WeekNavigator({ accentClass = 'text-white/80', labelClass = 'text-white' }) {
  const { allSessions, currentSession, goToPrevSession, goToNextSession, createSession } = useApp()
  const [showModal, setShowModal] = useState(false)

  const idx      = allSessions.findIndex(s => s.id === currentSession?.id)
  const hasPrev  = idx > 0
  const hasNext  = idx < allSessions.length - 1
  const isLatest = idx === allSessions.length - 1 || allSessions.length === 0

  const today     = getMondayOfWeek()
  const isThisWeek = currentSession?.week_start === today

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Prev arrow */}
        <button
          onClick={goToPrevSession}
          disabled={!hasPrev}
          className={`w-8 h-8 flex items-center justify-center rounded-xl font-bold text-lg
                      transition-all active:scale-90 select-none
                      ${hasPrev ? 'bg-white/20 active:bg-white/30' : 'opacity-20 cursor-not-allowed'} ${labelClass}`}
        >‹</button>

        {/* Week label */}
        <div className="flex-1 text-center px-1">
          <p className={`text-xs font-semibold ${accentClass}`}>
            {isThisWeek ? 'This Week' : isLatest ? 'Latest Week' : `Week ${idx + 1} of ${allSessions.length}`}
          </p>
          <p className={`text-sm font-black leading-tight ${labelClass}`}>
            {formatWeekLabel(currentSession?.week_start)}
          </p>
        </div>

        {/* Next arrow */}
        <button
          onClick={goToNextSession}
          disabled={!hasNext}
          className={`w-8 h-8 flex items-center justify-center rounded-xl font-bold text-lg
                      transition-all active:scale-90 select-none
                      ${hasNext ? 'bg-white/20 active:bg-white/30' : 'opacity-20 cursor-not-allowed'} ${labelClass}`}
        >›</button>

        {/* Add past week */}
        <button
          onClick={() => setShowModal(true)}
          className="w-8 h-8 flex items-center justify-center rounded-xl font-bold text-lg
                     bg-white/20 active:bg-white/30 transition-all active:scale-90 select-none ml-1"
          title="Add a past week"
        >
          <span className={`text-sm font-black ${labelClass}`}>+</span>
        </button>
      </div>

      {showModal && (
        <PastWeekModal
          onClose={() => setShowModal(false)}
          onCreate={createSession}
        />
      )}
    </>
  )
}
