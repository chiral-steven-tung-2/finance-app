import { useState, useMemo } from 'react'
import { InsightPanel } from './InsightPanel'

const STORAGE_BALANCE   = 'finance-balance-v1'
const STORAGE_INCOME    = 'finance-income-v1'
const STORAGE_TAX       = 'finance-tax-v1'
const STORAGE_BUDGET    = 'finance-budget-v1'
const STORAGE_RECURRING = 'finance-recurring-v1'

const NO_CATEGORY  = '(Uncategorized)'
const SPECIAL_KEYS = new Set(['__savings__', '__investments__'])

const DEFAULT_RECURRING = [
  { id: 'rent',        name: 'Rent / Mortgage',  amount: '', freq: 'monthly', enabled: true },
  { id: 'car_payment', name: 'Car Payment',       amount: '', freq: 'monthly', enabled: true },
  { id: 'car_ins',     name: 'Car Insurance',     amount: '', freq: 'monthly', enabled: true },
  { id: 'health_ins',  name: 'Health Insurance',  amount: '', freq: 'monthly', enabled: true },
  { id: 'internet',    name: 'Internet',          amount: '', freq: 'monthly', enabled: true },
  { id: 'phone',       name: 'Phone Plan',        amount: '', freq: 'monthly', enabled: true },
  { id: 'electric',    name: 'Electricity',       amount: '', freq: 'monthly', enabled: true },
  { id: 'gas',         name: 'Gas / Heat',        amount: '', freq: 'monthly', enabled: true },
  { id: 'water',       name: 'Water',             amount: '', freq: 'monthly', enabled: true },
  { id: 'gym',         name: 'Gym',               amount: '', freq: 'monthly', enabled: true },
  { id: 'streaming',   name: 'Subscriptions',     amount: '', freq: 'monthly', enabled: true },
  { id: 'student',     name: 'Student Loans',     amount: '', freq: 'monthly', enabled: true },
]

function newRcId() { return Math.random().toString(36).slice(2, 9) }
function rcMonthly(r) {
  const a = parseFloat(r.amount) || 0
  return r.freq === 'yearly' ? a / 12 : a
}

const FREQS = [
  { id: 'biweekly', label: 'Biweekly', perYear: 26 },
  { id: 'monthly',  label: 'Monthly',  perYear: 12 },
  { id: 'yearly',   label: 'Yearly',   perYear: 1  },
]

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }

function toMonthly(amount, freqId) {
  const f = FREQS.find(f => f.id === freqId)
  return (amount * f.perYear) / 12
}

function fmt(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(v))
}

