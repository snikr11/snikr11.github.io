import React, { useEffect, useMemo, useState } from 'react'

export default function App(){
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [week, setWeek] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [tick, setTick] = useState(0) // force rerender when storage changes

  // Load plan
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('workouts.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const txt = await res.text()
        let json
        try {
          json = JSON.parse(txt)
        } catch (e) {
          console.error('Invalid JSON in workouts.json:', e, txt.slice(0,200))
          throw new Error('Invalid JSON in workouts.json')
        }
        setData(json)
        initWeekAndDate(json)
        setError('')
      } catch (e) {
        console.warn('Failed to fetch workouts.json, using sample', e)
        setError('Could not load workouts.json – loaded sample data. Create /public/workouts.json to replace.')
        setData(SAMPLE)
        initWeekAndDate(SAMPLE)
      }
    })()
  }, [])

  function initWeekAndDate(plan){
    const todayISO = todayLocalISO()
    const idx = plan.findIndex(d => d.date === todayISO)
    const w = idx >= 0 ? plan[idx].week : plan[0]?.week ?? 1
    setWeek(w)
    setSelectedDate(idx >= 0 ? plan[idx].date : plan.find(d=>d.week===w)?.date)
  }

  // expose grouped structure
  const byWeek = useMemo(() => groupBy(data ?? [], x => x.week), [data])
  const weeks = useMemo(() => Object.keys(byWeek).map(Number).sort((a,b)=>a-b), [byWeek])

  // Selected day
  const day = useMemo(() => (data ?? []).find(d => d.date === selectedDate) || null, [data, selectedDate])

  // When week changes, make sure selected date stays in week
  useEffect(() => {
    if (!data || week == null) return
    if (!byWeek[week]?.some(d => d.date === selectedDate)){
      setSelectedDate(byWeek[week]?.[0]?.date ?? null)
    }
  }, [week, data])

  // listen to storage changes from other tabs
  useEffect(() => {
    const handler = () => setTick(t => t+1)
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

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

  const progress = weekProgress(byWeek[week] ?? [])

  return (
    <Shell>
      {error ? <Notice>{error}</Notice> : null}

      <Header
        weeks={weeks}
        week={week}
        onWeekChange={w => setWeek(Number(w))}
        onJumpToday={() => {
          const idx = data.findIndex(d => d.date === todayLocalISO())
          const target = idx >= 0 ? data[idx] : closestByDate(data, new Date())
          setWeek(target.week)
          setSelectedDate(target.date)
        }}
        onResetWeek={() => {
          if (!confirm('Clear completion for all tasks in this week?')) return
          for (const d of byWeek[week] ?? []) setAllDay(d, false)
          setTick(t => t+1)
        }}
      />

      {day ? (
        <TodayPanel
          key={day.date}
          day={day}
          onSubtaskChange={() => {
            // Keep Completed checkbox and chip in sync
            setTick(t => t+1)
          }}
        />
      ) : <Notice>No day selected.</Notice>}

      <WeekPanel
        days={byWeek[week] ?? []}
        selectedDate={day?.date}
        onSelect={d => setSelectedDate(d.date)}
      />

      <div className="panel" style={{marginTop:12}}>
        <div className="kpi">Progress: <strong>{progress.done}/{progress.total} ({progress.pct}%)</strong></div>
        <div className="progress"><div className="bar" style={{width: progress.pct+'%'}}/></div>
      </div>

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
        <button onClick={onResetWeek}>Reset Week</button>
      </div>
    </header>
  )
}

function TodayPanel({ day, onSubtaskChange }){
  const [note, setNoteState] = useState(getNote(day.date))
  const [status, setStatus] = useState('Idle')
  const [stamp, setStamp] = useState(0) // re-render when toggling subtasks

  // rebuild UI when day changes
  useEffect(() => {
    setNoteState(getNote(day.date))
    setStatus('Idle')
    setStamp(s => s+1)
  }, [day.date])

  const warmItems = useMemo(() => splitTasks(day.warmup), [day.warmup])
  const coolItems = useMemo(() => splitTasks(day.cooldown), [day.cooldown])

  const totals = getDayTotals(day)
  const completed = totals.total>0 && totals.done === totals.total

  return (
    <section className="panel today">
      <div className="today-header">
        <div>
          <div className="title">{formatDate(day.date)} • Week {day.week}</div>
          <div className="meta">{day.day} — {day.phase}</div>
        </div>
        <label><input type="checkbox" checked={completed} onChange={e=>{
          setAllDay(day, e.target.checked)
          setStamp(s => s+1)
          onSubtaskChange?.()
        }} /> Completed</label>
      </div>

      <div className="kpis">
        <div className="kpi">Phase: <strong>{day.phase}</strong></div>
        <div className="kpi">Week mileage: <strong>{day.weeklyMileage ?? ''}</strong> mi</div>
        <div className="kpi">Progress: <strong>{totals.done}/{totals.total} ({Math.round((totals.done/Math.max(1,totals.total))*100)}%)</strong></div>
      </div>

      {/* Tasks: Warm-up → Workout → Cool-down */}
      <section className="tasks">
        <div className="group">
          <div className="section-title">Warm-up</div>
          <div className="task-list">
            {warmItems.map((t, i) => (
              <label key={i} className="task">
                <input type="checkbox" checked={getSub(day.date,'warm',i)} onChange={e=>{
                  setSub(day.date,'warm',i,e.target.checked); setStamp(s=>s+1); onSubtaskChange?.()
                }} /> <span>{t}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="group">
          <div className="section-title">Workout</div>
          <label className="task">
            <input type="checkbox" checked={getSub(day.date,'workout',0)} onChange={e=>{
              setSub(day.date,'workout',0,e.target.checked); setStamp(s=>s+1); onSubtaskChange?.()
            }} /> <span>{day.workout}</span>
          </label>
        </div>

        <div className="group">
          <div className="section-title">Cool-down</div>
          <div className="task-list">
            {coolItems.map((t, i) => (
              <label key={i} className="task">
                <input type="checkbox" checked={getSub(day.date,'cool',i)} onChange={e=>{
                  setSub(day.date,'cool',i,e.target.checked); setStamp(s=>s+1); onSubtaskChange?.()
                }} /> <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Notes */}
      <div className="notes">
        <label htmlFor="todayNote"><strong>Notes</strong></label>
        <textarea id="todayNote" value={note} placeholder="How did it feel? Pace, HR, aches, weather, etc." onChange={e=>{
          setStatus('Saving…')
          const val = e.target.value
          setNoteState(val)
          if (noteTimer) clearTimeout(noteTimer)
          noteTimer = setTimeout(()=>{ setNote(day.date, val.trim()); setStatus(val.trim() ? 'Saved' : 'Cleared'); }, 350)
        }} />
        <div className="row">
          <div className="saveStatus">{status}</div>
          <button onClick={()=>{ setNoteState(''); setNote(day.date, ''); setStatus('Cleared') }}>Clear Note</button>
        </div>
      </div>
    </section>
  )
}

let noteTimer = null

function WeekPanel({ days, selectedDate, onSelect }){
  return (
    <section className="panel">
      <h3 style={{marginTop:0}}>This Week</h3>
      <div className="list">
        {days.map(d => {
          const totals = getDayTotals(d)
          const completed = totals.total>0 && totals.done===totals.total
          return (
            <div key={d.date} className={'day' + (completed ? ' done' : '')} data-date={d.date} onClick={()=>onSelect(d)}>
              <div className="date">{formatDate(d.date)}</div>
              <div className="grow">
                <div className="title">{d.workout}</div>
                <div className="meta">{d.day} • {d.phase} {getNote(d.date) ? <span className="note-ind">📝</span> : null}</div>
                <span className="chip">{completed ? '✅ Completed' : `${totals.done}/${totals.total}`}</span>
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

function Notice({ children }){ return <div className="panel" style={{borderColor:'#444', color:'#9aa4b2'}}>{children}</div> }

// --- storage helpers & utils ---
function key(date){ return 'workoutDone:' + date }
function getDone(date){ return localStorage.getItem(key(date)) === '1' }
function setDone(date, val){ localStorage.setItem(key(date), val ? '1' : '0') }
function noteKey(date){ return 'workoutNote:' + date }
function getNote(date){ return localStorage.getItem(noteKey(date)) || '' }
function setNote(date, val){ if (!val) localStorage.removeItem(noteKey(date)); else localStorage.setItem(noteKey(date), val) }

// Subtask helpers
function subKey(date, section, idx){ return `sub:${date}:${section}:${idx}` }
function getSub(date, section, idx){ return localStorage.getItem(subKey(date, section, idx)) === '1' }
function setSub(date, section, idx, val){ localStorage.setItem(subKey(date, section, idx), val ? '1' : '0') }

function splitTasks(s){ return (s||'').split(';').map(x=>x.trim()).filter(Boolean) }
function getDayTotals(d){
  const warm = splitTasks(d.warmup); const cool = splitTasks(d.cooldown)
  const total = warm.length + 1 + cool.length // +1 for workout
  let done = 0
  for (let i=0;i<warm.length;i++) if (getSub(d.date,'warm',i)) done++
  if (getSub(d.date,'workout',0)) done++
  for (let i=0;i<cool.length;i++) if (getSub(d.date,'cool',i)) done++
  return { done, total }
}
function setAllDay(d, val){
  const warm = splitTasks(d.warmup); const cool = splitTasks(d.cooldown)
  for (let i=0;i<warm.length;i++) setSub(d.date,'warm',i,val)
  setSub(d.date,'workout',0,val)
  for (let i=0;i<cool.length;i++) setSub(d.date,'cool',i,val)
  setDone(d.date, val)
}

function weekProgress(days){
  let done=0,total=0
  for (const d of days){ const t=getDayTotals(d); done+=t.done; total+=t.total }
  const pct = total ? Math.round((done/total)*100) : 0
  return { done, total, pct }
}

function groupBy(arr, f){ return arr.reduce((acc, x)=>{ const k=f(x); (acc[k]=acc[k]||[]).push(x); return acc }, {}) }
function formatDate(iso){ const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) }
function todayLocalISO(){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` }
function closestByDate(arr, target){ const t=target.getTime(); let best=0, diff=Infinity; for(let i=0;i<arr.length;i++){ const d=Math.abs(new Date(arr[i].date).getTime()-t); if(d<diff){diff=d; best=i} } return arr[best] }

function dayOfWeek(iso){ return new Date(iso+'T00:00:00').getDay() }
// Recompute week numbers so weeks end on Sunday. Week 1 runs from the first plan day up to the first Sunday; each Monday starts a new week.
function reweekBySundayEnd(plan){
  const sorted = [...plan].sort((a,b)=> a.date.localeCompare(b.date))
  let ui = 1
  return sorted.map((d, i) => {
    const dow = dayOfWeek(d.date) // 0=Sun, 1=Mon, ...
    if (i>0 && dow === 1) ui += 1
    return { ...d, week: ui }
  })
}

// Fallback sample
const SAMPLE = [
  {"week":1,"phase":"Recovery & Base","date":"2025-08-12","day":"Tue","workout":"Run/Walk: 1:2 min x 6–8 rounds (3 mi max)","warmup":"Walking Quad Pull 10/leg; Leg Swings front/back 10/leg; Arm Circles 5 each way; Calf Rock-Backs 10/leg; Glute Bridges 10 reps","cooldown":"Standing Quad Stretch L/R; Figure-4 Stretch L/R; Hamstring Stretch L/R; Calf Stretch L/R; Hip Flexor Lunge Stretch L/R","weeklyMileage":5},
  {"week":1,"phase":"Recovery & Base","date":"2025-08-13","day":"Wed","workout":"Strength & Mobility (30–40 min)","warmup":"Walking Quad Pull 10/leg; Leg Swings front/back 10/leg; Arm Circles 5 each way; Calf Rock-Backs 10/leg; Glute Bridges 10 reps","cooldown":"Standing Quad Stretch L/R; Figure-4 Stretch L/R; Hamstring Stretch L/R; Calf Stretch L/R; Hip Flexor Lunge Stretch L/R","weeklyMileage":5},
  {"week":1,"phase":"Recovery & Base","date":"2025-08-14","day":"Thu","workout":"Easy Run: 2 mi","warmup":"Walking Quad Pull 10/leg; Leg Swings front/back 10/leg; Arm Circles 5 each way; Calf Rock-Backs 10/leg; Glute Bridges 10 reps","cooldown":"Standing Quad Stretch L/R; Figure-4 Stretch L/R; Hamstring Stretch L/R; Calf Stretch L/R; Hip Flexor Lunge Stretch L/R","weeklyMileage":5}
]
