import { useState, useMemo } from 'react'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { InsightPanel } from './InsightPanel'

const RT_KEY      = 'finance-retirement-v1'
const YEAR_OPTIONS = [5, 10, 20, 30]
const FREQS        = [
  { id: 'biweekly', perYear: 26 },
  { id: 'monthly',  perYear: 12 },
  { id: 'yearly',   perYear: 1  },
]
const SPECIAL_KEYS = new Set(['__savings__', '__investments__'])

function loadJSON(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb } catch { return fb }
}
function toMonthly(amount, freqId) {
  const f = FREQS.find(f => f.id === freqId)
  return (amount * (f?.perYear ?? 12)) / 12
}
function fmt(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(v))
}
function fmtFull(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
}
function fmtSigned(v) {
  return (v >= 0 ? '+' : '−') + fmt(v)
}
function fmtY(v) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function NWCard({ label, value, pct, sub, color, large, signed }) {
  const display = pct !== undefined
    ? `${pct.toFixed(1)}%`
    : signed ? fmtSigned(value) : fmtY(value)
  return (
    <div className={`nw-stat-card${large ? ' nwsc-large' : ''}`}>
      <div className="nwsc-top" style={{ '--nwsc-accent': color }} />
      <span className="nwsc-label">{label}</span>
      <span className="nwsc-value" style={{ color }}>{display}</span>
      {sub && <span className="nwsc-sub">{sub}</span>}
    </div>
  )
}

