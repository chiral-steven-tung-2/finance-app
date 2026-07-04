import { useState, useMemo, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { InsightPanel } from './InsightPanel'

// ─── Constants ────────────────────────────────────────────
const TICKERS = [
  { id: 'VOO', color: '#4ade80', defaultCagr: 0.128 },
  { id: 'QQQ', color: '#fb923c', defaultCagr: 0.178 },
]

const YEAR_OPTIONS = [5, 10, 20, 30]

const FREQS = [
  { id: 'biweekly', perYear: 26 },
  { id: 'monthly',  perYear: 12 },
  { id: 'yearly',   perYear: 1  },
]

const EVENT_TYPES = [
  {
    id: 'salary_raise',
    label: 'Salary Raise',
    icon: '▲',
    color: '#4ade80',
    desc: '% increase applied to current income',
    fields: [
      { key: 'pct', label: 'Raise', suffix: '%', placeholder: '10' },
    ],
  },
  {
    id: 'job_change',
    label: 'Job Change',
    icon: '⇄',
    color: '#818cf8',
    desc: 'Switch to a new annual salary',
    fields: [
      { key: 'newSalary', label: 'New Salary (annual)', prefix: '$', placeholder: '90000' },
      { key: 'gapMonths', label: 'Income Gap', suffix: 'mo', placeholder: '0' },
    ],
  },
  {
    id: 'large_purchase',
    label: 'Large Purchase',
    icon: '−',
    color: '#f87171',
    desc: 'One-time cash outflow (car, appliance, etc.)',
    fields: [
      { key: 'amount', label: 'Amount', prefix: '$', placeholder: '20000' },
    ],
  },
  {
    id: 'new_expense',
    label: 'New Monthly Expense',
    icon: '+',
    color: '#fb923c',
    desc: 'Ongoing recurring cost from this point forward',
    fields: [
      { key: 'monthlyAmount', label: 'Per Month', prefix: '$', placeholder: '500' },
    ],
  },
  {
    id: 'side_income',
    label: 'Side Income',
    icon: '↳',
    color: '#34d399',
    desc: 'Additional monthly income (freelance, rental, etc.)',
    fields: [
      { key: 'monthlyAmount', label: 'Per Month', prefix: '$', placeholder: '1000' },
    ],
  },
  {
    id: 'home_purchase',
    label: 'Home Purchase',
    icon: '⌂',
    color: '#38bdf8',
    desc: 'Lump-sum down payment + ongoing mortgage',
    fields: [
      { key: 'downPayment',    label: 'Down Payment',    prefix: '$', placeholder: '60000' },
      { key: 'monthlyMortgage', label: 'Monthly Payment', prefix: '$', placeholder: '2000' },
    ],
  },
  {
    id: 'windfall',
    label: 'Windfall / Bonus',
    icon: '★',
    color: '#fbbf24',
    desc: 'One-time cash gain (bonus, inheritance, sale)',
    fields: [
      { key: 'amount', label: 'Amount', prefix: '$', placeholder: '10000' },
    ],
  },
  {
    id: 'retirement',
    label: 'Early Retirement',
    icon: '◼',
    color: '#a78bfa',
    desc: 'Employment income drops to zero from this year',
    fields: [],
  },
]

const SK_SCENARIOS = 'finance-scenarios-v1'
const SK_ACTIVE    = 'finance-scenario-active-v1'

function newId() { return Math.random().toString(36).slice(2, 9) }

// ─── Helpers ──────────────────────────────────────────────
function loadJSON(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb } catch { return fb }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

function toMonthly(amount, freqId) {
  const f = FREQS.find(f => f.id === freqId)
  return (amount * (f?.perYear ?? 12)) / 12
}

function fmt(v) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.abs(v))
}

