import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { InsightPanel } from './InsightPanel'

// ─── Constants ────────────────────────────────────────────
const TICKERS = [
  { id: 'VOO', color: '#4ade80', defaultCagr: 0.128 },
  { id: 'QQQ', color: '#fb923c', defaultCagr: 0.178 },
]

const YEAR_OPTIONS = [5, 10, 20, 30]

const CAT_COLORS = [
  '#818cf8','#fb923c','#34d399','#f472b6',
  '#38bdf8','#fbbf24','#a78bfa','#4ade80',
  '#f87171','#2dd4bf','#e879f9','#fdba74',
]

const FREQS = [
  { id: 'biweekly', perYear: 26 },
  { id: 'monthly',  perYear: 12 },
  { id: 'yearly',   perYear: 1  },
]

// ─── Helpers ──────────────────────────────────────────────
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

function fmtSigned(v) {
  return (v >= 0 ? '+' : '−') + fmt(v)
}

function fmtY(v) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function monthKey(dateStr) {
  const [m, , y] = dateStr.split('/')
  return `${y}-${m.padStart(2, '0')}`
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
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

// ─── Summary card ──────────────────────────────────────────
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

// ─── Main component ────────────────────────────────────────
export function NetWorth({ allActiveTxs, stocksData }) {
  const [years, setYears] = useState(10)

  // ── Read all stored financial state ─────────────────────
  const balance    = parseFloat(loadJSON('finance-balance-v1', ''))  || 0
  const incData    = loadJSON('finance-income-v1', { amount: '', freq: 'biweekly' })
  const taxAmt     = parseFloat(loadJSON('finance-tax-v1', ''))       || 0
  const budgets    = loadJSON('finance-budget-v1', {})
  const savForm    = loadJSON('finance-savings-v1', { balance: '', monthly: '', rate: '4.5' })
  const split      = loadJSON('finance-invest-split-v1', { VOO: 50, QQQ: 50 })
  const investForms = Object.fromEntries(
    TICKERS.map(t => [t.id, loadJSON(`finance-invest-${t.id}-v1`, { initial: '', monthly: '', customRate: '' })])
  )

  // ── Derived income ───────────────────────────────────────
  const monthlyGross    = incData.amount ? toMonthly(parseFloat(incData.amount) || 0, incData.freq) : 0
  const monthlyTax      = taxAmt ? toMonthly(taxAmt, incData.freq) : 0
  const monthlyTakeHome = monthlyGross - monthlyTax
  const hasIncome       = monthlyTakeHome > 0

  // ── Transaction analytics ────────────────────────────────
  const { monthlyStats, avgSpending, categoryMonthData, topCategories } = useMemo(() => {
    const flowMap  = new Map()   // month → { income, spending }
    const catMap   = new Map()   // month → { cat: amount }
    const catTotal = new Map()   // cat   → total

    for (const t of allActiveTxs) {
      const key = monthKey(t.date)
      if (!flowMap.has(key)) flowMap.set(key, { month: key, income: 0, spending: 0 })
      const d = flowMap.get(key)

      if (t.amount > 0) {
        d.income += t.amount
      } else {
        const spent = Math.abs(t.amount)
        d.spending += spent
        const cat = t.category || '(Uncategorized)'
        catTotal.set(cat, (catTotal.get(cat) || 0) + spent)
        if (!catMap.has(key)) catMap.set(key, {})
        const cm = catMap.get(key)
        cm[cat] = (cm[cat] || 0) + spent
      }
    }

    const monthlyStats = [...flowMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, net: m.income - m.spending }))

    const recent = monthlyStats.slice(-6)
    const avgSpending = recent.length
      ? recent.reduce((s, m) => s + m.spending, 0) / recent.length
      : 0

    const topCategories = [...catTotal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([c]) => c)

    const categoryMonthData = [...catMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, cats]) => ({
        month: monthLabel(key),
        ...Object.fromEntries(topCategories.map(c => [c, Math.round(cats[c] || 0)])),
      }))

    return { monthlyStats, avgSpending, categoryMonthData, topCategories }
  }, [allActiveTxs])

  // ── Investment params ────────────────────────────────────
  const budgetInvest = parseFloat(budgets['__investments__']) || 0
  const savingsMonthly = parseFloat(savForm.monthly) || parseFloat(budgets['__savings__']) || 0
  const savingsBalance = parseFloat(savForm.balance) || 0
  const savingsApy     = parseFloat(savForm.rate) / 100 || 0.045
  const savingsGoal    = parseFloat(savForm.goal)  || 0
  const savCap         = savingsGoal > 0 ? savingsGoal : Infinity

  const invParams = TICKERS.reduce((acc, { id, defaultCagr }) => {
    const form     = investForms[id]
    const sd       = stocksData[id]
    const bestCagr = sd ? (sd.cagr10y ?? sd.cagr5y ?? sd.cagr1y ?? defaultCagr) : defaultCagr
    const splitPct = parseFloat(split[id]) || 0
    acc[id] = {
      initial: parseFloat(form?.initial)    || 0,
      monthly: parseFloat(form?.monthly)    || (budgetInvest * splitPct / 100),
      rate:    parseFloat(form?.customRate) > 0 ? parseFloat(form.customRate) / 100 : bestCagr,
    }
    return acc
  }, {})

  const totalInvestMonthly = TICKERS.reduce((s, t) => s + invParams[t.id].monthly, 0)

  // Effective monthly spending — prefer transaction average, fall back to budget
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
  const effectiveSpending = avgSpending > 0 ? avgSpending : budgetedSpending

  // Display-only cash surplus (at current savings rate, before goal is hit)
  const monthlyCashDelta = hasIncome
    ? monthlyTakeHome - effectiveSpending - savingsMonthly - totalInvestMonthly
    : 0

  const currentInvestValue = TICKERS.reduce((s, t) => s + invParams[t.id].initial, 0)
  const currentNetWorth    = balance + savingsBalance + currentInvestValue

  const savingsRatePct = hasIncome && effectiveSpending > 0
    ? Math.max(0, ((monthlyTakeHome - effectiveSpending) / monthlyTakeHome) * 100)
    : null

  // ── Projection ───────────────────────────────────────────
  const projData = useMemo(() => {
    let cash   = balance
    let savBal = savingsBalance
    const invBals = Object.fromEntries(TICKERS.map(t => [t.id, invParams[t.id].initial]))
    const pts  = []

    for (let m = 0; m <= years * 12; m++) {
      if (m > 0) {
        // Savings: stop contributions once goal is reached; freed money stays in cash
        const sr     = savingsApy / 12
        const savAdd = savBal < savCap ? savingsMonthly : 0
        savBal = sr > 0 ? savBal * (1 + sr) + savAdd : savBal + savAdd

        // Cash: subtract only what was actually deposited to savings
        if (hasIncome) {
          cash += monthlyTakeHome - effectiveSpending - savAdd - totalInvestMonthly
        }

        // Each investment compounds monthly
        for (const { id } of TICKERS) {
          const ir = invParams[id].rate / 12
          invBals[id] = invBals[id] * (1 + ir) + invParams[id].monthly
        }
      }

      if (m % 12 === 0) {
        const cashVal = Math.round(Math.max(0, cash))
        const savVal  = Math.round(Math.max(0, savBal))
        const pt      = { year: m / 12, Cash: cashVal, 'Savings (HYSA)': savVal }
        let total     = cashVal + savVal
        for (const t of TICKERS) {
          const v = Math.round(Math.max(0, invBals[t.id]))
          pt[t.id] = v
          total   += v
        }
        pt.total = total
        pts.push(pt)
      }
    }
    return pts
  }, [years, balance, savingsBalance, savingsApy, savingsMonthly, monthlyCashDelta,
      invParams, stocksData])

  const projFinal = projData[projData.length - 1]?.total ?? currentNetWorth
  const milestones = YEAR_OPTIONS.filter(y => y <= years && projData[y])

  // ── AI Insights ──────────────────────────────────────────
  const nwInsights = (() => {
    const out = []
    if (!hasIncome) {
      out.push({ type: 'info', text: 'Set your income in the Budget tab to generate net worth projections.', detail: 'Projections need income and spending data to model your monthly trajectory.' })
      return out
    }
    const totalSurplus = monthlyCashDelta + savingsMonthly + totalInvestMonthly
    if (totalSurplus < 0) {
      out.push({ type: 'bad', text: `Spending exceeds income by ${fmt(Math.abs(totalSurplus))}/mo.`, detail: 'Net worth will decline over time. Reducing expenses or increasing income reverses this.' })
    } else {
      out.push({ type: 'good', text: `${fmt(totalSurplus)}/mo flows toward wealth-building (savings + investments).` })
    }
    if (savingsRatePct !== null) {
      if (savingsRatePct >= 25) {
        out.push({ type: 'good', text: `Excellent savings rate of ${savingsRatePct.toFixed(1)}% — top quartile of savers.` })
      } else if (savingsRatePct < 10) {
        out.push({ type: 'warn', text: `Savings rate is ${savingsRatePct.toFixed(1)}% — below the recommended 20%.`, detail: `Adding ${fmt(monthlyTakeHome * 0.05)}/mo more to savings would put you at the 20% target.` })
      }
    }
    const targets = [100000, 250000, 500000, 1000000, 2000000]
    for (const target of targets) {
      if (currentNetWorth < target) {
        const cross = projData.find(p => p.total >= target)
        if (cross) {
          const label = target >= 1000000 ? `$${target / 1000000}M` : `$${(target / 1000).toFixed(0)}K`
          out.push({ type: 'info', text: `At this rate you'll reach ${label} net worth in ${cross.year} year${cross.year !== 1 ? 's' : ''}.` })
        }
        break
      }
    }
    const investTotal = TICKERS.reduce((s, t) => s + invParams[t.id].initial, 0)
    const liquidTotal = balance + savingsBalance
    if (investTotal === 0 && totalInvestMonthly === 0) {
      out.push({ type: 'warn', text: 'No investment positions or contributions detected.', detail: 'Index funds (VOO, QQQ) historically outpace HYSA rates significantly over 10+ year horizons.' })
    } else if (liquidTotal > investTotal * 3 && investTotal > 0 && liquidTotal > 20000) {
      out.push({ type: 'info', text: `Cash/savings (${fmtY(liquidTotal)}) is much larger than investments (${fmtY(investTotal)}).`, detail: 'Excess cash beyond a 6-month emergency fund may grow faster invested in index funds.' })
    }
    if (currentNetWorth > 1000 && projFinal > currentNetWorth) {
      const cagr = (Math.pow(projFinal / currentNetWorth, 1 / years) - 1) * 100
      if (cagr > 0) {
        out.push({ type: 'good', text: `Projected ${cagr.toFixed(1)}% average annual net worth growth over ${years} years.` })
      }
    }
    return out
  })()

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="networth-page">

      {/* Timeline selector */}
      <div className="proj-bar">
        <span className="proj-label">Projection timeline</span>
        <div className="year-tabs">
          {YEAR_OPTIONS.map(y => (
            <button key={y} className={`year-tab ${years === y ? 'active' : ''}`}
              onClick={() => setYears(y)}>
              {y}Y
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="nw-section nw-section-cards">
        <NWCard label="Current Net Worth"    value={currentNetWorth} color="#818cf8" large />
        <NWCard label={`In ${years} Years`}  value={projFinal}       color="#4ade80" large
          sub={`+${fmtY(projFinal - currentNetWorth)} growth`} />
        <NWCard label="Monthly Surplus"      value={monthlyCashDelta + savingsMonthly + totalInvestMonthly}
          color={monthlyCashDelta + savingsMonthly + totalInvestMonthly >= 0 ? '#4ade80' : '#f87171'}
          signed sub={hasIncome ? `${fmt(effectiveSpending)}/mo spending` : 'Set income in Budget'} />
        {savingsRatePct !== null
          ? <NWCard label="Savings Rate" pct={savingsRatePct}
              color={savingsRatePct >= 20 ? '#4ade80' : savingsRatePct >= 10 ? '#fbbf24' : '#f87171'}
              sub={`${fmt(Math.max(0, monthlyTakeHome - effectiveSpending))}/mo saved`} />
          : <NWCard label="Savings Rate" pct={0} color="#6b7280" sub="Set income in Budget" />}
      </div>

      {/* AI Insights */}
      <div className="nw-section">
        <InsightPanel insights={nwInsights} />
      </div>

      {/* Net Worth Projection */}
      <div className="nw-section">
        <div className="nw-section-title">Net Worth Projection</div>
        <div className="nw-chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={projData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#64748b" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="vooGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.65} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="qqqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.65} />
                  <stop offset="95%" stopColor="#fb923c" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="year" tick={AX} tickLine={false} axisLine={false}
                tickFormatter={v => `${v}y`} />
              <YAxis tick={AX} tickLine={false} axisLine={false}
                tickFormatter={fmtY} width={64} />
              <Tooltip {...CHART_STYLE}
                formatter={(v, k) => [fmt(v), k]}
                labelFormatter={v => `Year ${v}`} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Area type="monotone" dataKey="Cash"         stackId="nw"
                stroke="#64748b" fill="url(#cashGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Savings (HYSA)" stackId="nw"
                stroke="#818cf8" fill="url(#savGrad)"  strokeWidth={1.5} />
              {TICKERS.map((t, i) => (
                <Area key={t.id} type="monotone" dataKey={t.id} stackId="nw"
                  stroke={t.color} fill={`url(#${['vooGrad','qqqGrad'][i]})`} strokeWidth={1.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>

          {milestones.length > 0 && (
            <div className="nw-milestones">
              {milestones.map(y => (
                <div key={y} className="nw-ms">
                  <span className="nw-ms-yr">{y}Y</span>
                  <span className="nw-ms-val">{fmtY(projData[y]?.total ?? 0)}</span>
                  <span className="nw-ms-delta">
                    {projData[y] ? `+${fmtY(projData[y].total - currentNetWorth)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analytics dashboards */}
      {monthlyStats.length > 1 && (
        <div className="nw-section">
          <div className="nw-section-title">Spending Analytics</div>
          <div className="nw-analytics-grid">

            {/* Monthly cash flow */}
            <div className="nw-chart-card">
              <div className="nw-card-title">Monthly Cash Flow</div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={monthlyStats.slice(-12).map(m => ({
                    month: monthLabel(m.month),
                    Income:   Math.round(m.income),
                    Spending: Math.round(m.spending),
                  }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={{ ...AX, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={fmtY} width={52} />
                  <Tooltip {...CHART_STYLE}
                    formatter={(v, k) => [fmt(v), k]}
                    labelFormatter={v => v} />
                  <Bar dataKey="Income"   fill="#4ade80" radius={[3,3,0,0]} />
                  <Bar dataKey="Spending" fill="#f87171" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              {hasIncome && (
                <div className="nw-cf-stats">
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Avg spend / mo</span>
                    <span className="nw-cf-val debit-color">{fmt(avgSpending)}</span>
                  </div>
                  <div className="nw-cf-sep" />
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Take-home / mo</span>
                    <span className="nw-cf-val income-color">{fmt(monthlyTakeHome)}</span>
                  </div>
                  <div className="nw-cf-sep" />
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Surplus / mo</span>
                    <span className={`nw-cf-val ${monthlyTakeHome - avgSpending >= 0 ? 'credit-color' : 'debit-color'}`}>
                      {fmtSigned(monthlyTakeHome - avgSpending)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Category spending trend */}
            {categoryMonthData.length > 1 && (
              <div className="nw-chart-card">
                <div className="nw-card-title">Spending by Category</div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart
                    data={categoryMonthData.slice(-10)}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    barCategoryGap="25%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="month" tick={{ ...AX, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={fmtY} width={52} />
                    <Tooltip {...CHART_STYLE}
                      formatter={(v, k) => [fmt(v), k]}
                      labelFormatter={v => v} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    {topCategories.map((cat, i) => (
                      <Bar key={cat} dataKey={cat} stackId="cats"
                        fill={CAT_COLORS[i % CAT_COLORS.length]}
                        radius={i === topCategories.length - 1 ? [2,2,0,0] : [0,0,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Projection assumptions note */}
      <div className="nw-section nw-assumptions">
        <div className="nw-section-title">Projection Assumptions</div>
        <div className="nw-assume-grid">
          <div className="nw-assume-item">
            <span className="nw-assume-label">Monthly spending</span>
            <span className="nw-assume-val">{fmt(effectiveSpending)}/mo</span>
            <span className="nw-assume-note">
              {avgSpending > 0 ? '6-month average from transactions' : 'from budget allocations'}
            </span>
          </div>
          <div className="nw-assume-item">
            <span className="nw-assume-label">Savings (HYSA)</span>
            <span className="nw-assume-val">{fmt(savingsMonthly)}/mo @ {savForm.rate || '4.5'}% APY</span>
            <span className="nw-assume-note">from Savings tab</span>
          </div>
          {TICKERS.map(t => (
            <div key={t.id} className="nw-assume-item">
              <span className="nw-assume-label">{t.id}</span>
              <span className="nw-assume-val">{fmt(invParams[t.id].monthly)}/mo</span>
              <span className="nw-assume-note">
                {(invParams[t.id].rate * 100).toFixed(1)}% annual return
                {stocksData[t.id] ? ' (historical CAGR)' : ' (default estimate)'}
              </span>
            </div>
          ))}
          <div className="nw-assume-item">
            <span className="nw-assume-label">Cash surplus</span>
            <span className="nw-assume-val" style={{
              color: monthlyCashDelta >= 0 ? '#4ade80' : '#f87171'
            }}>
              {fmtSigned(monthlyCashDelta)}/mo
            </span>
            <span className="nw-assume-note">added to bank balance monthly</span>
          </div>
        </div>
      </div>

    </div>
  )
}