export function NetWorth() {
  const [years,       setYears]       = useState(10)
  const [assumedRate, setAssumedRate] = useState('7')

  // ── Retirement data ──────────────────────────────────────
  const rtData = loadJSON(RT_KEY, null)

  const hsaTotal = useMemo(() => {
    if (!rtData?.entries) return 0
    return rtData.entries.reduce((s, e) => s + (e.hsaEmp || 0) + (e.hsaMatch || 0), 0)
  }, [rtData])

  const k401Total = useMemo(() => {
    if (!rtData?.entries) return 0
    return rtData.entries.reduce((s, e) => s + (e.k401Emp || 0) + (e.k401Match || 0), 0)
  }, [rtData])

  const hysaBalance = useMemo(() => {
    if (!rtData?.hysa) return 0
    const txTotal = (rtData.hysa.transactions ?? []).reduce(
      (s, t) => s + (t.type === 'contribution' ? t.amount : -t.amount), 0)
    return (rtData.hysa.startingBalance ?? 0) + txTotal
  }, [rtData])

  // ── Budget data ──────────────────────────────────────────
  const balance   = parseFloat(loadJSON('finance-balance-v1', '')) || 0
  const incData   = loadJSON('finance-income-v1', { amount: '', freq: 'biweekly' })
  const taxAmt    = parseFloat(loadJSON('finance-tax-v1', ''))    || 0
  const budgets   = loadJSON('finance-budget-v1', {})
  const recurring = loadJSON('finance-recurring-v1', [])

  // ── Income / expenses ────────────────────────────────────
  const monthlyGross    = incData.amount ? toMonthly(parseFloat(incData.amount) || 0, incData.freq) : 0
  const monthlyTax      = taxAmt ? toMonthly(taxAmt, incData.freq) : 0
  const monthlyTakeHome = monthlyGross - monthlyTax
  const hasIncome       = monthlyTakeHome > 0

  const recurringMonthly = recurring
    .filter(r => r.enabled !== false)
    .reduce((s, r) => s + (r.freq === 'yearly' ? (parseFloat(r.amount) || 0) / 12 : parseFloat(r.amount) || 0), 0)

  const budgetedVar = Object.entries(budgets)
    .filter(([k]) => !SPECIAL_KEYS.has(k))
    .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0)

  const monthlyExpenses = recurringMonthly + budgetedVar
  const monthlySurplus  = hasIncome ? monthlyTakeHome - monthlyExpenses : 0

  const savingsRatePct = hasIncome && monthlyTakeHome > 0
    ? Math.max(0, (monthlySurplus / monthlyTakeHome) * 100)
    : null

  // ── Current net worth ────────────────────────────────────
  const currentNetWorth = balance + hysaBalance + hsaTotal + k401Total

  // ── Projection ───────────────────────────────────────────
  const annualRate = Math.max(0, parseFloat(assumedRate) || 0) / 100

  const projData = useMemo(() => {
    const r  = annualRate / 12
    let   nw = currentNetWorth
    const pts = []
    for (let m = 0; m <= years * 12; m++) {
      if (m > 0) nw = r > 0 ? nw * (1 + r) + monthlySurplus : nw + monthlySurplus
      if (m % 12 === 0) pts.push({ year: m / 12, total: Math.round(Math.max(0, nw)) })
    }
    return pts
  }, [years, annualRate, currentNetWorth, monthlySurplus])

  const projFinal  = projData[projData.length - 1]?.total ?? currentNetWorth
  const milestones = YEAR_OPTIONS.filter(y => y <= years && projData[y])

  // ── Insights ─────────────────────────────────────────────
  const insights = useMemo(() => {
    const out = []
    if (!hasIncome) {
      out.push({ type: 'info', text: 'Set your income in the Budget tab to generate projections.', detail: 'Projections need income and spending data to model your monthly trajectory.' })
      return out
    }
    if (monthlySurplus < 0) {
      out.push({ type: 'bad', text: `Budget exceeds take-home by ${fmt(Math.abs(monthlySurplus))}/mo.`, detail: 'Net worth will shrink over time. Review your budget categories.' })
    } else if (monthlySurplus > 0) {
      out.push({ type: 'good', text: `${fmt(monthlySurplus)}/mo surplus — deploy it into savings or investments.` })
    }
    if (savingsRatePct !== null) {
      if (savingsRatePct >= 25) {
        out.push({ type: 'good', text: `Strong savings rate of ${savingsRatePct.toFixed(1)}% — top quartile of savers.` })
      } else if (savingsRatePct < 10) {
        out.push({ type: 'warn', text: `Savings rate is ${savingsRatePct.toFixed(1)}% — below the recommended 20%.`, detail: `Adding ${fmt(monthlyTakeHome * 0.05)}/mo to savings would move you toward the 20% target.` })
      }
    }
    for (const target of [100000, 250000, 500000, 1000000, 2000000]) {
      if (currentNetWorth < target) {
        const cross = projData.find(p => p.total >= target)
        if (cross) {
          const label = target >= 1000000 ? `$${target / 1000000}M` : `$${target / 1000}K`
          out.push({ type: 'info', text: `At this rate you'll reach ${label} net worth in ${cross.year} year${cross.year !== 1 ? 's' : ''}.` })
        }
        break
      }
    }
    if (currentNetWorth > 1000 && projFinal > currentNetWorth) {
      const cagr = (Math.pow(projFinal / currentNetWorth, 1 / years) - 1) * 100
      if (cagr > 0) out.push({ type: 'good', text: `Projected ${cagr.toFixed(1)}% average annual growth over ${years} years.` })
    }
    return out
  }, [hasIncome, monthlySurplus, savingsRatePct, monthlyTakeHome, currentNetWorth, projData, years, projFinal])

  const CHART_STYLE = {
    contentStyle: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', padding: '10px 14px' },
    itemStyle:    { color: 'var(--text-h)', padding: 0 },
    labelStyle:   { color: 'var(--text)', fontWeight: 600, marginBottom: 2 },
  }
  const AX   = { fontSize: 11, fill: '#9ca3af' }
  const GRID = 'rgba(128,128,128,0.09)'

  return (
    <div className="networth-page">

      {/* ── Controls bar ── */}
      <div className="proj-bar">
        <span className="proj-label">Timeline</span>
        <div className="year-tabs">
          {YEAR_OPTIONS.map(y => (
            <button key={y} className={`year-tab ${years === y ? 'active' : ''}`} onClick={() => setYears(y)}>
              {y}Y
            </button>
          ))}
        </div>
        <span className="proj-label nw-rate-sep">Assumed return</span>
        <div className="nw-rate-wrap">
          <input type="number" min="0" max="30" step="0.5" className="nw-rate-input"
            value={assumedRate} onChange={e => setAssumedRate(e.target.value)} />
          <span className="nw-rate-pct">%/yr</span>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="nw-section nw-section-cards">
        <NWCard label="Current Net Worth"   value={currentNetWorth} color="#818cf8" large />
        <NWCard label={`In ${years} Years`} value={projFinal} color="#4ade80" large
          sub={projFinal > currentNetWorth ? `+${fmtY(projFinal - currentNetWorth)} growth` : '—'} />
        <NWCard label="Monthly Surplus" value={monthlySurplus}
          color={monthlySurplus >= 0 ? '#4ade80' : '#f87171'} signed
          sub={hasIncome ? `${fmt(monthlyExpenses)}/mo in expenses` : 'Set income in Budget'} />
        {savingsRatePct !== null
          ? <NWCard label="Savings Rate" pct={savingsRatePct}
              color={savingsRatePct >= 20 ? '#4ade80' : savingsRatePct >= 10 ? '#fbbf24' : '#f87171'}
              sub={`${fmt(monthlySurplus)}/mo available`} />
          : <NWCard label="Savings Rate" pct={0} color="#6b7280" sub="Set income in Budget" />}
      </div>

      {/* ── Insights ── */}
      <div className="nw-section">
        <InsightPanel insights={insights} />
      </div>

      {/* ── Asset breakdown ── */}
      <div className="nw-section">
        <div className="nw-section-title">Assets</div>
        <div className="nw-asset-grid">
          {[
            { icon: '🏛', label: 'Bank / Checking', value: balance },
            { icon: '💵', label: 'HYSA',             value: hysaBalance },
            { icon: '🏥', label: 'HSA',              value: hsaTotal },
            { icon: '🏦', label: '401k',             value: k401Total },
          ].map(({ icon, label, value }) => (
            <div key={label} className="nw-asset-card">
              <span className="nw-asset-icon">{icon}</span>
              <span className="nw-asset-label">{label}</span>
              <span className="nw-asset-value">{fmtFull(value)}</span>
            </div>
          ))}
          <div className="nw-asset-card nw-asset-note-card">
            <span className="nw-asset-icon">📊</span>
            <span className="nw-asset-label">Stocks / ESPP / Brokerage / RSU</span>
            <span className="nw-asset-value muted">tracked in Retirement tab</span>
          </div>
        </div>
      </div>

      {/* ── Projection chart ── */}
      <div className="nw-section">
        <div className="nw-section-title">Net Worth Projection</div>
        <div className="nw-chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={projData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="year" tick={AX} tickLine={false} axisLine={false} tickFormatter={v => `${v}y`} />
              <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={fmtY} width={64} />
              <Tooltip {...CHART_STYLE}
                formatter={v => [fmt(v), 'Net Worth']}
                labelFormatter={v => `Year ${v}`} />
              <Area type="monotone" dataKey="total" name="Net Worth"
                stroke="#818cf8" fill="url(#nwGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>

          {milestones.length > 0 && (
            <div className="nw-milestones">
              {milestones.map(y => (
                <div key={y} className="nw-ms">
                  <span className="nw-ms-yr">{y}Y</span>
                  <span className="nw-ms-val">{fmtY(projData[y]?.total ?? 0)}</span>
                  <span className="nw-ms-delta">{projData[y] ? `+${fmtY(projData[y].total - currentNetWorth)}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Assumptions ── */}
      <div className="nw-section nw-assumptions">
        <div className="nw-section-title">Projection Assumptions</div>
        <div className="nw-assume-grid">
          <div className="nw-assume-item">
            <span className="nw-assume-label">Take-home / mo</span>
            <span className="nw-assume-val">{fmt(monthlyTakeHome)}</span>
            <span className="nw-assume-note">set in Budget tab</span>
          </div>
          <div className="nw-assume-item">
            <span className="nw-assume-label">Expenses / mo</span>
            <span className="nw-assume-val">{fmt(monthlyExpenses)}</span>
            <span className="nw-assume-note">{fmt(recurringMonthly)} fixed + {fmt(budgetedVar)} variable</span>
          </div>
          <div className="nw-assume-item">
            <span className="nw-assume-label">Surplus / mo</span>
            <span className="nw-assume-val" style={{ color: monthlySurplus >= 0 ? '#4ade80' : '#f87171' }}>
              {fmtSigned(monthlySurplus)}
            </span>
            <span className="nw-assume-note">added to net worth each month</span>
          </div>
          <div className="nw-assume-item">
            <span className="nw-assume-label">Annual return</span>
            <span className="nw-assume-val">{assumedRate}%</span>
            <span className="nw-assume-note">applied to cumulative net worth</span>
          </div>
        </div>
      </div>

    </div>
  )
}
