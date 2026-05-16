import React, { useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'

// ── CSV parser ─────────────────────────────────────────────────────────────────
// Handles the two-row header format:
//   Row 0: ,,,Sent,,,,Back,,,,     ← group labels
//   Row 1: week of,Market,Item,12 oz,16 oz,2 Pack,1 Pack,12 oz,16 oz,2 Pack,1 Pack
//   Row 2+: data rows
//
// Returns { rows, sizeNames } where sizeNames = ['12 oz','16 oz','2 Pack','1 Pack']
// and each row has sentValues[i] / backValues[i] aligned to sizeNames.

function parseRow(line) {
  const result = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

function parseFrozenCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .trim().split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 3) return null

  const groupRow  = parseRow(lines[0])
  const headerRow = parseRow(lines[1])

  // Find where the Sent and Back groups start in the group row
  const sentStart = groupRow.findIndex(c => /sent/i.test(c))
  const backStart = groupRow.findIndex(c => /back/i.test(c))

  if (sentStart < 0 || backStart < 0 || backStart <= sentStart) return null

  const numSizes = backStart - sentStart   // e.g. 4 for 12oz/16oz/2Pack/1Pack
  const sizeNames = headerRow.slice(sentStart, backStart)  // e.g. ['12 oz','16 oz','2 Pack','1 Pack']

  const rows = []
  for (let i = 2; i < lines.length; i++) {
    const c = parseRow(lines[i])
    if (!c[0] && !c[1] && !c[2]) continue

    const sentValues = []
    const backValues = []
    for (let j = 0; j < numSizes; j++) {
      const sv = parseInt(c[sentStart + j])
      const bv = parseInt(c[backStart + j])
      sentValues.push(isNaN(sv) || sv < 0 ? 0 : sv)
      backValues.push(isNaN(bv) || bv < 0 ? 0 : bv)
    }

    rows.push({
      weekStr:   c[0]?.trim() || '',
      marketStr: c[1]?.trim() || '',
      itemStr:   c[2]?.trim() || '',
      sentValues,
      backValues,
    })
  }

  return rows.length ? { rows, sizeNames } : null
}

function getMondayOfWeek(dateStr) {
  let d = new Date(dateStr)
  if (isNaN(d)) {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      let [m, day, yr] = parts.map(Number)
      if (yr < 100) yr += 2000
      d = new Date(yr, m - 1, day)
    }
  }
  if (isNaN(d)) return null
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}

