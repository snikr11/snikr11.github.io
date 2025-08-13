// === FILE: src/App.jsx ===
import React, { useEffect, useMemo, useState } from 'react'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [week, setWeek] = useState(null)

  // Load plan
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/workouts.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
        const todayISO = todayLocalISO()
        const idx = json.findIndex(d => d.date === todayISO)
        setWeek(idx >= 0 ? json[idx].week : json[0]?.week ?? 1)
      } catch (e) {
        console.warn('Failed to fetch workouts.json, using sample', e)
        const sample = SAMPLE
        setData(sample)
        const todayISO = todayLocalISO()
        const idx = sample.findIndex(d => d.date === todayISO)
        setWeek(idx >= 0 ? sample[idx].week : sample[0]?.week ?? 1)
        setError('Could not load workouts.json – loaded sample data. Create /public/workouts.json to replace.')
      }
    }
    load()
  }, [])

  const byWeek = useMemo(() => groupBy(data ?? [], x => x.week), [data])
  const weeks = useMemo(() => Object.keys(byWeek).map(Number).sort((a,b)=>a-b), [byWeek])

  // pick current index for Today panel
  const todayISO = todayLocalISO()
  const todayIdx = useMemo(() => (data ?? []).findIndex(d => d.date === todayISO), [data, todayISO])
  const currentIdx = useMemo(() => {
    if (!data || week == null) return -1
    return todayIdx >= 0 ? todayIdx : data.findIndex(d => d.week === week)
  }, [data, week, todayIdx])

  if (!data) return (
    <Shell>
      <Header
        weeks={[]}
        week={week}
        onWeekChange={() => {}}
        onJumpToday={() => {}}
        onResetWeek={() => {}}
      />
      <Notice>Loading plan…</Notice>
    </Shell>
  )

  return (
    <Shell>
      {error ? <Notice>{error}</Notice> : null}
      <Header
        weeks={weeks}
        week={week}
        onWeekChange={w => setWeek(Number(w))}
        onJumpToday={() => {
          const idx = data.findIndex(d => d.date === todayISO)
          const target = idx >= 0 ? data[idx] : closestByDate(data, new Date())
          setWeek(target.week)
          setTimeout(() => {
            const row = document.querySelector(`[data-date="${cssEscape(target.date)}"]`)
            row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }, 0)
        }}
        onResetWeek={() => {
          if (!confirm('Clear completion for all days in this week?')) return
          for (const d of byWeek[week] ?? []) setDone(d.date, false)
          // trigger rerender
          setWeek(w => w)
        }}
      />

      {currentIdx >= 0 ? (
        <TodayPanel day={data[currentIdx]} />
      ) : (
        <Notice>No day selected.</Notice>
      )}

      <WeekPanel days={(byWeek[week] ?? [])} currentDate={data[currentIdx]?.date} />
    </Shell>
  )
}