function fmtY(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function fmtDiff(v) {
  return (v >= 0 ? '+' : '−') + fmtY(Math.abs(v))
}

function monthKey(dateStr) {
  const [m, , y] = dateStr.split('/')
  return `${y}-${m.padStart(2, '0')}`
}

function eventSummary(e) {
  switch (e.type) {
    case 'salary_raise':   return `+${e.pct ?? '?'}% raise`
    case 'job_change':     return `New job ${e.newSalary ? fmt(e.newSalary) + '/yr' : ''}${e.gapMonths > 0 ? `, ${e.gapMonths}mo gap` : ''}`
    case 'large_purchase': return `${fmt(e.amount ?? 0)} one-time`
    case 'new_expense':    return `+${fmt(e.monthlyAmount ?? 0)}/mo expense`
    case 'side_income':    return `+${fmt(e.monthlyAmount ?? 0)}/mo income`
    case 'home_purchase':  return `${fmt(e.downPayment ?? 0)} down, ${fmt(e.monthlyMortgage ?? 0)}/mo`
    case 'windfall':       return `+${fmt(e.amount ?? 0)} windfall`
    case 'retirement':     return 'Income stops'
    default:               return ''
  }
}

const CHART_STYLE = {
  contentStyle: {
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '10px', fontSize: '12px', padding: '10px 14px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  },
  itemStyle: { color: 'var(--text-h)', padding: 0 },
  labelStyle: { color: 'var(--text)', fontWeight: 600, marginBottom: 2 },
}
const AX   = { fontSize: 11, fill: '#9ca3af' }
const GRID = 'rgba(128,128,128,0.09)'

// ─── Projection engine ─────────────────────────────────────
function runProjection({
  startCash, startSavBal, startInvBals,
  monthlyIncome, monthlySpending, savingsMonthly, savingsGoal, savingsApy,
  invParams, years, events = [],
}) {
  const savCap = savingsGoal > 0 ? savingsGoal : Infinity
  let cash     = startCash
  let savBal   = startSavBal
  let invBals  = { ...startInvBals }
  let income   = monthlyIncome
  let spending = monthlySpending
  const invRates = Object.fromEntries(TICKERS.map(t => [t.id, invParams[t.id]?.rate ?? 0]))
  const invMo    = Object.fromEntries(TICKERS.map(t => [t.id, invParams[t.id]?.monthly ?? 0]))

  // Index events by month
  const eventMap = new Map()
  for (const e of events) {
    const m = Math.round((parseFloat(e.year) || 0) * 12)
    if (!eventMap.has(m)) eventMap.set(m, [])
    eventMap.get(m).push(e)
  }

  let gapLeft      = 0
  let pendingInc   = null
  const pts        = []

  for (let m = 0; m <= years * 12; m++) {
    for (const e of (eventMap.get(m) ?? [])) {
      switch (e.type) {
        case 'salary_raise':
          income *= 1 + (parseFloat(e.pct) || 0) / 100
          break
        case 'job_change':
          gapLeft    = Math.max(0, parseInt(e.gapMonths) || 0)
          pendingInc = (parseFloat(e.newSalary) || 0) / 12
          if (gapLeft === 0) { income = pendingInc; pendingInc = null }
          else income = 0
          break
        case 'large_purchase':
          cash -= parseFloat(e.amount) || 0
          break
        case 'new_expense':
          spending += parseFloat(e.monthlyAmount) || 0
          break
        case 'side_income':
          income += parseFloat(e.monthlyAmount) || 0
          break
        case 'home_purchase':
          cash    -= parseFloat(e.downPayment)    || 0
          spending += parseFloat(e.monthlyMortgage) || 0
          break
        case 'windfall':
          cash += parseFloat(e.amount) || 0
          break
        case 'retirement':
          income = 0
          break
      }
    }

    if (m > 0) {
      if (gapLeft > 0) {
        gapLeft--
        if (gapLeft === 0 && pendingInc !== null) { income = pendingInc; pendingInc = null }
      }
      const totalInvMo = TICKERS.reduce((s, t) => s + invMo[t.id], 0)
      const savAdd     = savBal < savCap ? savingsMonthly : 0
      cash += income - spending - savAdd - totalInvMo
      const sr = savingsApy / 12
      savBal   = sr > 0 ? savBal * (1 + sr) + savAdd : savBal + savAdd
      for (const t of TICKERS) {
        const ir = invRates[t.id] / 12
        invBals[t.id] = invBals[t.id] * (1 + ir) + invMo[t.id]
      }
    }

    if (m % 12 === 0) {
      const cashV = Math.round(Math.max(0, cash))
      const savV  = Math.round(Math.max(0, savBal))
      const pt    = { year: m / 12, Cash: cashV, Savings: savV }
      let total   = cashV + savV
      for (const t of TICKERS) {
        const v = Math.round(Math.max(0, invBals[t.id]))
        pt[t.id] = v; total += v
      }
      pt.total = total
      pts.push(pt)
    }
  }
  return pts
}

// ─── EventCard ─────────────────────────────────────────────
function EventCard({ event, onDelete }) {
  const et = EVENT_TYPES.find(t => t.id === event.type)
  return (
    <div className="sc-event">
      <div className="sc-event-yr">{event.year === 0 ? 'Now' : `Yr ${event.year}`}</div>
      <div className="sc-event-icon" style={{ background: et?.color + '22', color: et?.color }}>
        {et?.icon}
      </div>
      <div className="sc-event-body">
        <span className="sc-event-type">{event.label || et?.label}</span>
        <span className="sc-event-sum">{eventSummary(event)}</span>
      </div>
      <button className="sc-event-del" onClick={onDelete} title="Remove">✕</button>
    </div>
  )
}

// ─── AddEventForm ──────────────────────────────────────────
function AddEventForm({ onAdd, onCancel }) {
  const [step, setStep]     = useState('type')   // 'type' | 'fields'
  const [selType, setSelType] = useState(null)
  const [year, setYear]     = useState(1)
  const [label, setLabel]   = useState('')
  const [fields, setFields] = useState({})

  function pickType(t) { setSelType(t); setStep('fields') }

  function submit() {
    if (!selType) return
    onAdd({ id: newId(), type: selType.id, year: parseFloat(year) || 0, label, ...fields })
    onCancel()
  }

  const et = selType

  return (
    <div className="sc-add-form">
      {step === 'type' ? (
        <>
          <div className="sc-add-title">Choose event type</div>
          <div className="sc-type-grid">
            {EVENT_TYPES.map(t => (
              <button key={t.id} className="sc-type-btn" onClick={() => pickType(t)}
                style={{ '--et-color': t.color }}>
                <span className="sc-type-icon">{t.icon}</span>
                <span className="sc-type-label">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="sc-add-cancel-row">
            <button className="sc-form-cancel" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <button className="sc-back-btn" onClick={() => { setStep('type'); setSelType(null) }}>
            ← Back
          </button>
          <div className="sc-add-title" style={{ color: et.color }}>{et.icon} {et.label}</div>
          <div className="sc-add-desc">{et.desc}</div>

          <div className="sc-field-grid">
            {/* Year field */}
            <div className="sc-field">
              <label className="sc-field-label">Year from now</label>
              <div className="sc-field-iw">
                <input className="sc-field-inp" type="number"
                  min="0" max="30" step="0.5"
                  value={year} onChange={e => setYear(e.target.value)} />
              </div>
            </div>

            {/* Type-specific fields */}
            {et.fields.map(f => (
              <div key={f.key} className="sc-field">
                <label className="sc-field-label">{f.label}</label>
                <div className="sc-field-iw">
                  {f.prefix && <span className="sc-field-pfx">{f.prefix}</span>}
                  <input className="sc-field-inp" type="number"
                    placeholder={f.placeholder}
                    value={fields[f.key] ?? ''}
                    onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} />
                  {f.suffix && <span className="sc-field-sfx">{f.suffix}</span>}
                </div>
              </div>
            ))}

            {/* Optional label */}
            <div className="sc-field sc-field-full">
              <label className="sc-field-label">Label (optional)</label>
              <div className="sc-field-iw">
                <input className="sc-field-inp sc-field-text" type="text"
                  placeholder={et.label}
                  value={label} onChange={e => setLabel(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="sc-form-actions">
            <button className="sc-form-cancel" onClick={onCancel}>Cancel</button>
            <button className="sc-form-add" onClick={submit}
              style={{ background: et.color }}>
              Add Event
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────
export function Scenarios({ allActiveTxs, stocksData }) {
  const [years,     setYears]     = useState(10)
  const [scenarios, setScenarios] = useState(() => loadJSON(SK_SCENARIOS, []))
  const [activeId,  setActiveId]  = useState(() => loadJSON(SK_ACTIVE, null))
  const [addingEvent, setAddingEvent] = useState(false)
  const [renamingId, setRenamingId]  = useState(null)
  const [renameVal,  setRenameVal]   = useState('')

  // ── Load baseline financial params ───────────────────────
  const incData  = loadJSON('finance-income-v1', { amount: '', freq: 'biweekly' })
  const taxAmt   = parseFloat(loadJSON('finance-tax-v1', '')) || 0
  const budgets  = loadJSON('finance-budget-v1', {})
  const savForm  = loadJSON('finance-savings-v1', { balance: '', monthly: '', rate: '4.5', goal: '' })
  const balance  = parseFloat(loadJSON('finance-balance-v1', '')) || 0
  const split    = loadJSON('finance-invest-split-v1', { VOO: 50, QQQ: 50 })
  const investForms = Object.fromEntries(
    TICKERS.map(t => [t.id, loadJSON(`finance-invest-${t.id}-v1`, { initial: '', monthly: '', customRate: '' })])
  )

  const monthlyGross  = incData.amount ? toMonthly(parseFloat(incData.amount) || 0, incData.freq) : 0
  const monthlyTax    = taxAmt ? toMonthly(taxAmt, incData.freq) : 0
  const monthlyIncome = monthlyGross - monthlyTax

  const savingsBalance = parseFloat(savForm.balance)  || 0
  const savingsMonthly = parseFloat(savForm.monthly)  || parseFloat(budgets['__savings__']) || 0
  const savingsGoal    = parseFloat(savForm.goal) || 0
  const savingsApy     = parseFloat(savForm.rate) / 100 || 0.045
  const budgetInvest   = parseFloat(budgets['__investments__']) || 0

  const invParams = useMemo(() => TICKERS.reduce((acc, { id, defaultCagr }) => {
    const form    = investForms[id]
    const sd      = stocksData[id]
    const bestCagr = sd ? (sd.cagr10y ?? sd.cagr5y ?? sd.cagr1y ?? defaultCagr) : defaultCagr
    const splitPct = parseFloat(split[id]) || 0
    acc[id] = {
      initial: parseFloat(form?.initial) || 0,
      monthly: parseFloat(form?.monthly) || (budgetInvest * splitPct / 100),
      rate:    parseFloat(form?.customRate) > 0 ? parseFloat(form.customRate) / 100 : bestCagr,
    }
    return acc
  }, {}), [investForms, budgetInvest, split, stocksData])

  // Average spending from transactions (last 6 months), fall back to budget
  const avgSpending = useMemo(() => {
    const flowMap = new Map()
    for (const t of allActiveTxs) {
      if (t.amount >= 0) continue
      const k = monthKey(t.date)
      flowMap.set(k, (flowMap.get(k) || 0) + Math.abs(t.amount))
    }
    const sorted = [...flowMap.values()].slice(-6)
    return sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0
  }, [allActiveTxs])

  const recurring = loadJSON('finance-recurring-v1', [])
  const recurringMonthly = recurring
    .filter(r => r.enabled)
    .reduce((s, r) => {
      const a = parseFloat(r.amount) || 0
      return s + (r.freq === 'yearly' ? a / 12 : a)
    }, 0)
  const budgetedSpending = Object.entries(budgets)
    .filter(([k]) => !k.startsWith('__'))
    .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0) + recurringMonthly
  const monthlySpending = avgSpending > 0 ? avgSpending : budgetedSpending

  const baseParams = {
    startCash:     balance,
    startSavBal:   savingsBalance,
    startInvBals:  Object.fromEntries(TICKERS.map(t => [t.id, invParams[t.id].initial])),
    monthlyIncome,
    monthlySpending,
    savingsMonthly,
    savingsGoal,
    savingsApy,
    invParams,
    years,
  }

  const baselineData = useMemo(
    () => runProjection({ ...baseParams, events: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [years, balance, savingsBalance, monthlyIncome, monthlySpending, savingsMonthly, savingsGoal, savingsApy, JSON.stringify(invParams)]
  )

  const activeScenario = scenarios.find(s => s.id === activeId) ?? null

  const scenarioData = useMemo(() => {
    if (!activeScenario) return null
    return runProjection({ ...baseParams, events: activeScenario.events ?? [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario, years, balance, savingsBalance, monthlyIncome, monthlySpending, savingsMonthly, savingsGoal, savingsApy, JSON.stringify(invParams)])

  const chartData = useMemo(() => baselineData.map((b, i) => ({
    year:     b.year,
    Baseline: b.total,
    Scenario: scenarioData?.[i]?.total ?? null,
  })), [baselineData, scenarioData])

  const milestones = [1, 5, 10, 20, 30].filter(y => y <= years)

  // ── Scenario management ──────────────────────────────────
  function createScenario() {
    const id  = newId()
    const s   = { id, name: 'New Scenario', events: [] }
    const next = [...scenarios, s]
    setScenarios(next); saveJSON(SK_SCENARIOS, next)
    setActiveId(id);    saveJSON(SK_ACTIVE, id)
  }

  function deleteScenario(id) {
    const next = scenarios.filter(s => s.id !== id)
    setScenarios(next); saveJSON(SK_SCENARIOS, next)
    if (activeId === id) {
      const newActive = next[0]?.id ?? null
      setActiveId(newActive); saveJSON(SK_ACTIVE, newActive)
    }
  }

  function switchScenario(id) {
    setActiveId(id); saveJSON(SK_ACTIVE, id)
    setAddingEvent(false)
  }

  function renameScenario(id, name) {
    const next = scenarios.map(s => s.id === id ? { ...s, name } : s)
    setScenarios(next); saveJSON(SK_SCENARIOS, next)
  }

  function addEvent(event) {
    const next = scenarios.map(s =>
      s.id === activeId
        ? { ...s, events: [...(s.events ?? []), event].sort((a, b) => a.year - b.year) }
        : s
    )
    setScenarios(next); saveJSON(SK_SCENARIOS, next)
  }

  function deleteEvent(scenarioId, eventId) {
    const next = scenarios.map(s =>
      s.id === scenarioId
        ? { ...s, events: s.events.filter(e => e.id !== eventId) }
        : s
    )
    setScenarios(next); saveJSON(SK_SCENARIOS, next)
  }

  const eventYears = [...new Set((activeScenario?.events ?? []).map(e => parseFloat(e.year)))].sort((a, b) => a - b)

  // ── AI Insights ──────────────────────────────────────────
  const scenInsights = (() => {
    const out = []
    if (!activeScenario) {
      out.push({ type: 'info', text: 'Create a scenario to model life events and see how they affect your net worth trajectory.' })
      return out
    }
    if (!scenarioData) return out
    const baseEnd = baselineData[baselineData.length - 1]?.total ?? 0
    const scenEnd = scenarioData[scenarioData.length - 1]?.total ?? 0
    const diff    = scenEnd - baseEnd
    const diffPct = baseEnd > 0 ? ((Math.abs(diff) / baseEnd) * 100).toFixed(1) : 0
    if (diff > 0) {
      out.push({ type: 'good', text: `"${activeScenario.name}" adds ${fmtY(diff)} (${diffPct}%) to net worth over ${years} years vs baseline.` })
    } else if (diff < 0) {
      out.push({ type: 'warn', text: `"${activeScenario.name}" results in ${fmtY(Math.abs(diff))} (${diffPct}%) less net worth over ${years} years.`, detail: 'Consider adding a raise or side income to offset the impact.' })
    } else {
      out.push({ type: 'info', text: `This scenario tracks closely with the baseline over ${years} years.` })
    }
    const events = activeScenario.events ?? []
    if (events.length === 0) {
      out.push({ type: 'info', text: 'Add life events to model salary changes, purchases, or income shifts.' })
    } else {
      const raises = events.filter(e => e.type === 'salary_raise')
      if (raises.length > 0) {
        const totalPct = raises.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
        out.push({ type: 'good', text: `${raises.length} raise${raises.length > 1 ? 's' : ''} totaling +${totalPct.toFixed(1)}% income growth planned across this scenario.` })
      }
      const purchases = events.filter(e => e.type === 'large_purchase' || e.type === 'home_purchase')
      if (purchases.length > 0) {
        const totalOut = purchases.reduce((s, e) => s + (parseFloat(e.type === 'home_purchase' ? e.downPayment : e.amount) || 0), 0)
        if (totalOut > 0) out.push({ type: 'warn', text: `${purchases.length} major purchase${purchases.length > 1 ? 's total' : ' totals'} ${fmtY(totalOut)} in planned one-time outflows.` })
      }
      const retirement = events.find(e => e.type === 'retirement')
      if (retirement) {
        out.push({ type: 'info', text: `Early retirement modeled at year ${retirement.year}. Income stops; portfolio must sustain living expenses.` })
      }
    }
    return out
  })()

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="scenarios-page">

      {/* ── Top bar: year selector ──────────────────── */}
      <div className="proj-bar">
        <span className="proj-label">Projection timeline</span>
        <div className="year-tabs">
          {YEAR_OPTIONS.map(y => (
            <button key={y} className={`year-tab ${years === y ? 'active' : ''}`}
              onClick={() => setYears(y)}>{y}Y</button>
          ))}
        </div>
      </div>

      <InsightPanel insights={scenInsights} />

      {/* ── Scenario tabs ───────────────────────────── */}
      <div className="sc-tabs-bar">
        <div className="sc-tabs-scroll">
          {scenarios.length === 0
            ? <span className="sc-tabs-empty">No scenarios — create one to get started</span>
            : scenarios.map(s => (
              <div key={s.id}
                className={`sc-tab ${s.id === activeId ? 'active' : ''}`}
                onClick={() => switchScenario(s.id)}>
                {renamingId === s.id ? (
                  <input
                    className="sc-rename-inp"
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => { renameScenario(s.id, renameVal || s.name); setRenamingId(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { renameScenario(s.id, renameVal || s.name); setRenamingId(null) }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="sc-tab-name"
                    onDoubleClick={e => { e.stopPropagation(); setRenamingId(s.id); setRenameVal(s.name) }}
                    title="Double-click to rename">
                    {s.name}
                  </span>
                )}
                <span className="sc-tab-count">{s.events?.length ?? 0}</span>
                <button className="sc-tab-del"
                  onClick={e => { e.stopPropagation(); deleteScenario(s.id) }}
                  title="Delete scenario">✕</button>
              </div>
            ))
          }
        </div>
        <button className="sc-new-btn" onClick={createScenario}>+ New</button>
      </div>

      {/* ── No scenarios empty state ─────────────────── */}
      {scenarios.length === 0 ? (
        <div className="sc-no-scenario">
          <div className="sc-ns-title">No scenarios yet</div>
          <div className="sc-ns-sub">Create a scenario to model life events and see how they affect your net worth trajectory over time.</div>
          <button className="sc-form-add" style={{ background: '#818cf8' }} onClick={createScenario}>
            Create first scenario
          </button>
        </div>
      ) : (
        <div className="sc-layout">

          {/* ── Sidebar: events for active scenario ─── */}
          <div className="sc-sidebar">
            <div className="sc-panel-title">
              Events
              {activeScenario && !addingEvent && (
                <button className="sc-new-btn" onClick={() => setAddingEvent(true)}>+ Add</button>
              )}
            </div>

            {!activeScenario ? (
              <div className="sc-empty-hint">Select a scenario above to view its events.</div>
            ) : activeScenario.events.length === 0 ? (
              <div className="sc-empty-hint">No events yet — click <strong>+ Add</strong> to model a life change.</div>
            ) : (
              <div className="sc-event-list">
                {activeScenario.events.map(e => (
                  <EventCard key={e.id} event={e}
                    onDelete={() => deleteEvent(activeScenario.id, e.id)} />
                ))}
              </div>
            )}
          </div>

          {/* ── Main panel ──────────────────────────── */}
          <div className="sc-main">

            {/* Add event form — full width in main panel */}
            {addingEvent && (
              <AddEventForm
                onAdd={addEvent}
                onCancel={() => setAddingEvent(false)}
              />
            )}

            {!activeScenario ? (
              <div className="sc-no-scenario">
                <div className="sc-ns-title">Select a scenario</div>
                <div className="sc-ns-sub">Choose a scenario above or create a new one.</div>
              </div>
            ) : (
              <>
                {/* Comparison chart */}
                <div className="sc-chart-card">
                  <div className="sc-chart-title">
                    Net Worth: Baseline vs
                    <span className="sc-chart-scenario-name"> {activeScenario.name}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="year" tick={AX} tickLine={false} axisLine={false}
                        tickFormatter={v => `${v}y`} />
                      <YAxis tick={AX} tickLine={false} axisLine={false}
                        tickFormatter={fmtY} width={64} />
                      <Tooltip {...CHART_STYLE}
                        formatter={(v, k) => [fmtY(v), k]}
                        labelFormatter={v => `Year ${v}`} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {eventYears.filter(y => y > 0 && y <= years).map(y => (
                        <ReferenceLine key={y} x={y} stroke="rgba(129,140,248,0.25)"
                          strokeDasharray="4 3" />
                      ))}
                      <Line type="monotone" dataKey="Baseline" stroke="#6b7280"
                        strokeWidth={2} strokeDasharray="6 4" dot={false} />
                      <Line type="monotone" dataKey="Scenario" stroke="#818cf8"
                        strokeWidth={2.5} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Impact table */}
                <div className="sc-impact-card">
                  <div className="sc-impact-title">Impact at key milestones</div>
                  <div className="sc-impact-table">
                    <div className="sc-impact-header">
                      <span>Year</span>
                      <span>Baseline</span>
                      <span>Scenario</span>
                      <span>Difference</span>
                    </div>
                    {milestones.map(y => {
                      const b    = baselineData[y]?.total ?? 0
                      const s    = scenarioData?.[y]?.total ?? 0
                      const diff = s - b
                      return (
                        <div key={y} className="sc-impact-row">
                          <span className="sc-impact-yr">Year {y}</span>
                          <span className="sc-impact-val">{fmtY(b)}</span>
                          <span className="sc-impact-val sc-scenario-val">{fmtY(s)}</span>
                          <span className={`sc-impact-diff ${diff >= 0 ? 'positive' : 'negative'}`}>
                            {fmtDiff(diff)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Event timeline legend */}
                {activeScenario.events.length > 0 && (
                  <div className="sc-events-legend">
                    <div className="sc-impact-title">Event timeline</div>
                    <div className="sc-legend-list">
                      {activeScenario.events.map(e => {
                        const et = EVENT_TYPES.find(t => t.id === e.type)
                        return (
                          <div key={e.id} className="sc-legend-row">
                            <div className="sc-legend-dot" style={{ background: et?.color }} />
                            <span className="sc-legend-yr">Yr {e.year}</span>
                            <span className="sc-legend-name">{e.label || et?.label}</span>
                            <span className="sc-legend-sum">{eventSummary(e)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