function formatWeek(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function bestMatch(name, list, key = 'name') {
  const n = norm(name)
  if (!n) return null
  const exact = list.find(x => norm(x[key]) === n)
  if (exact) return exact
  // Prefer the longest DB name fully contained in the CSV name (avoids short substring false-matches)
  const candidates = list
    .filter(x => n.includes(norm(x[key])) && norm(x[key]).length > 2)
    .sort((a, b) => norm(b[key]).length - norm(a[key]).length)
  return candidates[0] || list.find(x => norm(x[key]).includes(n) && n.length > 2) || null
}

// ── Step dots ──────────────────────────────────────────────────────────────────
function StepDot({ n, current, label }) {
  const done   = current > n
  const active = current === n
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-sm transition-all
        ${done   ? 'bg-emerald-400 text-white' :
          active ? 'bg-indigo-500 text-white ring-4 ring-indigo-200' :
                   'bg-gray-100 text-gray-400'}`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-[10px] font-bold ${active ? 'text-indigo-600' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ImportModal({ onClose }) {
  const { items, markets, sizes, loadAllSessions } = useApp()

  const [step, setStep]         = useState(1)
  const [parsed, setParsed]     = useState(null)   // { rows, sizeNames }
  const [fileName, setFileName] = useState('')

  // Manual overrides: { csvName -> dbId (string) }
  const [itemMap, setItemMap]     = useState({})
  const [marketMap, setMarketMap] = useState({})

  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState('')
  const [results, setResults]     = useState(null)
  const [dragging, setDragging]   = useState(false)
  const fileRef = useRef()

  const rawRows   = parsed?.rows     || []
  const sizeNames = parsed?.sizeNames || []

  // ── Parse file ──────────────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const result = parseFrozenCSV(e.target.result)
      if (!result) { alert('Could not parse the CSV — check the file format.'); return }
      setParsed(result)

      const uItems   = [...new Set(result.rows.map(r => r.itemStr).filter(Boolean))]
      const uMarkets = [...new Set(result.rows.map(r => r.marketStr).filter(Boolean))]
      const im = {}, mm = {}
      for (const name of uItems) {
        const match = bestMatch(name, items)
        if (match) im[name] = String(match.id)
      }
      for (const name of uMarkets) {
        const match = bestMatch(name, markets)
        if (match) mm[name] = String(match.id)
      }
      setItemMap(im)
      setMarketMap(mm)
      setStep(2)
    }
    reader.readAsText(file)
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const { uniqueItems, uniqueMarkets, uniqueWeeks, unmatchedItems, unmatchedMarkets,
          readyCount, skipCount, csvSizesMatched } = useMemo(() => {
    if (!rawRows.length) return {
      uniqueItems: [], uniqueMarkets: [], uniqueWeeks: [],
      unmatchedItems: [], unmatchedMarkets: [], readyCount: 0, skipCount: 0, csvSizesMatched: []
    }

    const uItems   = [...new Set(rawRows.map(r => r.itemStr).filter(Boolean))]
    const uMarkets = [...new Set(rawRows.map(r => r.marketStr).filter(Boolean))]
    const uWeeks   = [...new Set(rawRows.map(r => getMondayOfWeek(r.weekStr)).filter(Boolean))].sort()

    const unmatchedItems   = uItems.filter(name => !itemMap[name])
    const unmatchedMarkets = uMarkets.filter(name => !marketMap[name])

    // Build size name → DB size mapping
    const csvSizesMatched = sizeNames.map(name => {
      const dbSize = bestMatch(name, sizes)
      return { csvName: name, dbSize }
    })

    let readyCount = 0, skipCount = 0
    for (const r of rawRows) {
      const weekDate = getMondayOfWeek(r.weekStr)
      if (weekDate && itemMap[r.itemStr] && marketMap[r.marketStr]) readyCount++
      else skipCount++
    }

    return { uniqueItems: uItems, uniqueMarkets: uMarkets, uniqueWeeks: uWeeks,
             unmatchedItems, unmatchedMarkets, readyCount, skipCount, csvSizesMatched }
  }, [rawRows, sizeNames, itemMap, marketMap, sizes])

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true)

    // Build CSV size name → DB size id map
    const sizeIdByIndex = sizeNames.map(name => {
      const dbSize = bestMatch(name, sizes)
      return dbSize?.id ?? null
    })

    // Build resolved rows
    const resolved = rawRows.flatMap(r => {
      const weekDate = getMondayOfWeek(r.weekStr)
      const itemId   = itemMap[r.itemStr]
      const marketId = marketMap[r.marketStr]
      if (!weekDate || !itemId || !marketId) return []
      return [{ weekDate, itemId, marketId,
                sentValues: r.sentValues, backValues: r.backValues }]
    })

    // Group by week
    const byWeek = {}
    for (const r of resolved) {
      if (!byWeek[r.weekDate]) byWeek[r.weekDate] = []
      byWeek[r.weekDate].push(r)
    }

    let imported = 0, skipped = rawRows.length - resolved.length
    const weeks = Object.keys(byWeek).sort()

    for (let wi = 0; wi < weeks.length; wi++) {
      const weekDate = weeks[wi]
      const weekRows = byWeek[weekDate]
      setProgress(`Week ${wi + 1} of ${weeks.length}: ${formatWeek(weekDate)}…`)

      // Get or create session
      let session = null
      const { data: existing } = await supabase
        .from('weekly_sessions').select('*').eq('week_start', weekDate).maybeSingle()

      if (existing) {
        session = existing
      } else {
        const { data: created, error } = await supabase
          .from('weekly_sessions').insert({ week_start: weekDate }).select().single()
        if (error) { skipped += weekRows.length; continue }
        session = created
      }

      // Build transaction rows — one per (market, item, size) when that size has data
      const txns = []
      for (const r of weekRows) {
        for (let si = 0; si < sizeNames.length; si++) {
          const sizeId = sizeIdByIndex[si]
          if (!sizeId) continue  // size not in DB, skip
          const sent = r.sentValues[si] || 0
          const back = r.backValues[si] || 0
          if (sent === 0 && back === 0) continue  // no data for this size
          txns.push({
            session_id: session.id,
            market_id:  r.marketId,
            item_id:    r.itemId,
            size_id:    sizeId,
            given:      sent,
            returned:   back,
            restock:    0,
          })
        }
      }

      // Delete existing + insert fresh
      await supabase.from('market_transactions').delete().eq('session_id', session.id)

      if (txns.length > 0) {
        const { error: txnErr } = await supabase.from('market_transactions').insert(txns)
        if (txnErr) { skipped += weekRows.length; continue }
      }

      // Compute starting_inventory: qty = effective sold per item+size
      const { data: allTxns } = await supabase
        .from('market_transactions')
        .select('item_id, size_id, given, returned')
        .eq('session_id', session.id)

      const invMap = {}
      for (const t of allTxns || []) {
        const key = `${t.item_id}::${t.size_id}`
        if (!invMap[key]) invMap[key] = { item_id: t.item_id, size_id: t.size_id, qty: 0 }
        // returned > 0 → sold = given - returned; returned = 0 → assume all given sold
        const eff = t.returned > 0
          ? Math.max(0, (t.given || 0) - t.returned)
          : (t.given || 0)
        invMap[key].qty += eff
      }

      await supabase.from('starting_inventory').delete().eq('session_id', session.id)
      const invRows = Object.values(invMap).map(({ item_id, size_id, qty }) => ({
        session_id: session.id, item_id, size_id, qty,
      }))
      if (invRows.length > 0) {
        await supabase.from('starting_inventory').insert(invRows)
      }

      imported += weekRows.length
    }

    await loadAllSessions(true)
    setResults({ imported, skipped, weeks: weeks.length })
    setImporting(false)
    setStep(3)
  }

  const stepLabels = ['Upload', 'Review', 'Done']

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col animate-pop-in"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-3xl mt-auto w-full max-w-lg mx-auto max-h-[92vh] flex flex-col shadow-2xl relative"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4"/>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900 text-lg">📥 Import CSV</h2>
            <button onClick={onClose} className="text-gray-400 text-2xl leading-none active:text-gray-600">×</button>
          </div>
          <div className="flex items-center justify-between px-4">
            {stepLabels.map((label, i) => (
              <React.Fragment key={label}>
                <StepDot n={i + 1} current={step} label={label} />
                {i < stepLabels.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded ${step > i + 1 ? 'bg-emerald-300' : 'bg-gray-100'}`}/>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── Step 1: Upload ───────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-gray-500 text-sm">
                Upload your CSV export. Size columns are read automatically from the header row.
              </p>

              {/* Format preview */}
              <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 text-xs font-mono">
                <div className="bg-gray-100 px-3 py-1.5 text-gray-400 text-[10px] font-sans font-bold uppercase tracking-wider">
                  Expected format
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-2 py-1.5 text-left text-gray-400 font-semibold" colSpan={3}/>
                        <th className="px-2 py-1.5 text-center text-sky-600 font-bold" colSpan={4}>Sent</th>
                        <th className="px-2 py-1.5 text-center text-orange-500 font-bold" colSpan={4}>Back</th>
                      </tr>
                      <tr className="text-gray-500 border-b border-gray-200">
                        {['week of','Market','Item','12 oz','16 oz','2 Pack','1 Pack','12 oz','16 oz','2 Pack','1 Pack'].map(h => (
                          <th key={h} className="px-2 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      {[
                        ['3/7/26','La Canada','Tikka','','11','','','','6','',''],
                        ['3/7/26','La Canada','Puff Pastry - CKN','','','4','','','','4',''],
                        ['3/7/26','La Canada','Naan - Garlic','','','','5','','','','0'],
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {row.map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{v}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all
                  ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50 active:bg-gray-100'}`}
              >
                <div className="text-5xl mb-3">📄</div>
                <p className="font-black text-gray-700">Drop CSV here</p>
                <p className="text-gray-400 text-sm mt-1">or tap to browse</p>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
                  onChange={e => handleFile(e.target.files[0])} />
              </div>
            </div>
          )}

          {/* ── Step 2: Review ───────────────────────────────────── */}
          {step === 2 && rawRows.length > 0 && (
            <div className="space-y-4">
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Weeks',   value: uniqueWeeks.length,   color: 'indigo' },
                  { label: 'Markets', value: uniqueMarkets.length, color: 'violet' },
                  { label: 'Rows',    value: rawRows.length,       color: 'sky'    },
                ].map(s => (
                  <div key={s.label} className={`bg-${s.color}-50 rounded-2xl p-3 text-center`}>
                    <p className={`text-${s.color}-700 font-black text-2xl leading-tight`}>{s.value}</p>
                    <p className={`text-${s.color}-500 text-xs`}>{s.label} detected</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center">📄 {fileName}</p>

              {/* Size mapping */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Sizes detected in CSV</p>
                <div className="flex flex-wrap gap-1.5">
                  {csvSizesMatched.map(({ csvName, dbSize }) => (
                    <span key={csvName}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full
                        ${dbSize ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                      {csvName} {dbSize ? '✓' : '✗ not in DB'}
                    </span>
                  ))}
                </div>
                {csvSizesMatched.some(s => !s.dbSize) && (
                  <p className="text-xs text-amber-500 mt-1">
                    ⚠️ Sizes marked ✗ have no match in the database — add them in Settings first.
                  </p>
                )}
              </div>

              {/* Week list */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Weeks to import</p>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueWeeks.map(w => (
                    <span key={w} className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
                      {formatWeek(w)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Market matching */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Markets</p>
                <div className="space-y-1.5">
                  {uniqueMarkets.map(name => {
                    const matched = marketMap[name] ? markets.find(m => String(m.id) === String(marketMap[name])) : null
                    return (
                      <div key={name} className={`flex items-center justify-between rounded-2xl px-4 py-2.5
                        ${matched ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                        <div>
                          <span className="text-sm font-bold text-gray-800">{name}</span>
                          {matched
                            ? <span className="text-xs text-emerald-600 ml-2">→ {matched.name}</span>
                            : <span className="text-xs text-rose-500 ml-2">not matched</span>}
                        </div>
                        <select
                          value={marketMap[name] || ''}
                          onChange={e => setMarketMap(prev => ({ ...prev, [name]: e.target.value || null }))}
                          className={`text-xs font-semibold border rounded-xl px-2 py-1.5 outline-none focus:ring-2
                            ${matched
                              ? 'bg-white border-emerald-200 text-gray-700 focus:ring-emerald-300'
                              : 'bg-white border-rose-300 text-gray-700 focus:ring-rose-300'}`}
                        >
                          <option value="">— pick market —</option>
                          {markets.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Item matching */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Items ·{' '}
                  {unmatchedItems.length > 0
                    ? <span className="text-rose-500">{unmatchedItems.length} unmatched</span>
                    : <span className="text-emerald-500">all matched ✓</span>}
                </p>
                <div className="space-y-1.5">
                  {uniqueItems.map(name => {
                    const matched = itemMap[name] ? items.find(i => String(i.id) === String(itemMap[name])) : null
                    return (
                      <div key={name} className={`flex items-center justify-between rounded-2xl px-4 py-2.5
                        ${matched ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                        <div className="min-w-0 flex-1 mr-2">
                          <span className="text-sm font-bold text-gray-800 truncate block">{name}</span>
                          {matched
                            ? <span className="text-xs text-emerald-600">→ {matched.name}</span>
                            : <span className="text-xs text-rose-500">add in Settings or pick below</span>}
                        </div>
                        <select
                          value={itemMap[name] || ''}
                          onChange={e => setItemMap(prev => ({ ...prev, [name]: e.target.value || null }))}
                          className={`text-xs font-semibold border rounded-xl px-2 py-1.5 outline-none focus:ring-2 shrink-0
                            ${matched
                              ? 'bg-white border-emerald-200 text-gray-700 focus:ring-emerald-300'
                              : 'bg-white border-rose-300 text-gray-700 focus:ring-rose-300'}`}
                        >
                          <option value="">— skip —</option>
                          {items.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Ready count */}
              <div className={`rounded-2xl px-4 py-3 text-center ${skipCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                <p className={`font-black text-lg ${skipCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {readyCount} rows ready{skipCount > 0 ? `, ${skipCount} will be skipped` : ' ✓'}
                </p>
                {skipCount > 0 && (
                  <p className="text-amber-500 text-xs mt-0.5">
                    Skipped rows have unmatched items, markets, or invalid dates.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Done ─────────────────────────────────────── */}
          {step === 3 && results && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="text-6xl">🎉</div>
              <h3 className="font-black text-gray-900 text-xl">Import complete!</h3>
              <div className="flex gap-3">
                <div className="bg-emerald-50 rounded-2xl px-6 py-4">
                  <p className="text-emerald-700 font-black text-3xl">{results.imported}</p>
                  <p className="text-emerald-600 text-sm">rows imported</p>
                </div>
                <div className="bg-indigo-50 rounded-2xl px-6 py-4">
                  <p className="text-indigo-700 font-black text-3xl">{results.weeks}</p>
                  <p className="text-indigo-600 text-sm">weeks created</p>
                </div>
                {results.skipped > 0 && (
                  <div className="bg-rose-50 rounded-2xl px-6 py-4">
                    <p className="text-rose-600 font-black text-3xl">{results.skipped}</p>
                    <p className="text-rose-500 text-sm">skipped</p>
                  </div>
                )}
              </div>
              <p className="text-gray-400 text-sm px-4">
                Head to the Dashboard to see your historical data and predictions.
              </p>
            </div>
          )}
        </div>

        {/* Importing overlay */}
        {importing && (
          <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center rounded-t-3xl gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"/>
            <p className="text-indigo-600 font-semibold text-sm text-center px-8">{progress}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pt-4 border-t border-gray-100 flex gap-3 shrink-0"
             style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}>
          {step === 1 && (
            <button onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
              Cancel
            </button>
          )}

          {step === 2 && (
            <>
              <button onClick={() => { setStep(1); setParsed(null) }}
                className="bg-gray-100 text-gray-700 font-bold px-5 py-3.5 rounded-2xl active:scale-95 transition-transform">
                ‹ Back
              </button>
              <button
                onClick={handleImport}
                disabled={readyCount === 0 || importing}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold
                           py-3.5 rounded-2xl shadow-lg shadow-emerald-200 active:scale-95 transition-transform
                           disabled:opacity-40 disabled:scale-100">
                Import {readyCount} rows →
              </button>
            </>
          )}

          {step === 3 && (
            <button onClick={onClose}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold
                         py-3.5 rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform">
              Done ✓
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