function monthKey(dateStr) {
  const [m, , y] = dateStr.split('/')
  return `${y}-${m.padStart(2, '0')}`
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function IncomeBreakdown({ amount, taxAmount, freqId }) {
  const grossMonthly = toMonthly(amount, freqId)
  const taxMonthly   = taxAmount ? toMonthly(taxAmount, freqId) : 0
  const netMonthly   = grossMonthly - taxMonthly
  const hasTax       = taxAmount > 0

  const perFreqNet = (f) => {
    if (f.id === 'monthly') return netMonthly
    if (f.id === 'yearly')  return netMonthly * 12
    return (netMonthly * 12) / 26
  }
  const perFreqGross = (f) => {
    if (f.id === 'monthly') return grossMonthly
    if (f.id === 'yearly')  return grossMonthly * 12
    return (grossMonthly * 12) / 26
  }

  const otherFreqs = FREQS.filter(f => f.id !== freqId)

  return (
    <div className="income-breakdown">
      {hasTax && (
        <div className="income-breakdown-item ibi-net-highlight">
          <span className="ibi-label">Net / mo</span>
          <span className="ibi-val income-color">{fmt(netMonthly)}</span>
        </div>
      )}
      {otherFreqs.map(f => (
        <div key={f.id} className="income-breakdown-item">
          <span className="ibi-label">{f.label}</span>
          <span className="ibi-val">{fmt(perFreqNet(f))}</span>
          {hasTax && (
            <span className="ibi-gross-note">gross {fmt(perFreqGross(f))}</span>
          )}
        </div>
      ))}
      {hasTax && (
        <div className="income-breakdown-item ibi-tax-item">
          <span className="ibi-label">Tax / mo</span>
          <span className="ibi-val ibi-tax-val">−{fmt(taxMonthly)}</span>
        </div>
      )}
    </div>
  )
}

// Reusable budget input cell
function BudgetCell({ value, onChange }) {
  return (
    <div className="budget-input-cell">
      <span className="budget-dollar">$</span>
      <input
        type="number"
        className="budget-field"
        placeholder="—"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        min="0"
        step="1"
      />
    </div>
  )
}

export function Budget({ allActiveTxs }) {
  const [balance, setBalance] = useState(() => loadJSON(STORAGE_BALANCE, ''))
  const [income,  setIncome]  = useState(() => loadJSON(STORAGE_INCOME,  { amount: '', freq: 'biweekly' }))
  const [tax,     setTax]     = useState(() => loadJSON(STORAGE_TAX, ''))
  const [budgets,   setBudgets]   = useState(() => loadJSON(STORAGE_BUDGET, {}))
  const [recurring, setRecurring] = useState(() => loadJSON(STORAGE_RECURRING, null) ?? DEFAULT_RECURRING)
  const [selMonth,  setSelMonth]  = useState(null)

  const months = useMemo(() => {
    const s = new Set(allActiveTxs.map(t => monthKey(t.date)))
    return [...s].sort().reverse()
  }, [allActiveTxs])

  const currentMonth = selMonth ?? months[0] ?? null

  const spentByCategory = useMemo(() => {
    const map = new Map()
    for (const t of allActiveTxs) {
      if (t.amount >= 0) continue
      if (currentMonth && monthKey(t.date) !== currentMonth) continue
      const cat = t.category || NO_CATEGORY
      map.set(cat, (map.get(cat) || 0) + Math.abs(t.amount))
    }
    return map
  }, [allActiveTxs, currentMonth])

  // Spending categories — exclude special savings/investment keys
  const allCategories = useMemo(() => {
    const s = new Set([...Object.keys(budgets), ...spentByCategory.keys()])
    SPECIAL_KEYS.forEach(k => s.delete(k))
    return [...s].sort()
  }, [budgets, spentByCategory])

  const monthlyGross    = income.amount ? toMonthly(parseFloat(income.amount) || 0, income.freq) : null
  const monthlyTaxAmt   = tax && monthlyGross !== null ? toMonthly(parseFloat(tax) || 0, income.freq) : 0
  // Budget against after-tax (take-home) income
  const monthlyIncome   = monthlyGross !== null ? monthlyGross - monthlyTaxAmt : null
  const spendingBudget  = allCategories.reduce((s, c) => s + (parseFloat(budgets[c]) || 0), 0)
  const savingsBudget   = parseFloat(budgets['__savings__'])     || 0
  const investBudget    = parseFloat(budgets['__investments__']) || 0
  const recurringTotal  = recurring.filter(r => r.enabled).reduce((s, r) => s + rcMonthly(r), 0)
  const totalBudgeted   = spendingBudget + recurringTotal + savingsBudget + investBudget
  const totalSpent      = [...spentByCategory.values()].reduce((s, v) => s + v, 0)

  function handleBalance(e) {
    const v = e.target.value; setBalance(v); saveJSON(STORAGE_BALANCE, v)
  }
  function handleIncome(field, val) {
    const next = { ...income, [field]: val }; setIncome(next); saveJSON(STORAGE_INCOME, next)
  }
  function handleTax(e) {
    const v = e.target.value; setTax(v); saveJSON(STORAGE_TAX, v)
  }
  function handleBudget(cat, val) {
    setBudgets(prev => {
      const next = { ...prev }
      if (val === '' || val === null) delete next[cat]
      else next[cat] = val
      saveJSON(STORAGE_BUDGET, next)
      return next
    })
  }

  function handleRecurring(id, field, val) {
    setRecurring(prev => {
      const next = prev.map(r => r.id === id ? { ...r, [field]: val } : r)
      saveJSON(STORAGE_RECURRING, next)
      return next
    })
  }

  function addRecurring() {
    setRecurring(prev => {
      const next = [...prev, { id: newRcId(), name: 'Custom', amount: '', freq: 'monthly', enabled: true, custom: true }]
      saveJSON(STORAGE_RECURRING, next)
      return next
    })
  }

  function deleteRecurring(id) {
    setRecurring(prev => {
      const next = prev.filter(r => r.id !== id)
      saveJSON(STORAGE_RECURRING, next)
      return next
    })
  }

  const budgetInsights = (() => {
    const out = []
    if (!monthlyIncome) {
      out.push({ type: 'info', text: 'Set your income above to unlock budget analysis and personalized recommendations.' })
      return out
    }
    const savingsRate = ((savingsBudget + investBudget) / monthlyIncome) * 100
    if (savingsRate === 0) {
      out.push({ type: 'bad', text: 'No savings or investments are budgeted.', detail: 'Aim to save at least 20% of take-home pay. Even $50/mo compounds significantly over time.' })
    } else if (savingsRate < 10) {
      out.push({ type: 'warn', text: `Savings + investment rate is ${savingsRate.toFixed(1)}% of take-home.`, detail: 'Target 20%+ for long-term financial health. Consider increasing your savings allocation.' })
    } else if (savingsRate >= 20) {
      out.push({ type: 'good', text: `Strong savings rate of ${savingsRate.toFixed(1)}% — you're in the top tier of savers.` })
    } else {
      out.push({ type: 'info', text: `Savings + investment rate is ${savingsRate.toFixed(1)}% of take-home.`, detail: `Increase to 20% to maximize compounding — that's ${fmt(monthlyIncome * 0.2 - savingsBudget - investBudget)} more/mo.` })
    }
    const overCats = allCategories.filter(cat => {
      const b = parseFloat(budgets[cat]) || 0
      const s = spentByCategory.get(cat) || 0
      return b > 0 && s > b
    })
    if (overCats.length > 0) {
      out.push({ type: 'warn',
        text: `${overCats.length} categor${overCats.length > 1 ? 'ies are' : 'y is'} over budget this month.`,
        detail: overCats.slice(0, 4).join(', ') + (overCats.length > 4 ? ` +${overCats.length - 4} more` : ''),
      })
    } else if (allCategories.some(cat => parseFloat(budgets[cat]) > 0)) {
      out.push({ type: 'good', text: 'All categories are within budget this month.' })
    }
    if (recurringTotal > 0) {
      const rcPct = (recurringTotal / monthlyIncome) * 100
      if (rcPct > 50) {
        out.push({ type: 'bad', text: `Fixed costs consume ${rcPct.toFixed(1)}% of take-home (${fmt(recurringTotal)}/mo).`, detail: 'This leaves little room for savings or spending. Review bills for possible cuts.' })
      } else if (rcPct > 35) {
        out.push({ type: 'warn', text: `Fixed costs are ${rcPct.toFixed(1)}% of take-home (${fmt(recurringTotal)}/mo).`, detail: 'Aim to keep fixed costs under 35%. Consider renegotiating insurance or subscriptions.' })
      } else {
        out.push({ type: 'good', text: `Fixed costs are a healthy ${rcPct.toFixed(1)}% of take-home (${fmt(recurringTotal)}/mo).` })
      }
    }
    const unalloc = monthlyIncome - totalBudgeted
    if (unalloc < 0) {
      out.push({ type: 'bad', text: `Budget exceeds take-home by ${fmt(Math.abs(unalloc))}/mo.`, detail: 'Reduce allocations to avoid overspending your income.' })
    } else if (unalloc > monthlyIncome * 0.15) {
      out.push({ type: 'info', text: `${fmt(unalloc)}/mo is unallocated.`, detail: 'Direct this toward savings, investments, or an emergency fund.' })
    }
    return out
  })()

  return (
    <div className="budget-page">

      {/* ── Balance & Income ──────────────────────────── */}
      <div className="budget-section">
        <div className="budget-section-title">Balance &amp; Income</div>
        <div className="bi-grid">
          <div className="bi-card">
            <div className="bi-card-label">Current Account Balance</div>
            <div className="bi-amount-row">
              <span className="bi-currency">$</span>
              <input className="bi-input" type="number" placeholder="0.00"
                value={balance} onChange={handleBalance} min="0" step="0.01" />
            </div>
            {balance !== '' && <div className="bi-display">{fmt(parseFloat(balance) || 0)}</div>}
          </div>

          <div className="bi-card bi-card-income">
            <div className="bi-card-label">Gross Income</div>
            <div className="bi-income-row">
              <div className="bi-amount-row">
                <span className="bi-currency">$</span>
                <input className="bi-input" type="number" placeholder="0.00"
                  value={income.amount} onChange={e => handleIncome('amount', e.target.value)}
                  min="0" step="0.01" />
              </div>
              <div className="freq-seg">
                {FREQS.map(f => (
                  <button key={f.id} className={`freq-btn ${income.freq === f.id ? 'active' : ''}`}
                    onClick={() => handleIncome('freq', f.id)}>{f.label}</button>
                ))}
              </div>
            </div>

            <div className="bi-tax-row">
              <div className="bi-tax-label">
                Taxes
                <span className="bi-tax-per">
                  per {income.freq === 'biweekly' ? 'paycheck' : income.freq === 'monthly' ? 'month' : 'year'}
                </span>
              </div>
              <div className="bi-tax-input-wrap">
                <span className="bi-tax-minus">−$</span>
                <input
                  className="bi-input bi-input-sm"
                  type="number"
                  placeholder="0.00"
                  value={tax}
                  onChange={handleTax}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {income.amount && (
              <IncomeBreakdown
                amount={parseFloat(income.amount) || 0}
                taxAmount={parseFloat(tax) || 0}
                freqId={income.freq}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Budget Planner ────────────────────────────── */}
      <div className="budget-section">
        <InsightPanel insights={budgetInsights} />
        <div className="planner-heading">
          <div className="budget-section-title">Monthly Budget Planner</div>
          {months.length > 0 && (
            <select className="month-select" value={currentMonth ?? ''}
              onChange={e => setSelMonth(e.target.value)}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
        </div>

        {/* Allocation bar */}
        {monthlyIncome !== null && (
          <div className="alloc-bar">
            <div className="alloc-stat">
              <span className="alloc-label">{monthlyTaxAmt > 0 ? 'Take-home / mo' : 'Monthly income'}</span>
              <span className="alloc-val income-color">{fmt(monthlyIncome)}</span>
              {monthlyTaxAmt > 0 && (
                <span className="alloc-gross-note">gross {fmt(monthlyGross)}</span>
              )}
            </div>
            <div className="alloc-divider" />
            <div className="alloc-stat">
              <span className="alloc-label">Spending</span>
              <span className="alloc-val" style={{ color: '#94a3b8' }}>{fmt(spendingBudget)}</span>
            </div>
            <div className="alloc-divider" />
            <div className="alloc-stat">
              <span className="alloc-label">Fixed</span>
              <span className="alloc-val" style={{ color: '#f59e0b' }}>{fmt(recurringTotal)}</span>
            </div>
            <div className="alloc-divider" />
            <div className="alloc-stat">
              <span className="alloc-label">Savings</span>
              <span className="alloc-val" style={{ color: '#818cf8' }}>{fmt(savingsBudget)}</span>
            </div>
            <div className="alloc-divider" />
            <div className="alloc-stat">
              <span className="alloc-label">Investments</span>
              <span className="alloc-val" style={{ color: '#4ade80' }}>{fmt(investBudget)}</span>
            </div>
            <div className="alloc-divider" />
            <div className="alloc-stat">
              <span className="alloc-label">Unallocated</span>
              <span className={`alloc-val ${monthlyIncome - totalBudgeted >= 0 ? 'credit-color' : 'debit-color'}`}>
                {fmt(Math.abs(monthlyIncome - totalBudgeted))}
                {monthlyIncome - totalBudgeted < 0 ? ' over' : ''}
              </span>
            </div>
            <div className="alloc-track-wrap">
              <div className="alloc-track">
                {/* spending — slate blue */}
                <div className="alloc-fill"
                  style={{ width: `${Math.min((spendingBudget / monthlyIncome) * 100, 100)}%`, background: '#64748b' }}
                  title={`Spending: ${fmt(spendingBudget)}`} />
                {/* fixed recurring — amber */}
                <div className="alloc-fill"
                  style={{
                    width: `${Math.min((recurringTotal / monthlyIncome) * 100, 100)}%`,
                    background: '#f59e0b',
                    left: `${Math.min((spendingBudget / monthlyIncome) * 100, 100)}%`,
                    position: 'absolute',
                  }}
                  title={`Fixed: ${fmt(recurringTotal)}`} />
                {/* savings */}
                <div className="alloc-fill"
                  style={{
                    width: `${Math.min((savingsBudget / monthlyIncome) * 100, 100)}%`,
                    background: '#818cf8',
                    left: `${Math.min(((spendingBudget + recurringTotal) / monthlyIncome) * 100, 100)}%`,
                    position: 'absolute',
                  }}
                  title={`Savings: ${fmt(savingsBudget)}`} />
                {/* investments */}
                <div className="alloc-fill"
                  style={{
                    width: `${Math.min((investBudget / monthlyIncome) * 100, 100)}%`,
                    background: '#4ade80',
                    left: `${Math.min(((spendingBudget + recurringTotal + savingsBudget) / monthlyIncome) * 100, 100)}%`,
                    position: 'absolute',
                  }}
                  title={`Investments: ${fmt(investBudget)}`} />
              </div>
              <div className="alloc-track-labels">
                <span>$0</span>
                <span>{fmt(monthlyIncome)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Planner table */}
        <div className={`planner-list${monthlyIncome ? ' pl-has-income' : ''}`}>

          {/* Header */}
          <div className="pr-header">
            <span>Category</span>
            <span>Budget / mo</span>
            <span />
            <span>Spent</span>
            <span>Remaining</span>
            {monthlyIncome && <span>Income %</span>}
          </div>

          {/* Spending category rows */}
          {allCategories.map(cat => {
            const budget   = parseFloat(budgets[cat]) || 0
            const spent    = spentByCategory.get(cat) || 0
            const rem      = budget - spent
            const over     = budget > 0 && spent > budget
            const sliderMax = monthlyIncome
              ? Math.ceil(monthlyIncome * 0.5)
              : Math.max(Math.ceil((Math.max(budget, spent) * 1.5 + 100) / 50) * 50, 500)
            const fillPct  = sliderMax > 0 ? Math.min((budget / sliderMax) * 100, 100) : 0

            return (
              <div key={cat} className={`planner-row${over ? ' row-over' : ''}`}>
                <span className="pr-cat">{cat}</span>

                <div className="pr-budget">
                  <BudgetCell value={budgets[cat]} onChange={v => handleBudget(cat, v)} />
                </div>

                <div className="pr-slider">
                  <div className="pi-slider-wrap">
                    <input
                      type="range"
                      className="budget-slider"
                      min="0" max={sliderMax} step="5"
                      value={budget}
                      onChange={e => handleBudget(cat, e.target.value)}
                      style={{ '--fill': `${fillPct}%` }}
                    />
                    {spent > 0 && sliderMax > 0 && (
                      <div
                        className={`slider-spent-mark${over ? ' mark-over' : ''}`}
                        style={{ '--spent-pos': `${Math.min((spent / sliderMax) * 100, 100)}%` }}
                      />
                    )}
                  </div>
                </div>

                <span className="pr-spent">
                  {spent > 0
                    ? <span className="debit-color">{fmt(spent)}</span>
                    : <span className="muted">—</span>}
                </span>

                <span className="pr-rem">
                  {budget > 0
                    ? <span className={over ? 'debit-color' : rem === 0 ? '' : 'credit-color'}>
                        {over ? `${fmt(Math.abs(rem))} over` : fmt(rem)}
                      </span>
                    : <span className="muted">—</span>}
                </span>

                {monthlyIncome && (
                  <span className="pr-pct">
                    {budget > 0
                      ? <span className="pct-pill">{((budget / monthlyIncome) * 100).toFixed(1)}%</span>
                      : <span className="muted">—</span>}
                  </span>
                )}
              </div>
            )
          })}

          {/* Savings & Investments rows */}
          <div className="pi-section-sep"><span>Savings &amp; Investments</span></div>

          {[
            { key: '__savings__',     label: 'Savings (HYSA)', color: '#818cf8' },
            { key: '__investments__', label: 'Investments',     color: '#4ade80' },
          ].map(({ key, label, color }) => {
            const budget    = parseFloat(budgets[key]) || 0
            const sliderMax = monthlyIncome
              ? Math.ceil(monthlyIncome * 0.5)
              : Math.max(Math.ceil((budget * 1.5 + 100) / 50) * 50, 500)
            const fillPct   = sliderMax > 0 ? Math.min((budget / sliderMax) * 100, 100) : 0

            return (
              <div key={key} className="planner-row pr-si">
                <span className="pr-cat" style={{ color }}>{label}</span>

                <div className="pr-budget">
                  <BudgetCell value={budgets[key]} onChange={v => handleBudget(key, v)} />
                </div>

                <div className="pr-slider">
                  <div className="pi-slider-wrap">
                    <input
                      type="range"
                      className="budget-slider"
                      min="0" max={sliderMax} step="5"
                      value={budget}
                      onChange={e => handleBudget(key, e.target.value)}
                      style={{ '--fill': `${fillPct}%`, '--thumb-color': color }}
                    />
                  </div>
                </div>

                <span className="pr-spent muted">—</span>

                <span className="pr-rem">
                  {budget > 0
                    ? <span style={{ color, fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(budget)}/mo</span>
                    : <span className="muted">—</span>}
                </span>

                {monthlyIncome && (
                  <span className="pr-pct">
                    {budget > 0
                      ? <span className="pct-pill">{((budget / monthlyIncome) * 100).toFixed(1)}%</span>
                      : <span className="muted">—</span>}
                  </span>
                )}
              </div>
            )
          })}

          {/* Footer totals */}
          <div className="planner-footer">
            <span className="pf-label">Spending total</span>
            <span className="pf-val">{spendingBudget > 0 ? fmt(spendingBudget) : '—'}</span>
            <span />
            <span className="pf-val debit-color">{totalSpent > 0 ? fmt(totalSpent) : '—'}</span>
            <span className={`pf-val ${totalSpent <= spendingBudget ? 'credit-color' : 'debit-color'}`}>
              {spendingBudget > 0
                ? (totalSpent <= spendingBudget ? fmt(spendingBudget - totalSpent) + ' left' : fmt(totalSpent - spendingBudget) + ' over')
                : '—'}
            </span>
            {monthlyIncome && <span />}
          </div>
        </div>
      </div>

      {/* ── Fixed Recurring Costs ─────────────────────── */}
      <div className="budget-section">
        <div className="budget-section-title">Fixed Recurring Costs</div>

        <div className="rc-list">
          {/* Header */}
          <div className="rc-header">
            <span />
            <span>Name</span>
            <span>Amount</span>
            <span>Frequency</span>
            <span className="rc-hdr-mo">/mo</span>
            <span />
          </div>

          {recurring.map(r => {
            const mo = rcMonthly(r)
            return (
              <div key={r.id} className={`rc-row${!r.enabled ? ' rc-row-off' : ''}`}>
                <input
                  type="checkbox"
                  className="rc-check"
                  checked={r.enabled}
                  onChange={e => handleRecurring(r.id, 'enabled', e.target.checked)}
                />
                <input
                  type="text"
                  className="rc-name"
                  value={r.name}
                  onChange={e => handleRecurring(r.id, 'name', e.target.value)}
                />
                <div className="rc-amount-wrap">
                  <span className="rc-dollar">$</span>
                  <input
                    type="number"
                    className="rc-amount"
                    placeholder="0"
                    value={r.amount}
                    onChange={e => handleRecurring(r.id, 'amount', e.target.value)}
                    min="0"
                    step="1"
                  />
                </div>
                <div className="rc-freq-seg">
                  {['monthly', 'yearly'].map(f => (
                    <button
                      key={f}
                      className={`rc-freq-btn${r.freq === f ? ' active' : ''}`}
                      onClick={() => handleRecurring(r.id, 'freq', f)}
                    >
                      {f === 'monthly' ? 'Mo' : 'Yr'}
                    </button>
                  ))}
                </div>
                <span className="rc-mo-val">
                  {mo > 0
                    ? <>{fmt(mo)}{r.freq === 'yearly' && <span className="rc-yr-note"> avg</span>}</>
                    : <span className="muted">—</span>}
                </span>
                <button
                  className="rc-delete"
                  onClick={() => deleteRecurring(r.id)}
                  title="Remove"
                >×</button>
              </div>
            )
          })}

          <div className="rc-footer">
            <button className="rc-add-btn" onClick={addRecurring}>+ Add custom</button>
            <div className="rc-total">
              <span className="rc-total-label">Monthly total</span>
              <span className="rc-total-val" style={{ color: '#f59e0b' }}>{recurringTotal > 0 ? fmt(recurringTotal) : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
