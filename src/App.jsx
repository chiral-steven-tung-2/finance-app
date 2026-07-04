import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Budget } from './Budget'
import { NetWorth } from './NetWorth'
import { Scenarios } from './Scenarios'
import { InsightPanel } from './InsightPanel'
import { Merchants } from './Merchants'
import { Stocks } from './Stocks'
import { Retirement } from './Retirement'
import { loadFromServer, onSyncStatus, getSyncStatus } from './dataPersistence'
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

function GroupRow({ group, isExcluded, excludedCats, toggleExcluded, NO_CATEGORY }) {
  const [open, setOpen] = useState(false)
  const groupCheckRef = useRef(null)
  const count = group.txs.length
  const isIncome = count > 0 && group.txs[0].amount >= 0

  const toggleable = group.txs.filter(t => !excludedCats.has(t.category || NO_CATEGORY))
  const noneExcluded = toggleable.length > 0 && toggleable.every(t => !isExcluded(t))
  const someExcluded = toggleable.some(t => isExcluded(t)) && !toggleable.every(t => isExcluded(t))

  useEffect(() => {
    if (groupCheckRef.current) groupCheckRef.current.indeterminate = someExcluded
  }, [someExcluded])

  function toggleGroup(e) {
    e.stopPropagation()
    if (noneExcluded) {
      toggleable.forEach(t => toggleExcluded(t.id))
    } else {
      toggleable.filter(t => isExcluded(t)).forEach(t => toggleExcluded(t.id))
    }
  }

  return (
    <div className={`grp-row-wrap${open ? ' open' : ''}`}>
      <div className="grp-row" onClick={() => setOpen(o => !o)}>
        <input
          ref={groupCheckRef}
          type="checkbox"
          className="grp-group-check"
          checked={noneExcluded}
          disabled={toggleable.length === 0}
          onChange={toggleGroup}
          onClick={e => e.stopPropagation()}
          title={toggleable.length === 0 ? 'All excluded by category' : 'Check/uncheck all in group'}
        />
        <span className="grp-chevron">{open ? '▾' : '▸'}</span>
        <div className="grp-name">
          <span className="grp-label">{group.label}</span>
          {group.keyword && <span className="grp-kw-pill">"{group.keyword}"</span>}
        </div>
        <span className="grp-count">{count} {count === 1 ? 'txn' : 'txns'}</span>
        <span className={`grp-total ${isIncome ? 'credit' : 'debit'}`}>
          {isIncome ? '+' : '-'}{fmt(group.total)}
        </span>
      </div>
      {open && (
        <div className="grp-txs">
          {[...group.txs]
            .sort((a, b) => {
              const [am, ad, ay] = a.date.split('/')
              const [bm, bd, by] = b.date.split('/')
              return new Date(+by, +bm - 1, +bd) - new Date(+ay, +am - 1, +ad)
            })
            .map(t => {
              const txExcluded  = isExcluded(t)
              const catExcluded = excludedCats.has(t.category || NO_CATEGORY)
              return (
                <div key={t.id} className={`grp-tx-row${txExcluded ? ' excluded' : ''}`}>
                  <input
                    type="checkbox"
                    className="grp-tx-check"
                    checked={!txExcluded}
                    disabled={catExcluded}
                    onChange={() => toggleExcluded(t.id)}
                    onClick={e => e.stopPropagation()}
                    title={catExcluded ? 'Excluded by category' : txExcluded ? 'Click to include' : 'Click to exclude'}
                  />
                  <span className="grp-tx-date">{t.date}</span>
                  <span className="grp-tx-desc">{t.description}</span>
                  <span className="grp-tx-cat">{t.category || '—'}</span>
                  <span className={`grp-tx-amt ${t.amount >= 0 ? 'credit' : 'debit'}`}>
                    {t.amount >= 0 ? '+' : ''}{fmt(t.amount)}
                  </span>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

// ── Server-load gate: render the app only after statements/app-data.json
// has been fetched and restored into localStorage so every component's
// useState initialiser reads the persisted values.
function AppGate() {
  const [ready, setReady] = useState(false)
  useEffect(() => { loadFromServer().finally(() => setReady(true)) }, [])
  if (!ready) return <div className="app-gate-loading">Loading…</div>
  return <App />
}
export default AppGate

function App() {
  const [transactions, setTransactions] = useState([])
  const [excluded,     setExcluded]     = useState(() => loadSet(STORAGE_KEY))
  const [excludedCats, setExcludedCats] = useState(() => loadSet(STORAGE_CAT_KEY))
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
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

  // Sync status indicator
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  useEffect(() => onSyncStatus(setSyncStatus), [])

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
  const [groupedView,   setGroupedView]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/transactions')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { setTransactions(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [refreshKey])

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

  const groupedData = useMemo(() => {
    if (!groupedView) return null
    let aggs = []
    try { aggs = JSON.parse(localStorage.getItem('finance-aggregates-v1') || '[]') } catch {}
    const expKwMap = new Map(aggs.map(a => [a.id, { id: `kw-exp:${a.id}`, label: a.label, keyword: a.keyword, txs: [], total: 0 }]))
    const incKwMap = new Map(aggs.map(a => [a.id, { id: `kw-inc:${a.id}`, label: a.label, keyword: a.keyword, txs: [], total: 0 }]))
    const catExpMap = new Map()
    const catIncMap = new Map()
    for (const t of filtered) {
      const active = !isExcluded(t)
      const desc = t.description.toLowerCase()
      const matchedAgg = aggs.find(a => desc.includes(a.keyword.toLowerCase()))
      if (t.amount < 0) {
        if (matchedAgg) {
          const g = expKwMap.get(matchedAgg.id); g.txs.push(t); if (active) g.total += Math.abs(t.amount)
        } else {
          const cat = t.category || '(Uncategorized)'
          if (!catExpMap.has(cat)) catExpMap.set(cat, { id: `cat:${cat}`, label: cat, keyword: null, txs: [], total: 0 })
          const g = catExpMap.get(cat); g.txs.push(t); if (active) g.total += Math.abs(t.amount)
        }
      } else {
        if (matchedAgg) {
          const g = incKwMap.get(matchedAgg.id); g.txs.push(t); if (active) g.total += t.amount
        } else {
          const cat = t.category || 'Income'
          if (!catIncMap.has(cat)) catIncMap.set(cat, { id: `inc:${cat}`, label: cat, keyword: null, txs: [], total: 0 })
          const g = catIncMap.get(cat); g.txs.push(t); if (active) g.total += t.amount
        }
      }
    }
    const expKwGroups  = [...expKwMap.values()].filter(g => g.txs.length > 0).sort((a, b) => b.total - a.total)
    const expCatGroups = [...catExpMap.values()].sort((a, b) => b.total - a.total)
    const incKwGroups  = [...incKwMap.values()].filter(g => g.txs.length > 0).sort((a, b) => b.total - a.total)
    const incCatGroups = [...catIncMap.values()].sort((a, b) => b.total - a.total)
    const totalExp = expKwGroups.reduce((s, g) => s + g.total, 0) + expCatGroups.reduce((s, g) => s + g.total, 0)
    const totalInc = incKwGroups.reduce((s, g) => s + g.total, 0) + incCatGroups.reduce((s, g) => s + g.total, 0)
    return { expKwGroups, expCatGroups, incKwGroups, incCatGroups, totalExp, totalInc }
  }, [filtered, groupedView, isExcluded])

  // Summary always reflects global active (not search-filtered)
  const earnings = useMemo(() => allActiveTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), [allActiveTxs])
  const spending = useMemo(() => allActiveTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0), [allActiveTxs])
  const net = earnings + spending

  // Spending analytics — monthly cash flow from transaction history
  const { monthlyStats, avgSpending } = useMemo(() => {
    const flowMap = new Map()
    for (const t of allActiveTxs) {
      const parts = t.date.split('/')
      const key = parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2,'0')}` : t.date.slice(0,7)
      if (!flowMap.has(key)) flowMap.set(key, { month: key, income: 0, spending: 0 })
      const d = flowMap.get(key)
      if (t.amount > 0) d.income += t.amount
      else d.spending += Math.abs(t.amount)
    }
    const stats = [...flowMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, net: m.income - m.spending }))
    const recent = stats.slice(-6)
    const avg = recent.length ? recent.reduce((s, m) => s + m.spending, 0) / recent.length : 0
    return { monthlyStats: stats, avgSpending: avg }
  }, [allActiveTxs])

  const ovIncData = (() => { try { return JSON.parse(localStorage.getItem('finance-income-v1')) ?? {} } catch { return {} } })()
  const ovTaxAmt  = parseFloat((() => { try { return localStorage.getItem('finance-tax-v1') } catch { return '' } })()) || 0
  const ovFreqs   = { biweekly: 24, monthly: 12, yearly: 1 }
  const ovPerYear = ovFreqs[ovIncData.freq] ?? 12
  const ovMonthlyGross    = ovIncData.amount ? (parseFloat(ovIncData.amount) || 0) * ovPerYear / 12 : 0
  const ovMonthlyTax      = ovTaxAmt * ovPerYear / 12
  const ovMonthlyTakeHome = ovMonthlyGross - ovMonthlyTax
  const ovHasIncome       = ovMonthlyTakeHome > 0

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
              <button className={`main-tab ${tab === 'networth'  ? 'active' : ''}`} onClick={() => setTab('networth')}>Net Worth</button>
              <button className={`main-tab ${tab === 'merchants' ? 'active' : ''}`} onClick={() => setTab('merchants')}>Merchants</button>
              <button className={`main-tab ${tab === 'scenarios' ? 'active' : ''}`} onClick={() => setTab('scenarios')}>Scenarios</button>
              <button className={`main-tab ${tab === 'stocks'     ? 'active' : ''}`} onClick={() => setTab('stocks')}>Stocks</button>
              <button className={`main-tab ${tab === 'retirement' ? 'active' : ''}`} onClick={() => setTab('retirement')}>Retirement</button>
            </nav>
            <button
              className={`refresh-btn${loading ? ' spinning' : ''}`}
              onClick={() => setRefreshKey(k => k + 1)}
              title="Reload transaction data"
              disabled={loading}
            >
              ↺
            </button>
            {syncStatus !== 'idle' && (
              <span className={`sync-status sync-${syncStatus}`}>
                {syncStatus === 'saving' ? '⏳ Saving…' : syncStatus === 'saved' ? '✓ Saved' : '⚠ Save failed'}
              </span>
            )}
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>

      </header>

      {/* ── Overview tab ─────────────────────────────────── */}
      {tab === 'overview' && <>
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

        {monthlyStats.length > 1 && (
          <div className="ov-spending-analytics">
            <div className="ov-analytics-title">Spending Analytics</div>
            <div className="nw-chart-card">
              <div className="nw-card-title">Monthly Cash Flow</div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={monthlyStats.slice(-12).map(m => {
                    const [y, mo] = m.month.split('-')
                    const label = new Date(+y, +mo - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
                    return { month: label, Income: Math.round(m.income), Spending: Math.round(m.spending) }
                  })}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="30%" barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.09)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={v => Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} width={52} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '12px', padding: '10px 14px' }}
                    formatter={(v, k) => [new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v), k]}
                    labelFormatter={v => v}
                  />
                  <Bar dataKey="Income"   fill="#4ade80" radius={[3,3,0,0]} />
                  <Bar dataKey="Spending" fill="#f87171" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              {ovHasIncome && (
                <div className="nw-cf-stats">
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Avg spend / mo</span>
                    <span className="nw-cf-val debit-color">{fmt(avgSpending)}</span>
                  </div>
                  <div className="nw-cf-sep" />
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Take-home / mo</span>
                    <span className="nw-cf-val income-color">{fmt(ovMonthlyTakeHome)}</span>
                  </div>
                  <div className="nw-cf-sep" />
                  <div className="nw-cf-item">
                    <span className="nw-cf-lbl">Surplus / mo</span>
                    <span className={`nw-cf-val ${ovMonthlyTakeHome - avgSpending >= 0 ? 'credit-color' : 'debit-color'}`}>
                      {ovMonthlyTakeHome - avgSpending >= 0 ? '+' : '−'}{fmt(Math.abs(ovMonthlyTakeHome - avgSpending))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="ov-view-toggle">
          <button className={`ovt-btn${!groupedView ? ' active' : ''}`} onClick={() => setGroupedView(false)}>All Transactions</button>
          <button className={`ovt-btn${groupedView  ? ' active' : ''}`} onClick={() => setGroupedView(true)}>Grouped View</button>
        </div>

        {!groupedView ? (
          <>
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
          </>
        ) : (
          <div className="grouped-view">
            <div className="grp-section">
              <div className="grp-section-hdr">
                <span className="grp-section-title">Expenses</span>
                {groupedData.expKwGroups.length > 0 && (
                  <span className="grp-merchant-note">
                    {groupedData.expKwGroups.length} merchant keyword{groupedData.expKwGroups.length !== 1 ? 's' : ''} matched
                  </span>
                )}
                <span className="grp-section-total debit">-{fmt(groupedData.totalExp)}</span>
              </div>
              {groupedData.expKwGroups.length > 0 && (
                <>
                  <div className="grp-subsection-lbl">By Merchant Keyword</div>
                  {groupedData.expKwGroups.map(g => <GroupRow key={g.id} group={g} isExcluded={isExcluded} excludedCats={excludedCats} toggleExcluded={toggleExcluded} NO_CATEGORY={NO_CATEGORY} />)}
                </>
              )}
              {groupedData.expCatGroups.length > 0 && (
                <>
                  {groupedData.expKwGroups.length > 0 && <div className="grp-subsection-lbl">Other (by Category)</div>}
                  {groupedData.expCatGroups.map(g => <GroupRow key={g.id} group={g} isExcluded={isExcluded} excludedCats={excludedCats} toggleExcluded={toggleExcluded} NO_CATEGORY={NO_CATEGORY} />)}
                </>
              )}
              {groupedData.expKwGroups.length === 0 && groupedData.expCatGroups.length === 0 && (
                <div className="grp-empty">No expense transactions in the current view.</div>
              )}
            </div>

            <div className="grp-section">
              <div className="grp-section-hdr">
                <span className="grp-section-title">Income</span>
                {groupedData.incKwGroups.length > 0 && (
                  <span className="grp-merchant-note">
                    {groupedData.incKwGroups.length} merchant keyword{groupedData.incKwGroups.length !== 1 ? 's' : ''} matched
                  </span>
                )}
                <span className="grp-section-total credit">+{fmt(groupedData.totalInc)}</span>
              </div>
              {groupedData.incKwGroups.length > 0 && (
                <>
                  <div className="grp-subsection-lbl">By Merchant Keyword</div>
                  {groupedData.incKwGroups.map(g => <GroupRow key={g.id} group={g} isExcluded={isExcluded} excludedCats={excludedCats} toggleExcluded={toggleExcluded} NO_CATEGORY={NO_CATEGORY} />)}
                </>
              )}
              {groupedData.incCatGroups.length > 0 && (
                <>
                  {groupedData.incKwGroups.length > 0 && <div className="grp-subsection-lbl">Other (by Category)</div>}
                  {groupedData.incCatGroups.map(g => <GroupRow key={g.id} group={g} isExcluded={isExcluded} excludedCats={excludedCats} toggleExcluded={toggleExcluded} NO_CATEGORY={NO_CATEGORY} />)}
                </>
              )}
              {groupedData.incKwGroups.length === 0 && groupedData.incCatGroups.length === 0 && (
                <div className="grp-empty">No income transactions in the current view.</div>
              )}
            </div>

            <div className="grp-net-row">
              <span className="grp-net-label">Net</span>
              <span className={`grp-net-val ${groupedData.totalInc - groupedData.totalExp >= 0 ? 'credit' : 'debit'}`}>
                {signedFmt(groupedData.totalInc - groupedData.totalExp)}
              </span>
            </div>
          </div>
        )}
      </>}

      {/* ── Budget tab ───────────────────────────────────── */}
      {tab === 'budget'   && <Budget txs={budgetTxs} />}
      {tab === 'networth'  && <NetWorth />}
      {tab === 'merchants'  && <Merchants allActiveTxs={allActiveTxs} />}
      {tab === 'scenarios' && <Scenarios allActiveTxs={allActiveTxs} stocksData={stocksData} />}
      {tab === 'stocks'     && <Stocks />}
      {tab === 'retirement' && <Retirement />}

    </div>
  )
}