function Header({ weeks, week, onWeekChange, onJumpToday, onResetWeek }){
  return (
    <header className="hdr">
      <h1>Daily Training Checklist</h1>
      <div className="controls">
        <label>Week
          <select value={week ?? ''} onChange={e=>onWeekChange(e.target.value)}>
            {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </label>
        <button className="primary" onClick={onJumpToday}>Jump to Today</button>
        <button onClick={onResetWeek} title="Clear completion for this week">Reset Week</button>
      </div>
    </header>
  )
}

function TodayPanel({ day }){
  const [done, setDoneState] = useState(getDone(day.date))
  const [note, setNoteState] = useState(getNote(day.date))
  const [status, setStatus] = useState('Idle')

  useEffect(() => {
    setDoneState(getDone(day.date))
    setNoteState(getNote(day.date))
    setStatus('Idle')
  }, [day.date])

  return (
    <section className="panel today">
      <div className="today-header">
        <div>
          <div className="title">{formatDate(day.date)} • Week {day.week}</div>
          <div className="meta">{day.day} — {day.phase}</div>
        </div>
        <label><input type="checkbox" checked={done} onChange={e=>{
          setDone(day.date, e.target.checked)
          setDoneState(e.target.checked)
        }} /> Completed</label>
      </div>

      <div className="kpis">
        <div className="kpi">Phase: <strong>{day.phase}</strong></div>
        <div className="kpi">Week mileage: <strong>{day.weeklyMileage ?? ''}</strong> mi</div>
        <Progress week={day.week} />
      </div>

      <div className="workout-text">
        <div><strong>Workout</strong><pre>{day.workout}</pre></div>
        <div><strong>Warm-up</strong><pre>{day.warmup}</pre></div>
        <div><strong>Cool-down</strong><pre>{day.cooldown}</pre></div>
      </div>

      <div className="notes">
        <label htmlFor="todayNote"><strong>Notes</strong></label>
        <textarea id="todayNote" value={note} placeholder="How did it feel? Pace, HR, aches, weather, etc." onChange={e=>{
          setStatus('Saving…')
          const val = e.target.value
          setNoteState(val)
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(()=>{
            setNote(day.date, val.trim())
            setStatus(val.trim() ? 'Saved' : 'Cleared')
          }, 350)
        }} />
        <div className="row">
          <div className="saveStatus">{status}</div>
          <button onClick={()=>{ setNoteState(''); setNote(day.date, ''); setStatus('Cleared') }}>Clear Note</button>
        </div>
      </div>
    </section>
  )
}

let saveTimer = null

function Progress({ week }){
  const days = useMemo(() => (window.__PLAN_BY_WEEK ?? (window.__PLAN_BY_WEEK = groupBy(window.__PLAN_DATA ?? [], x=>x.week)))[week] ?? [], [week])
  const [stamp, setStamp] = useState(0) // rerender on change
  useEffect(() => {
    const handler = () => setStamp(s => s+1)
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  const done = days.reduce((acc, d)=> acc + (getDone(d.date)?1:0), 0)
  const pct = Math.round((done / Math.max(days.length,1)) * 100)
  useEffect(()=>{}, [stamp])
  return (
    <div className="kpi" style={{minWidth:160}}>
      Progress: <strong>{done}/{days.length} ({pct}%)</strong>
      <div className="progress"><div className="bar" style={{width: pct+'%'}} /></div>
    </div>
  )
}

function WeekPanel({ days, currentDate }){
  useEffect(() => { window.__PLAN_DATA = (window.__PLAN_DATA ?? []).length ? window.__PLAN_DATA : days.flatMap(d=>days) }, [days])
  return (
    <section className="panel">
      <h3 style={{marginTop:0}}>This Week</h3>
      <div className="list">
        {days.map(d => {
          const checked = getDone(d.date)
          const hasNote = !!getNote(d.date)
          return (
            <div key={d.date} className={"day" + (checked ? ' done' : '')} data-date={d.date} onClick={()=>{
              const anchor = document.querySelector(`[data-date="${cssEscape(d.date)}"]`)
              anchor?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }}>
              <input type="checkbox" checked={checked} onClick={e=>e.stopPropagation()} onChange={e=>{
                setDone(d.date, e.target.checked)
                // force rerender by toggling attribute (React doesn't manage this list's state)
                const row = document.querySelector(`[data-date="${cssEscape(d.date)}"]`)
                row?.classList.toggle('done', e.target.checked)
              }} />
              <div className="date">{formatDate(d.date)}</div>
              <div className="grow">
                <div className="title">{d.workout}</div>
                <div className="meta">{d.day} • {d.phase} {hasNote ? <span className="note-ind">📝</span> : null}</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Shell({ children }){
  return (
    <div className="container">
      {children}
      <div className="footer">Data stored locally on this device with <code>localStorage</code>. You can safely refresh or go offline. • <a href="/index-standalone.html">Open standalone version</a></div>
    </div>
  )
}

function Notice({ children }){
  return <div className="panel" style={{borderColor:'#444', color:'#9aa4b2'}}>{children}</div>
}

// --- storage helpers & utils ---
function key(date){ return 'workoutDone:' + date }
function getDone(date){ return localStorage.getItem(key(date)) === '1' }
function setDone(date, val){ localStorage.setItem(key(date), val ? '1' : '0') }
function noteKey(date){ return 'workoutNote:' + date }
function getNote(date){ return localStorage.getItem(noteKey(date)) || '' }
function setNote(date, val){ if (!val) localStorage.removeItem(noteKey(date)); else localStorage.setItem(noteKey(date), val) }

function groupBy(arr, f){ return arr.reduce((acc, x)=>{ const k=f(x); (acc[k]=acc[k]||[]).push(x); return acc }, {}) }
function formatDate(iso){ const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) }
function todayLocalISO(){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` }
function cssEscape(s){ return s.replace(/["\\]/g, "\\$&") }
function closestByDate(arr, target){ const t=target.getTime(); let best=0, diff=Infinity; for(let i=0;i<arr.length;i++){ const d=Math.abs(new Date(arr[i].date).getTime()-t); if(d<diff){diff=d; best=i} } return arr[best] }

// Fallback sample if workouts.json is missing
const SAMPLE = [
  {"week":1,"phase":"Recovery & Base","date":"2025-08-12","day":"Tue","workout":"Run/Walk: 1:2 min x 6–8 rounds (3 mi max)","warmup":"Dynamic warmup","cooldown":"Light stretch","weeklyMileage":5},
  {"week":1,"phase":"Recovery & Base","date":"2025-08-13","day":"Wed","workout":"Strength & Mobility (30–40 min)","warmup":"Dynamic warmup","cooldown":"Stretch","weeklyMileage":5},
  {"week":1,"phase":"Recovery & Base","date":"2025-08-14","day":"Thu","workout":"Easy Run: 2 mi","warmup":"Dynamic warmup","cooldown":"Stretch","weeklyMileage":5}
]
