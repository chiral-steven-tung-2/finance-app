import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Constants ────────────────────────────────────────────
const TICKERS = [
  { id: 'VOO', color: '#4ade80', fallbackName: 'Vanguard S&P 500 ETF',      defaultCagr: 0.128 },
  { id: 'QQQ', color: '#fb923c', fallbackName: 'Invesco QQQ (NASDAQ-100)',   defaultCagr: 0.178 },
]
const YEAR_OPTIONS = [1, 5, 10, 20, 30]

const SK_SAVINGS = 'finance-savings-v1'
const SK_YEARS   = 'finance-proj-years-v1'
const SK_BUDGET  = 'finance-budget-v1'
const SK_SPLIT   = 'finance-invest-split-v1'
const skInvest   = (id) => `finance-invest-${id}-v1`

// ─── Helpers ──────────────────────────────────────────────
function loadJSON(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb } catch { return fb }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

function fmt(v, dec = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: dec,
  }).format(Math.abs(v))
}
function fmtY(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v)}`
}
function fmtPct(v) { return `${(v * 100).toFixed(1)}%` }

function readMonthlyIncome() {
  try {
    const inc = JSON.parse(localStorage.getItem('finance-income-v1'))
    if (!inc?.amount) return null
    const perYear = { biweekly: 26, monthly: 12, yearly: 1 }[inc.freq] ?? 12
    return (parseFloat(inc.amount) * perYear) / 12
  } catch { return null }
}

// Compound interest — returns array[year 0..N] of { year, balance, contributed }
// goal: stop adding monthly once balance reaches this cap (0 = no cap)
function projectSavings(principal, monthly, annualRate, years, goal = 0) {
  const pts = [{ year: 0, balance: principal, contributed: principal }]
  let bal = principal
  let totalContrib = principal
  const r = annualRate / 12
  const cap = goal > 0 ? goal : Infinity
  for (let m = 1; m <= years * 12; m++) {
    const add = bal < cap ? monthly : 0
    bal = r > 0 ? bal * (1 + r) + add : bal + add
    totalContrib += add
    if (m % 12 === 0) {
      pts.push({ year: m / 12, balance: Math.round(bal), contributed: Math.round(totalContrib) })
    }
  }
  return pts
}

// Stock projection — returns array[year 0..N] of { year, balance }
function projectStock(initial, monthly, annualReturn, years) {
  const pts = [{ year: 0, balance: initial }]
  let bal = initial
  const r = annualReturn / 12
  for (let m = 1; m <= years * 12; m++) {
    bal = bal * (1 + r) + monthly
    if (m % 12 === 0) pts.push({ year: m / 12, balance: Math.round(bal) })
  }
  return pts
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
const AX = { fontSize: 11, fill: '#9ca3af' }
const GRID = 'rgba(128,128,128,0.09)'

// ─── Investment Split Panel ────────────────────────────────
// Reads the investments budget from Budget tab and lets user split it by %.
function InvestmentSplitPanel({ investBudget, split, onSplitChange, stocksData }) {
  const totalPct  = TICKERS.reduce((s, t) => s + (parseFloat(split[t.id]) || 0), 0)
  const exact     = Math.abs(totalPct - 100) < 0.01
  const over100   = totalPct > 100
  const under100  = totalPct < 100 && totalPct > 0

  if (investBudget === 0) {
    return (
      <div className="split-panel split-panel-empty">
        <span className="split-empty-icon">↕</span>
        <span className="split-empty-text">
          Set an <strong>Investments</strong> budget in the Budget tab to auto-populate monthly contributions here.
        </span>
      </div>
    )
  }

  return (
    <div className="split-panel">
      <div className="split-hd">
        <div className="split-title">
          <span>Investment Budget Allocation</span>
          <span className="split-budget-badge">
            {fmt(investBudget)}<span className="split-mo">/mo</span>
            <span className="split-from-badge">from Budget tab</span>
          </span>
        </div>
        <span className="split-sub">Enter % for each ticker — contributions update automatically</span>
      </div>

      <div className="split-rows">
        {TICKERS.map(t => {
          const pct = parseFloat(split[t.id]) || 0
          const mo  = investBudget * pct / 100
          const barW = exact ? pct : Math.min(pct, 100)
          return (
            <div key={t.id} className="split-row">
              <span className="split-ticker" style={{ color: t.color }}>{t.id}</span>
              <span className="split-name">{stocksData[t.id]?.name ?? t.fallbackName}</span>
              <div className="split-pct-cell">
                <input
                  className="split-pct-inp"
                  type="number"
                  min="0" max="100" step="1"
                  value={split[t.id] ?? ''}
                  placeholder="0"
                  onChange={e => onSplitChange(t.id, e.target.value)}
                />
                <span className="split-pct-sfx">%</span>
              </div>
              <span className="split-eq">=</span>
              <span className="split-mo-val" style={{ color: mo > 0 ? t.color : '#6b7280' }}>
                {mo > 0 ? `${fmt(mo)}/mo` : '—'}
              </span>
              <div className="split-bar-wrap">
                <div className="split-bar-track">
                  <div className="split-bar-fill"
                    style={{ width: `${barW}%`, background: t.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className={`split-total ${exact ? 'ok' : over100 ? 'over' : under100 ? 'warn' : ''}`}>
        {totalPct === 0
          ? 'Enter percentages above to split the investment budget'
          : exact
          ? `✓ 100% allocated — ${fmt(investBudget)}/mo split across tickers`
          : over100
          ? `⚠ ${totalPct.toFixed(0)}% — reduce by ${(totalPct - 100).toFixed(0)}%`
          : `⚠ ${totalPct.toFixed(0)}% — ${(100 - totalPct).toFixed(0)}% unallocated (${fmt(investBudget * (100 - totalPct) / 100)}/mo unused)`}
      </div>
    </div>
  )
}

// ─── Savings Card ──────────────────────────────────────────
function SavingsCard({ years, budgetMonthly }) {
  const [s, setS] = useState(() => loadJSON(SK_SAVINGS, { balance: '', monthly: '', rate: '4.5', goal: '' }))
  function upd(f, v) { const n = { ...s, [f]: v }; setS(n); saveJSON(SK_SAVINGS, n) }

  const principal        = parseFloat(s.balance)  || 0
  const effectiveMonthly = parseFloat(s.monthly)  || budgetMonthly || 0
  const rate             = parseFloat(s.rate) / 100 || 0.045
  const goal             = parseFloat(s.goal)  || 0

  const proj = useMemo(
    () => projectSavings(principal, effectiveMonthly, rate, years, goal),
    [principal, effectiveMonthly, rate, years, goal]
  )
  const final      = proj[proj.length - 1]
  const totalContrib = final?.contributed ?? principal
  const earned     = final ? final.balance - totalContrib : 0
  const goalReached = goal > 0 && final && final.balance >= goal

  const incHint   = readMonthlyIncome()
  const pctOfInc  = incHint && effectiveMonthly > 0 ? ((effectiveMonthly / incHint) * 100).toFixed(0) : null
  const usingBudget = budgetMonthly > 0 && !s.monthly

  return (
    <div className="sav-card">
      <div className="sav-card-hd">
        <span className="sav-card-title">Savings Account</span>
        <span className="sav-card-sub">Compound interest projection</span>
      </div>

      <div className="sav-inputs">
        <div className="sav-field">
          <label className="sav-label">Current Balance</label>
          <div className="sav-iw"><span className="sav-pfx">$</span>
            <input className="sav-inp" type="number" placeholder="0" value={s.balance}
              onChange={e => upd('balance', e.target.value)} /></div>
        </div>
        <div className="sav-field">
          <label className="sav-label">
            Monthly Contribution
            {pctOfInc && <span className="sav-hint">{pctOfInc}% of income</span>}
            {usingBudget && <span className="sav-budget-badge">Budget: {fmt(budgetMonthly)}/mo</span>}
          </label>
          <div className={`sav-iw ${usingBudget ? 'sav-iw-linked' : ''}`}>
            <span className="sav-pfx">$</span>
            <input className="sav-inp" type="number"
              placeholder={budgetMonthly > 0 ? budgetMonthly.toFixed(0) : '0'}
              value={s.monthly}
              onChange={e => upd('monthly', e.target.value)} />
          </div>
          {usingBudget && (
            <div className="sav-link-note">Using Budget tab value · type to override</div>
          )}
        </div>
        <div className="sav-field">
          <label className="sav-label">Annual APY</label>
          <div className="sav-iw">
            <input className="sav-inp" type="number" placeholder="4.5" value={s.rate}
              step="0.1" onChange={e => upd('rate', e.target.value)} />
            <span className="sav-sfx">%</span>
          </div>
        </div>
        <div className="sav-field">
          <label className="sav-label">
            Target Balance
            {goalReached && <span className="sav-hint sav-hint-reached">reached in projection</span>}
          </label>
          <div className="sav-iw">
            <span className="sav-pfx">$</span>
            <input className="sav-inp" type="number" placeholder="no cap"
              value={s.goal} onChange={e => upd('goal', e.target.value)} />
          </div>
          {goal > 0 && <div className="sav-link-note">Contributions stop once balance hits {fmt(goal)}</div>}
        </div>
      </div>

      {(principal > 0 || effectiveMonthly > 0) && <>
        <div className="sav-stats">
          <div className="sav-stat"><div className="ss-label">Final Balance</div>
            <div className="ss-val">{fmt(final?.balance ?? 0)}</div></div>
          <div className="sav-stat"><div className="ss-label">Contributed</div>
            <div className="ss-val">{fmt(totalContrib)}</div></div>
          <div className="sav-stat"><div className="ss-label">Interest Earned</div>
            <div className="ss-val credit-color">{fmt(earned)}</div></div>
        </div>

        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={proj} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={AX} tickLine={false} axisLine={false} tickFormatter={v => `${v}y`} />
            <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={fmtY} width={58} />
            <Tooltip {...CHART_STYLE}
              formatter={(v, k) => [fmt(v), k === 'balance' ? 'Balance' : 'Contributed']}
              labelFormatter={v => `Year ${v}`} />
            <Line type="monotone" dataKey="balance"     stroke="#818cf8" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="contributed" stroke="#9ca3af" strokeWidth={1.5}
              strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </>}
    </div>
  )
}

// ─── Investment Card ───────────────────────────────────────
function InvestmentCard({ ticker, color, fallbackName, defaultCagr, years,
  investForm, stockData, loadState, onChange, budgetMonthly }) {

  const { initial: initStr, monthly: monStr, customRate: customRateStr } = investForm
  const initial = parseFloat(initStr) || 0
  // Fall back to budget-linked monthly if no manual override
  const effectiveMonthly = parseFloat(monStr) || budgetMonthly || 0
  const usingBudget = budgetMonthly > 0 && !monStr

  const bestCagr = stockData
    ? (stockData.cagr10y ?? stockData.cagr5y ?? stockData.cagr1y ?? defaultCagr)
    : defaultCagr
  const cagrYears = stockData
    ? (stockData.cagr10y ? 10 : stockData.cagr5y ? 5 : 1)
    : null

  const effectiveCagr = parseFloat(customRateStr) > 0
    ? parseFloat(customRateStr) / 100
    : bestCagr

  const proj = useMemo(
    () => (initial > 0 || effectiveMonthly > 0) ? projectStock(initial, effectiveMonthly, effectiveCagr, years) : [],
    [initial, effectiveMonthly, effectiveCagr, years]
  )
  const finalVal = proj[proj.length - 1]?.balance

  const normBase = initial > 0 ? initial : 10000
  const histData = useMemo(() => {
    if (!stockData?.prices?.length) return []
    const first = stockData.prices[0].price
    return stockData.prices.map(p => ({
      date: p.date,
      value: Math.round((p.price / first) * normBase),
    }))
  }, [stockData, normBase])

  const growth10k = histData.length > 1 ? histData[histData.length - 1].value : null

  return (
    <div className="inv-card" style={{ '--inv-color': color }}>
      {/* Header */}
      <div className="inv-hd">
        <div className="inv-ticker-row">
          <span className="inv-ticker">{ticker}</span>
          {loadState === 'loading' && <span className="inv-status muted">Loading…</span>}
          {loadState === 'error'   && <span className="inv-status inv-error">Data unavailable</span>}
          {loadState === 'ok' && stockData && <>
            <span className="inv-price">{fmt(stockData.currentPrice, 2)}</span>
            {stockData.changePct != null && (
              <span className={`inv-chg ${stockData.changePct >= 0 ? 'credit-color' : 'debit-color'}`}>
                {stockData.changePct >= 0 ? '+' : ''}{stockData.changePct.toFixed(2)}%
              </span>
            )}
          </>}
        </div>
        <div className="inv-name">{stockData?.name ?? fallbackName}</div>

        {loadState === 'ok' && stockData && (
          <div className="inv-cagr-row">
            {stockData.cagr1y  != null && <span className="cagr-pill">1Y {fmtPct(stockData.cagr1y)}</span>}
            {stockData.cagr5y  != null && <span className="cagr-pill">5Y CAGR {fmtPct(stockData.cagr5y)}</span>}
            {stockData.cagr10y != null && <span className="cagr-pill">10Y CAGR {fmtPct(stockData.cagr10y)}</span>}
          </div>
        )}

        {growth10k != null && normBase > 0 && (
          <div className="inv-growth-stat">
            {fmt(normBase)} → <span style={{ color }}>{fmt(growth10k)}</span>
            <span className="muted"> over {stockData.prices.length > 100 ? '10' : '5'}Y</span>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="inv-inputs">
        <div className="sav-field">
          <label className="sav-label">Initial Investment</label>
          <div className="sav-iw"><span className="sav-pfx">$</span>
            <input className="sav-inp" type="number" placeholder="0" value={investForm.initial}
              onChange={e => onChange('initial', e.target.value)} /></div>
        </div>
        <div className="sav-field">
          <label className="sav-label">
            Monthly Contribution
            {usingBudget && <span className="sav-budget-badge" style={{ color }}>Budget: {fmt(budgetMonthly)}/mo</span>}
          </label>
          <div className={`sav-iw ${usingBudget ? 'sav-iw-linked' : ''}`}>
            <span className="sav-pfx">$</span>
            <input className="sav-inp" type="number"
              placeholder={budgetMonthly > 0 ? budgetMonthly.toFixed(0) : '0'}
              value={investForm.monthly}
              onChange={e => onChange('monthly', e.target.value)} />
          </div>
          {usingBudget && (
            <div className="sav-link-note" style={{ color }}>From Budget split · type to override</div>
          )}
        </div>
        <div className="sav-field">
          <label className="sav-label">
            Custom Rate
            {!customRateStr && cagrYears && (
              <span className="sav-hint">using {cagrYears}Y CAGR</span>
            )}
          </label>
          <div className="sav-iw">
            <input className="sav-inp" type="number" placeholder={fmtPct(bestCagr)}
              value={investForm.customRate ?? ''} step="0.1"
              onChange={e => onChange('customRate', e.target.value)} />
            <span className="sav-sfx">%</span>
          </div>
        </div>
      </div>

      {/* Projected value */}
      {finalVal > 0 && (
        <div className="inv-proj">
          <span className="inv-proj-label">Projected in {years}Y</span>
          <span className="inv-proj-val" style={{ color }}>{fmt(finalVal)}</span>
        </div>
      )}

      {/* Historical chart */}
      {histData.length > 0 && (
        <div className="inv-chart-wrap">
          <div className="inv-chart-label">
            Historical growth of {fmt(normBase)} · {stockData?.prices?.[0]?.date ?? ''}
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={histData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
              <YAxis tick={{ ...AX, fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={fmtY} width={50} />
              <Tooltip {...CHART_STYLE}
                formatter={(v) => [fmt(v), `${ticker} value`]}
                labelFormatter={v => v} />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Comparison Chart ──────────────────────────────────────
function ComparisonChart({ years, savForm, investForms, stocksData, budgetSavingsMonthly, budgetMonthlies }) {
  const principal  = parseFloat(savForm?.balance) || 0
  const savMonthly = parseFloat(savForm?.monthly) || budgetSavingsMonthly || 0
  const savRate    = parseFloat(savForm?.rate) / 100 || 0.045
  const savGoal    = parseFloat(savForm?.goal)  || 0

  const data = useMemo(() => {
    const pts = []
    for (let yr = 0; yr <= years; yr++) {
      const p = { year: yr }
      if (principal > 0 || savMonthly > 0) {
        p.savings = projectSavings(principal, savMonthly, savRate, yr, savGoal).at(-1)?.balance ?? 0
      }
      let totalInit = principal, totalMo = savMonthly
      for (const { id, color, fallbackName, defaultCagr } of TICKERS) {
        const iForm = investForms[id] ?? {}
        const ini   = parseFloat(iForm.initial) || 0
        // Use budget split monthly as fallback
        const mo    = parseFloat(iForm.monthly) || (budgetMonthlies?.[id] ?? 0)
        totalInit += ini; totalMo += mo
        if (ini > 0 || mo > 0) {
          const sd   = stocksData[id]
          const best = sd ? (sd.cagr10y ?? sd.cagr5y ?? sd.cagr1y ?? defaultCagr) : defaultCagr
          const rate = parseFloat(iForm.customRate) > 0 ? parseFloat(iForm.customRate) / 100 : best
          p[id] = projectStock(ini, mo, rate, yr).at(-1)?.balance ?? 0
        }
      }
      p.contributions = Math.round(totalInit + totalMo * yr * 12)
      pts.push(p)
    }
    return pts
  }, [years, principal, savMonthly, savRate, investForms, stocksData, budgetSavingsMonthly, budgetMonthlies])

  const hasData = data.some(d =>
    d.savings != null || TICKERS.some(t => d[t.id] != null)
  )
  if (!hasData) return null

  return (
    <div className="sav-card comparison-card">
      <div className="sav-card-hd">
        <span className="sav-card-title">Growth Comparison</span>
        <span className="sav-card-sub">All projections · {years}-year horizon</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={AX} tickLine={false} axisLine={false}
            tickFormatter={v => `${v}y`} />
          <YAxis tick={AX} tickLine={false} axisLine={false} tickFormatter={fmtY} width={64} />
          <Tooltip {...CHART_STYLE}
            formatter={(v, k) => [fmt(v),
              k === 'savings' ? 'Savings' :
              k === 'contributions' ? 'Contributions only' : k]}
            labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Line type="monotone" dataKey="contributions" name="Contributions only"
            stroke="#6b7280" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
          {(principal > 0 || savMonthly > 0) && (
            <Line type="monotone" dataKey="savings" name="Savings (HYSA)"
              stroke="#818cf8" strokeWidth={2.5} dot={false} />
          )}
          {TICKERS.map(t => {
            const iForm = investForms[t.id] ?? {}
            const mo = parseFloat(iForm.monthly) || (budgetMonthlies?.[t.id] ?? 0)
            const has = (parseFloat(iForm.initial) || 0) > 0 || mo > 0
            return has ? (
              <Line key={t.id} type="monotone" dataKey={t.id} name={t.id}
                stroke={t.color} strokeWidth={2.5} dot={false} />
            ) : null
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────
export function Savings({ stocksData = {}, loadStates: loadStatesProp }) {
  const [years, setYears] = useState(() => loadJSON(SK_YEARS, 10))
  const loadStates = loadStatesProp ?? Object.fromEntries(TICKERS.map(t => [t.id, stocksData[t.id] ? 'ok' : 'loading']))
  const [investForms, setInvestForms] = useState(() =>
    Object.fromEntries(TICKERS.map(t => [t.id, loadJSON(skInvest(t.id), { initial: '', monthly: '', customRate: '' })]))
  )
  const [savForm, setSavForm] = useState(() => loadJSON(SK_SAVINGS, { balance: '', monthly: '', rate: '4.5' }))
  // Split percentages per ticker: { VOO: 50, QQQ: 50 }
  const [split, setSplit] = useState(() => loadJSON(SK_SPLIT, { VOO: 50, QQQ: 50 }))

  // Read budget allocations — component remounts on each tab switch so this is always fresh
  const budgets = useMemo(() => loadJSON(SK_BUDGET, {}), [])
  const budgetSavings = parseFloat(budgets['__savings__'])     || 0
  const budgetInvest  = parseFloat(budgets['__investments__']) || 0

  // Compute per-ticker monthly from split % and total investment budget
  function getTickerBudgetMonthly(tickerId) {
    const pct = parseFloat(split[tickerId]) || 0
    return budgetInvest * pct / 100
  }
  const budgetMonthlies = useMemo(
    () => Object.fromEntries(TICKERS.map(t => [t.id, getTickerBudgetMonthly(t.id)])),
    [budgetInvest, split]
  )

  // Keep savForm in sync with localStorage (SavingsCard writes it directly)
  useEffect(() => {
    const handle = () => setSavForm(loadJSON(SK_SAVINGS, { balance: '', monthly: '', rate: '4.5' }))
    window.addEventListener('storage', handle)
    const id = setInterval(handle, 500)
    return () => { window.removeEventListener('storage', handle); clearInterval(id) }
  }, [])


  function handleInvestChange(ticker, field, val) {
    setInvestForms(prev => {
      const next = { ...prev, [ticker]: { ...prev[ticker], [field]: val } }
      saveJSON(skInvest(ticker), next[ticker])
      return next
    })
  }

  function handleSplitChange(ticker, val) {
    setSplit(prev => {
      const next = { ...prev, [ticker]: val }
      saveJSON(SK_SPLIT, next)
      return next
    })
  }

  function setYearsSave(y) { setYears(y); saveJSON(SK_YEARS, y) }

  return (
    <div className="savings-page">
      {/* Timeline picker */}
      <div className="proj-bar">
        <span className="proj-label">Projection timeline</span>
        <div className="year-tabs">
          {YEAR_OPTIONS.map(y => (
            <button key={y} className={`year-tab ${years === y ? 'active' : ''}`}
              onClick={() => setYearsSave(y)}>
              {y}Y
            </button>
          ))}
        </div>
      </div>

      {/* Savings projector */}
      <div className="savings-section">
        <div className="savings-section-title">Savings</div>
        <SavingsCard years={years} budgetMonthly={budgetSavings} />
      </div>

      {/* Investments */}
      <div className="savings-section">
        <div className="savings-section-title">Investments</div>
        <InvestmentSplitPanel
          investBudget={budgetInvest}
          split={split}
          onSplitChange={handleSplitChange}
          stocksData={stocksData}
        />
        <div className="inv-grid">
          {TICKERS.map(t => (
            <InvestmentCard
              key={t.id}
              ticker={t.id}
              color={t.color}
              fallbackName={t.fallbackName}
              defaultCagr={t.defaultCagr}
              years={years}
              stockData={stocksData[t.id] ?? null}
              loadState={loadStates[t.id]}
              investForm={investForms[t.id]}
              onChange={(f, v) => handleInvestChange(t.id, f, v)}
              budgetMonthly={budgetMonthlies[t.id]}
            />
          ))}
        </div>
      </div>

      {/* Comparison */}
      <div className="savings-section">
        <ComparisonChart
          years={years}
          savForm={savForm}
          investForms={investForms}
          stocksData={stocksData}
          budgetSavingsMonthly={budgetSavings}
          budgetMonthlies={budgetMonthlies}
        />
      </div>
    </div>
  )
}
