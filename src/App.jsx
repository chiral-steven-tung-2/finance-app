import { useState, useEffect, useMemo, useCallback } from 'react'
import { CategoryDonut, DailyChart, TopMerchants } from './Charts'
import { Budget } from './Budget'
import { Savings } from './Savings'
import { NetWorth } from './NetWorth'
import { Scenarios } from './Scenarios'
import { InsightPanel } from './InsightPanel'
import './App.css'

const STORAGE_KEY     = 'finance-excluded-ids'
const STORAGE_CAT_KEY = 'finance-excluded-categories'

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return new Set() }
}
function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])) }

const NO_CATEGORY = '(Uncategorized)'

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount))
}
function signedFmt(amount) {
  return (amount >= 0 ? '+' : '-') + fmt(amount)
}

export default function App() {
  const [transactions, setTransactions] = useState([])
  const [excluded,     setExcluded]     = useState(() => loadSet(STORAGE_KEY))
  const [excludedCats, setExcludedCats] = useState(() => loadSet(STORAGE_CAT_KEY))
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [tab, setTab] = useState('overview')

  // Stock data fetched once, shared across all tabs
  const [stocksData,  setStocksData]  = useState({})
  const [stockStates, setStockStates] = useState({ VOO: 'loading', QQQ: 'loading' })

  useEffect(() => {
    ['VOO', 'QQQ'].forEach(id => {
      fetch(`/api/stock/${id}`)
        .then(r => r.json())
        .then(d => {
          if (d.error) throw new Error(d.error)
          setStocksData(p => ({ ...p, [id]: d }))
          setStockStates(p => ({ ...p, [id]: 'ok' }))
        })
        .catch(() => setStockStates(p => ({ ...p, [id]: 'error' })))
    })
  }, [])

  // Theme: 'light' | 'dark' — initialised from saved pref, else system
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('finance-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('finance-theme', theme)
  }, [theme])

  // Overview filters
  const [activeAccount, setActiveAccount] = useState('All')
  const [search,        setSearch]        = useState('')
  const [sortField,     setSortField]     = useState('date')
  const [sortDir,       setSortDir]       = useState('desc')

  useEffect(() => {
    fetch('/api/transactions')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { setTransactions(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const accounts = useMemo(() => {
    const seen = new Set()
    transactions.forEach(t => seen.add(t.account))
    return ['All', ...[...seen].sort()]
  }, [transactions])

  const isExcluded = useCallback((tx) => (
    excluded.has(tx.id) || excludedCats.has(tx.category || NO_CATEGORY)
  ), [excluded, excludedCats])

  // All active transactions (exclusions only, no account/search filter) — used for summary cards
  const allActiveTxs = useMemo(() =>
    transactions.filter(t => !isExcluded(t)),
    [transactions, isExcluded]
  )

  // Budget ignores category exclusions — only individual unchecks apply
  const budgetTxs = useMemo(() =>
    transactions.filter(t => !excluded.has(t.id)),
    [transactions, excluded]
  )

  // Overview: sorted + filtered by account/search
  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (sortField === 'date')   { av = new Date(av); bv = new Date(bv) }
      if (sortField === 'amount') { av = Number(av);   bv = Number(bv)   }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [transactions, sortField, sortDir])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sorted.filter(t => {
      if (activeAccount !== 'All' && t.account !== activeAccount) return false
      if (q && !t.description.toLowerCase().includes(q) && !(t.category || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [sorted, activeAccount, search])

  const categories = useMemo(() => {
    const map = new Map()
    for (const t of transactions) {
      const cat = t.category || NO_CATEGORY
      map.set(cat, (map.get(cat) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [transactions])

  // Filtered active txs for overview charts/table
  const activeTxs = useMemo(() => filtered.filter(t => !isExcluded(t)), [filtered, isExcluded])

  // Summary always reflects global active (not search-filtered)
  const earnings = useMemo(() => allActiveTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [allActiveTxs])
  const spending = useMemo(() => allActiveTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0), [allActiveTxs])
  const net = earnings + spending

  const overviewInsights = useMemo(() => {
    const out = []
    if (allActiveTxs.length === 0) return out
    if (net > 0) {
      out.push({ type: 'good', text: `Net positive period — you kept ${fmt(net)} more than you spent.` })
    } else if (net < 0) {
      const pct = earnings > 0 ? ((Math.abs(net) / earnings) * 100).toFixed(1) : 0
      out.push({ type: 'bad', text: `Spending exceeded earnings by ${fmt(Math.abs(net))} (${pct}% over income) this period.` })
    }
    const catSpend = new Map()
    for (const t of allActiveTxs) {
      if (t.amount < 0) {
        const cat = t.category || NO_CATEGORY
        catSpend.set(cat, (catSpend.get(cat) || 0) + Math.abs(t.amount))
      }
    }
    if (catSpend.size > 0) {
      const sorted = [...catSpend.entries()].sort((a, b) => b[1] - a[1])
      const [topCat, topAmt] = sorted[0]
      const totalSpend = Math.abs(spending)
      const topPct = totalSpend > 0 ? ((topAmt / totalSpend) * 100).toFixed(1) : 0
      if (parseFloat(topPct) > 40) {
        out.push({ type: 'warn', text: `${topCat} dominates spending at ${topPct}% of total (${fmt(topAmt)}).`, detail: 'Heavy concentration in one category can leave other needs underfunded.' })
      } else {
        out.push({ type: 'info', text: `Largest expense: ${topCat} at ${fmt(topAmt)} (${topPct}% of spending).` })
      }
    }
    const monthSpend = new Map()
    for (const t of allActiveTxs) {
      if (t.amount < 0) {
        const parts = t.date.split('/')
        const mk = parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2, '0')}` : t.date.slice(0, 7)
        monthSpend.set(mk, (monthSpend.get(mk) || 0) + Math.abs(t.amount))
      }
    }
    const sortedMonths = [...monthSpend.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (sortedMonths.length >= 2) {
      const prev = sortedMonths[sortedMonths.length - 2][1]
      const curr = sortedMonths[sortedMonths.length - 1][1]
      const diff = curr - prev
      const pct = prev > 0 ? ((Math.abs(diff) / prev) * 100).toFixed(1) : 0
      if (diff > prev * 0.1) {
        out.push({ type: 'warn', text: `Spending is ${pct}% higher than the previous month (+${fmt(diff)}).` })
      } else if (diff < -(prev * 0.1)) {
        out.push({ type: 'good', text: `Spending is ${pct}% lower than the previous month — you saved ${fmt(Math.abs(diff))}.` })
      }
    }
    if (excluded.size > 0) {
      out.push({ type: 'info', text: `${excluded.size} transaction${excluded.size !== 1 ? 's are' : ' is'} excluded from totals.`, detail: 'Excluded items do not affect your summary, budget, or net worth calculations.' })
    }
    return out
  }, [allActiveTxs, net, earnings, spending, excluded])

  const toggleExcluded = useCallback((id) => {
    setExcluded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      saveSet(STORAGE_KEY, next)
      return next
    })
  }, [])

  const toggleExcludedCat = useCallback((cat) => {
    setExcludedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      saveSet(STORAGE_CAT_KEY, next)
      return next
    })
  }, [])

  function handleSort(field) {
    setSortField(f => {
      if (f === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return f }
      setSortDir('desc')
      return field
    })
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <span className="sort-icon inactive">↕</span>
    return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) return <div className="state-msg">Loading transactions…</div>
  if (error)   return <div className="state-msg error">Failed to load: {error}<br /><small>Make sure the dev server is running.</small></div>

  return (
    <div className="finance-app">

      {/* ── Header ───────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-top">
          <h1>Finance</h1>
          <div className="header-right">
            <nav className="main-nav">
              <button className={`main-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
              <button className={`main-tab ${tab === 'budget'   ? 'active' : ''}`} onClick={() => setTab('budget')}>Budget</button>
              <button className={`main-tab ${tab === 'savings'  ? 'active' : ''}`} onClick={() => setTab('savings')}>Savings</button>
              <button className={`main-tab ${tab === 'networth'  ? 'active' : ''}`} onClick={() => setTab('networth')}>Net Worth</button>
              <button className={`main-tab ${tab === 'scenarios' ? 'active' : ''}`} onClick={() => setTab('scenarios')}>Scenarios</button>
            </nav>
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>

        <div className="summary-cards">
          <div className="card earnings">
            <div className="card-label">Earnings</div>
            <div className="card-amount">+{fmt(earnings)}</div>
          </div>
          <div className="card spending">
            <div className="card-label">Spending</div>
            <div className="card-amount">-{fmt(Math.abs(spending))}</div>
          </div>
          <div className={`card net ${net >= 0 ? 'positive' : 'negative'}`}>
            <div className="card-label">Net</div>
            <div className="card-amount">{signedFmt(net)}</div>
          </div>
        </div>
      </header>

      {/* ── Overview tab ─────────────────────────────────── */}
      {tab === 'overview' && <>
        <div className="controls">
          <div className="account-tabs">
            {accounts.map(a => (
              <button
                key={a}
                className={`tab ${activeAccount === a ? 'active' : ''}`}
                onClick={() => setActiveAccount(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search description or category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="cat-filter">
          <div className="cat-filter-header">
            <span className="cat-filter-label">Categories</span>
            <div className="cat-filter-actions">
              <button className="cat-bulk-btn" onClick={() => {
                setExcludedCats(new Set())
                saveSet(STORAGE_CAT_KEY, new Set())
              }}>All</button>
              <button className="cat-bulk-btn" onClick={() => {
                const all = new Set(categories.map(([cat]) => cat))
                setExcludedCats(all)
                saveSet(STORAGE_CAT_KEY, all)
              }}>None</button>
            </div>
          </div>
          <div className="cat-chips">
            {categories.map(([cat, count]) => {
              const on = !excludedCats.has(cat)
              return (
                <button
                  key={cat}
                  className={`cat-chip ${on ? 'on' : 'off'}`}
                  onClick={() => toggleExcludedCat(cat)}
                  title={on ? 'Click to exclude this category' : 'Click to include this category'}
                >
                  {cat}
                  <span className="cat-chip-count">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <InsightPanel insights={overviewInsights} />

        <div className="dashboard">
          <CategoryDonut activeTxs={activeTxs} />
          <DailyChart    activeTxs={activeTxs} />
          <TopMerchants  activeTxs={activeTxs} />
        </div>

        <div className="tx-count">
          Showing {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          {excluded.size     > 0 && <span className="excluded-badge">{excluded.size} individually excluded</span>}
          {excludedCats.size > 0 && <span className="excluded-badge">{excludedCats.size} categor{excludedCats.size !== 1 ? 'ies' : 'y'} excluded</span>}
        </div>

        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th className="col-check" />
                <th className="col-date sortable"   onClick={() => handleSort('date')}>Date <SortIcon field="date" /></th>
                <th className="col-desc sortable"   onClick={() => handleSort('description')}>Description <SortIcon field="description" /></th>
                <th className="col-cat">Category</th>
                <th className="col-account">Account</th>
                <th className="col-amount sortable" onClick={() => handleSort('amount')}>Amount <SortIcon field="amount" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const txExcluded  = isExcluded(tx)
                const catExcluded = excludedCats.has(tx.category || NO_CATEGORY)
                return (
                  <tr key={tx.id} className={txExcluded ? 'excluded' : ''}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={!txExcluded}
                        disabled={catExcluded}
                        onChange={() => toggleExcluded(tx.id)}
                        title={catExcluded ? 'Excluded by category' : txExcluded ? 'Click to include' : 'Click to exclude'}
                      />
                    </td>
                    <td className="col-date">{tx.date}</td>
                    <td className="col-desc">{tx.description}</td>
                    <td className="col-cat">{tx.category || <span className="muted">—</span>}</td>
                    <td className="col-account">{tx.account}</td>
                    <td className={`col-amount ${tx.amount >= 0 ? 'credit' : 'debit'}`}>
                      {tx.amount >= 0 ? '+' : ''}{fmt(tx.amount)}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No transactions match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </>}

      {/* ── Budget tab ───────────────────────────────────── */}
      {tab === 'budget'   && <Budget allActiveTxs={budgetTxs} />}
      {tab === 'savings'   && <Savings   stocksData={stocksData} loadStates={stockStates} />}
      {tab === 'networth'  && <NetWorth  allActiveTxs={allActiveTxs} stocksData={stocksData} />}
      {tab === 'scenarios' && <Scenarios allActiveTxs={allActiveTxs} stocksData={stocksData} />}

    </div>
  )
}
