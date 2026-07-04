import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const STORAGE_KEY = 'finance-retirement-v1'

const KNOWN_LIMITS = {
  2023: { hsaInd: 3850,  hsaFam: 7750,  k401: 22500, catchUp: 7500 },
  2024: { hsaInd: 4150,  hsaFam: 8300,  k401: 23000, catchUp: 7500 },
  2025: { hsaInd: 4300,  hsaFam: 8550,  k401: 23500, catchUp: 7500 },
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      entries: raw.entries ?? [],
      settings: {
        hsaType:   raw.settings?.hsaType   ?? 'individual',
        catchUp:   raw.settings?.catchUp   ?? false,
        hsaLimit:  raw.settings?.hsaLimit  ?? null,
        k401Limit: raw.settings?.k401Limit ?? null,
      },
      espp: {
        ticker:        raw.espp?.ticker        ?? 'MSFT',
        discountPct:   raw.espp?.discountPct   ?? 10,
        contributions: raw.espp?.contributions ?? [],
        purchases:     raw.espp?.purchases     ?? [],
      },
      brokerage: {
        holdings: raw.brokerage?.holdings ?? [],
      },
      rsu: {
        ticker: raw.rsu?.ticker ?? 'MSFT',
        grants:  raw.rsu?.grants  ?? [],
      },
      hysa: {
        startingBalance: raw.hysa?.startingBalance ?? 0,
        rate:            raw.hysa?.rate            ?? '4.5',
        transactions:    raw.hysa?.transactions    ?? [],
      },
    }
  } catch {
    return {
      entries: [],
      settings: { hsaType: 'individual', catchUp: false, hsaLimit: null, k401Limit: null },
      espp: { ticker: 'MSFT', discountPct: 10, contributions: [], purchases: [] },
      brokerage: { holdings: [] },
      rsu: { ticker: 'MSFT', grants: [] },
      hysa: { startingBalance: 0, rate: '4.5', transactions: [] },
    }
  }
}

function save(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function fmtCur(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function getYear(e) { return parseInt(e.date.slice(0, 4), 10) }

// ── Limit bar ──────────────────────────────────────────────────────────────────
function LimitBar({ value, limit, label }) {
  const pct = limit > 0 ? Math.min(100, (value / limit) * 100) : 0
  const over = limit > 0 && value > limit
  const cls = over ? 'rt-bar-fill over' : pct >= 80 ? 'rt-bar-fill warn' : 'rt-bar-fill'
  return (
    <div className="rt-limit-bar-wrap">
      <div className="rt-limit-bar-track">
        <div className={cls} style={{ width: `${pct}%` }} />
      </div>
      <div className="rt-limit-bar-labels">
        <span>{label}</span>
        <span className={over ? 'rt-over' : ''}>{fmtCur(value)} / {fmtCur(limit)}</span>
      </div>
    </div>
  )
}

// ── Section divider ────────────────────────────────────────────────────────────
function SectionDivider({ icon, title, sub }) {
  return (
    <div className="rt-section-divider">
      <span className="rt-section-icon">{icon}</span>
      <div>
        <div className="rt-section-title">{title}</div>
        {sub && <div className="rt-section-sub">{sub}</div>}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Retirement() {
  const [state, setState] = useState(load)
  const { entries, settings, espp, brokerage, rsu, hysa } = state

  const currentYear = new Date().getFullYear()
  const yearsWithData = useMemo(() => {
    const s = new Set(entries.map(e => getYear(e)))
    s.add(currentYear)
    return [...s].sort((a, b) => b - a)
  }, [entries, currentYear])
  const [year, setYear] = useState(currentYear)
  const [showSettings, setShowSettings] = useState(false)
  const [rtTab, setRtTab] = useState('hsa')

  // ── HSA / 401k state ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({ date: todayISO(), hsaEmp: '', hsaMatch: '', k401Emp: '', k401Match: '' })
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(null)

  function updateSettings(patch) {
    const next = { ...state, settings: { ...settings, ...patch } }
    setState(next); save(next)
  }

  function addEntry() {
    const hsaEmp    = parseFloat(form.hsaEmp)    || 0
    const hsaMatch  = parseFloat(form.hsaMatch)  || 0
    const k401Emp   = parseFloat(form.k401Emp)   || 0
    const k401Match = parseFloat(form.k401Match) || 0
    if (!form.date || (hsaEmp + hsaMatch + k401Emp + k401Match === 0)) return
    const entry = { id: uid(), date: form.date, hsaEmp, hsaMatch, k401Emp, k401Match }
    const next = { ...state, entries: [...entries, entry].sort((a, b) => a.date.localeCompare(b.date)) }
    setState(next); save(next)
    setForm(f => ({ ...f, hsaEmp: '', hsaMatch: '', k401Emp: '', k401Match: '' }))
  }

  function removeEntry(id) {
    const next = { ...state, entries: entries.filter(e => e.id !== id) }
    setState(next); save(next)
    if (editId === id) setEditId(null)
  }

  function startEdit(e) {
    setEditId(e.id)
    setEditForm({ date: e.date, hsaEmp: e.hsaEmp, hsaMatch: e.hsaMatch, k401Emp: e.k401Emp, k401Match: e.k401Match })
  }

  function saveEdit() {
    const entry = {
      id: editId, date: editForm.date,
      hsaEmp:   parseFloat(editForm.hsaEmp)   || 0,
      hsaMatch: parseFloat(editForm.hsaMatch)  || 0,
      k401Emp:  parseFloat(editForm.k401Emp)   || 0,
      k401Match:parseFloat(editForm.k401Match) || 0,
    }
    const next = { ...state, entries: entries.map(e => e.id === editId ? entry : e).sort((a, b) => a.date.localeCompare(b.date)) }
    setState(next); save(next)
    setEditId(null); setEditForm(null)
  }

  const yearEntries = useMemo(() => entries.filter(e => getYear(e) === year), [entries, year])
  const totals = useMemo(() => {
    const t = { hsaEmp: 0, hsaMatch: 0, k401Emp: 0, k401Match: 0 }
    for (const e of yearEntries) { t.hsaEmp += e.hsaEmp; t.hsaMatch += e.hsaMatch; t.k401Emp += e.k401Emp; t.k401Match += e.k401Match }
    return t
  }, [yearEntries])

  const limits = useMemo(() => {
    const known = KNOWN_LIMITS[year] ?? KNOWN_LIMITS[2025]
    return {
      hsa:  settings.hsaLimit  ?? (settings.hsaType === 'family' ? known.hsaFam : known.hsaInd),
      k401: settings.k401Limit ?? (known.k401 + (settings.catchUp ? known.catchUp : 0)),
      knownYear: year in KNOWN_LIMITS,
    }
  }, [year, settings])

  const chartData = useMemo(() => {
    let cHsaE = 0, cHsaT = 0, c401E = 0, c401T = 0
    return yearEntries.map(e => {
      cHsaE += e.hsaEmp; cHsaT += e.hsaEmp + e.hsaMatch
      c401E += e.k401Emp; c401T += e.k401Emp + e.k401Match
      return { date: fmtDate(e.date), 'HSA (you)': +cHsaE.toFixed(2), 'HSA total': +cHsaT.toFixed(2), '401k (you)': +c401E.toFixed(2), '401k total': +c401T.toFixed(2) }
    })
  }, [yearEntries])

  // Fixed pay schedule: 15th and 30th of each month (24 periods/year).
  // February and shorter months use their last day when < 30.
  const paySchedule = useMemo(() => {
    const dates = []
    for (let m = 0; m < 12; m++) {
      const mm = String(m + 1).padStart(2, '0')
      dates.push(`${year}-${mm}-15`)
      const lastDay = new Date(year, m + 1, 0).getDate()
      dates.push(`${year}-${mm}-${String(Math.min(30, lastDay)).padStart(2, '0')}`)
    }
    return dates   // 24 ISO date strings, sorted ascending
  }, [year])

  const n = yearEntries.length
  const lastPayDate    = n ? yearEntries.at(-1).date : null
  const futurePeriods  = paySchedule.filter(d => !lastPayDate || d > lastPayDate)
  const payPeriodsLeft = futurePeriods.length
  const totalPeriods   = paySchedule.length  // 24

  // Per-period averages split by employee vs employer
  const avgHsaEmp    = n ? totals.hsaEmp    / n : 0
  const avgHsaMatch  = n ? totals.hsaMatch  / n : 0
  const avgK401Emp   = n ? totals.k401Emp   / n : 0
  const avgK401Match = n ? totals.k401Match / n : 0

  // HSA: IRS limit is on combined (employee + employer). Cap the whole projection.
  const hsaCurrent   = totals.hsaEmp + totals.hsaMatch
  const hsaProjected = Math.min(hsaCurrent + (avgHsaEmp + avgHsaMatch) * payPeriodsLeft, limits.hsa)
  const hsaCapped    = hsaProjected >= limits.hsa && payPeriodsLeft > 0

  // 401k: IRS limit is on employee contributions only.
  const k401EmpRemaining      = Math.max(0, limits.k401 - totals.k401Emp)
  const periodsEmpContributes = avgK401Emp > 0
    ? Math.min(payPeriodsLeft, Math.ceil(k401EmpRemaining / avgK401Emp))
    : 0
  const k401EmpProjected   = Math.min(totals.k401Emp + avgK401Emp * payPeriodsLeft, limits.k401)
  const k401MatchProjected = totals.k401Match + avgK401Match * periodsEmpContributes
  const k401Projected      = k401EmpProjected + k401MatchProjected
  const k401Capped         = k401EmpProjected >= limits.k401 && payPeriodsLeft > 0

  const perPeriodHsa  = avgHsaEmp + avgHsaMatch
  const perPeriodK401 = avgK401Emp + avgK401Match

  // Projected limit-hit date: look up the Nth future period in the fixed schedule
  function limitHitDate(periodsNeeded) {
    if (!periodsNeeded || periodsNeeded <= 0 || !n) return null
    if (periodsNeeded > futurePeriods.length) return null
    const iso = futurePeriods[periodsNeeded - 1]
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const hsaPeriodsToLimit  = perPeriodHsa > 0
    ? Math.ceil(Math.max(0, limits.hsa - hsaCurrent) / perPeriodHsa) : null
  const k401PeriodsToLimit = avgK401Emp > 0
    ? Math.ceil(Math.max(0, limits.k401 - totals.k401Emp) / avgK401Emp) : null

  const hsaLimitDate  = limitHitDate(hsaPeriodsToLimit)
  const k401LimitDate = limitHitDate(k401PeriodsToLimit)

  // Upcoming scheduled dates for quick-select in the form
  const upcomingPeriods = paySchedule.filter(d => d >= todayISO()).slice(0, 6)

  // ── ESPP state ───────────────────────────────────────────────────────────────
  const [esppContribForm, setEsppContribForm] = useState({ date: todayISO(), amount: '' })
  const [esppPurchaseForm, setEsppPurchaseForm] = useState({
    date: todayISO(), shares: '', purchasePrice: '', fmv: '',
  })
  const [esppEditingContrib, setEsppEditingContrib] = useState(null)
  const [esppEditingPurchase, setEsppEditingPurchase] = useState(null)
  const [showContribLog, setShowContribLog] = useState(false)

  function updateEspp(patch) {
    const next = { ...state, espp: { ...espp, ...patch } }
    setState(next); save(next)
  }

  function addEsppContrib() {
    const amount = parseFloat(esppContribForm.amount)
    if (!esppContribForm.date || !amount || amount <= 0) return
    const contrib = { id: uid(), date: esppContribForm.date, amount }
    updateEspp({ contributions: [...espp.contributions, contrib].sort((a, b) => a.date.localeCompare(b.date)) })
    setEsppContribForm(f => ({ ...f, amount: '' }))
  }

  function removeEsppContrib(id) {
    updateEspp({ contributions: espp.contributions.filter(c => c.id !== id) })
  }

  function addEsppPurchase() {
    const shares        = parseFloat(esppPurchaseForm.shares)
    const purchasePrice = parseFloat(esppPurchaseForm.purchasePrice)
    const fmv           = parseFloat(esppPurchaseForm.fmv) || null
    if (!esppPurchaseForm.date || !shares || !purchasePrice) return
    const purchase = { id: uid(), date: esppPurchaseForm.date, shares, purchasePrice, fmv }
    updateEspp({ purchases: [...espp.purchases, purchase].sort((a, b) => a.date.localeCompare(b.date)) })
    setEsppPurchaseForm({ date: todayISO(), shares: '', purchasePrice: '', fmv: '' })
  }

  function removeEsppPurchase(id) {
    updateEspp({ purchases: espp.purchases.filter(p => p.id !== id) })
  }

  function saveEsppPurchaseEdit() {
    const updated = {
      ...esppEditingPurchase,
      shares:        parseFloat(esppEditingPurchase.shares)        || 0,
      purchasePrice: parseFloat(esppEditingPurchase.purchasePrice) || 0,
      fmv:           parseFloat(esppEditingPurchase.fmv)           || null,
    }
    updateEspp({ purchases: espp.purchases.map(p => p.id === updated.id ? updated : p).sort((a, b) => a.date.localeCompare(b.date)) })
    setEsppEditingPurchase(null)
  }

  // ESPP derived
  const esppDerived = useMemo(() => {
    const lastPurchase = espp.purchases.length ? espp.purchases.at(-1) : null
    const cutoff = lastPurchase?.date ?? '0000-00-00'
    const currentQContribs = espp.contributions.filter(c => c.date > cutoff)
    const currentQTotal    = currentQContribs.reduce((s, c) => s + c.amount, 0)

    const totalShares        = espp.purchases.reduce((s, p) => s + p.shares, 0)
    const totalCost          = espp.purchases.reduce((s, p) => s + p.shares * p.purchasePrice, 0)
    const totalDiscountGain  = espp.purchases.reduce((s, p) => {
      if (p.fmv == null) return s
      return s + p.shares * (p.fmv - p.purchasePrice)
    }, 0)
    const purchasesWithFmv = espp.purchases.filter(p => p.fmv != null)

    // auto-calc shares for purchase form preview
    const formPurchasePrice = parseFloat(esppPurchaseForm.purchasePrice)
    const estimatedShares   = (formPurchasePrice > 0 && currentQTotal > 0)
      ? (currentQTotal / formPurchasePrice).toFixed(3)
      : null

    return { lastPurchase, currentQContribs, currentQTotal, totalShares, totalCost, totalDiscountGain, purchasesWithFmv, estimatedShares }
  }, [espp, esppPurchaseForm.purchasePrice])

  // ── Brokerage & prices ────────────────────────────────────────────────────────
  const [prices, setPrices] = useState({})

  const tickerSet = useMemo(() => (
    [...new Set([espp.ticker, rsu.ticker, ...brokerage.holdings.map(h => h.ticker)].filter(Boolean))]
  ), [espp.ticker, rsu.ticker, brokerage.holdings])

  useEffect(() => {
    tickerSet.forEach(ticker => {
      setPrices(curr => {
        if (curr[ticker]) return curr
        fetch(`/api/stock/${ticker}`)
          .then(r => r.json())
          .then(d => {
            if (d.error) throw new Error(d.error)
            setPrices(p => ({ ...p, [ticker]: { price: d.currentPrice, name: d.name, state: 'ok' } }))
          })
          .catch(() => setPrices(p => ({ ...p, [ticker]: { state: 'error' } })))
        return { ...curr, [ticker]: { state: 'loading' } }
      })
    })
  }, [tickerSet])

  const [brkForm, setBrkForm] = useState({ ticker: '', shares: '' })
  const [brkEditId, setBrkEditId] = useState(null)
  const [brkEditShares, setBrkEditShares] = useState('')

  function updateBrokerage(patch) {
    const next = { ...state, brokerage: { ...brokerage, ...patch } }
    setState(next); save(next)
  }

  function addHolding() {
    const ticker = brkForm.ticker.trim().toUpperCase()
    const shares = parseFloat(brkForm.shares)
    if (!ticker || !shares || shares <= 0) return
    const existing = brokerage.holdings.find(h => h.ticker === ticker)
    const holdings = existing
      ? brokerage.holdings.map(h => h.ticker === ticker ? { ...h, shares: h.shares + shares } : h)
      : [...brokerage.holdings, { id: uid(), ticker, shares }]
    updateBrokerage({ holdings })
    setBrkForm({ ticker: '', shares: '' })
  }

  function removeHolding(id) {
    updateBrokerage({ holdings: brokerage.holdings.filter(h => h.id !== id) })
    if (brkEditId === id) setBrkEditId(null)
  }

  function saveHolding(id) {
    const shares = parseFloat(brkEditShares)
    if (!shares || shares <= 0) return
    updateBrokerage({ holdings: brokerage.holdings.map(h => h.id === id ? { ...h, shares } : h) })
    setBrkEditId(null)
    setBrkEditShares('')
  }

  const allTimeTotals = useMemo(() => {
    const t = { hsa: 0, k401: 0 }
    for (const e of entries) { t.hsa += e.hsaEmp + e.hsaMatch; t.k401 += e.k401Emp + e.k401Match }
    return t
  }, [entries])

  const hysaTxTotal = hysa.transactions.reduce((s, t) =>
    s + (t.type === 'contribution' ? t.amount : -t.amount), 0)
  const hysaBalance = hysa.startingBalance + hysaTxTotal
  const hysaRate = hysa.rate

  const esppPrice = prices[espp.ticker]?.price ?? null
  const esppValue = esppPrice != null ? esppDerived.totalShares * esppPrice : null

  const brkHoldingsWithValues = brokerage.holdings.map(h => {
    const pd = prices[h.ticker]
    const price = pd?.state === 'ok' ? pd.price : null
    const value = price != null ? h.shares * price : null
    return { ...h, price, value, priceState: pd?.state ?? 'idle', priceName: pd?.name }
  })
  const brkTotal = brkHoldingsWithValues.reduce((s, h) => s + (h.value ?? 0), 0)

  // ── RSU logic ─────────────────────────────────────────────────────────────────
  function updateRsu(patch) {
    const next = { ...state, rsu: { ...rsu, ...patch } }
    setState(next); save(next)
  }

  const [rsuForm, setRsuForm] = useState({ vestDate: '', shares: '', grantPrice: '' })
  const [vestingRsuId, setVestingRsuId] = useState(null)
  const [vestPriceInput, setVestPriceInput] = useState('')

  function addGrant() {
    const shares = parseFloat(rsuForm.shares)
    if (!rsuForm.vestDate || !shares || shares <= 0) return
    const grant = {
      id: uid(), vestDate: rsuForm.vestDate, shares,
      grantPrice: parseFloat(rsuForm.grantPrice) || null,
      vested: false, vestPrice: null,
    }
    updateRsu({ grants: [...rsu.grants, grant].sort((a, b) => a.vestDate.localeCompare(b.vestDate)) })
    setRsuForm(f => ({ ...f, shares: '', grantPrice: '' }))
  }

  function removeGrant(id) {
    updateRsu({ grants: rsu.grants.filter(g => g.id !== id) })
    if (vestingRsuId === id) setVestingRsuId(null)
  }

  function confirmVest(id) {
    updateRsu({
      grants: rsu.grants.map(g => g.id === id
        ? { ...g, vested: true, vestPrice: parseFloat(vestPriceInput) || null }
        : g),
    })
    setVestingRsuId(null); setVestPriceInput('')
  }

  function unmarkVested(id) {
    updateRsu({ grants: rsu.grants.map(g => g.id === id ? { ...g, vested: false, vestPrice: null } : g) })
  }

  // ── HYSA logic ────────────────────────────────────────────────────────────────
  function updateHysa(patch) {
    const next = { ...state, hysa: { ...hysa, ...patch } }
    setState(next); save(next)
  }

  const [hysaForm, setHysaForm] = useState({ date: todayISO(), type: 'contribution', amount: '', note: '' })

  function addHysaTx() {
    const amount = parseFloat(hysaForm.amount)
    if (!hysaForm.date || !amount || amount <= 0) return
    const tx = { id: uid(), date: hysaForm.date, type: hysaForm.type, amount, note: hysaForm.note.trim() }
    updateHysa({ transactions: [...hysa.transactions, tx].sort((a, b) => a.date.localeCompare(b.date)) })
    setHysaForm(f => ({ ...f, amount: '', note: '' }))
  }

  function removeHysaTx(id) {
    updateHysa({ transactions: hysa.transactions.filter(t => t.id !== id) })
  }

  const rsuPrice = prices[rsu.ticker]?.price ?? null
  const unvestedGrants = rsu.grants.filter(g => !g.vested)
  const totalUnvestedShares = unvestedGrants.reduce((s, g) => s + g.shares, 0)
  const unvestedValue = rsuPrice != null ? totalUnvestedShares * rsuPrice : null
  const nextVest = unvestedGrants[0] ?? null

  const vestedGrants = rsu.grants.filter(g => g.vested)
  const totalVestedShares = vestedGrants.reduce((s, g) => s + g.shares, 0)
  // Vested value: use vestPrice (FMV at vest) if recorded, otherwise fall back to current price
  const vestedRsuValue = vestedGrants.reduce((s, g) => {
    const price = g.vestPrice ?? rsuPrice
    return price != null ? s + g.shares * price : s
  }, 0)

  // Pre-defined vest dates for quick-select (user's MSFT schedule)
  const rsuQuickDates = ['2026-12-15', '2027-12-15', '2028-12-15', '2029-12-15']

  const totalNetWorth = hysaBalance + allTimeTotals.hsa + allTimeTotals.k401 + (esppValue ?? 0) + brkTotal

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rt-root">

      {/* ════ Net Worth Overview ════════════════════════════════════════════════ */}
      <div className="rt-nw-section">
        <div className="rt-nw-header">
          <div className="rt-nw-header-left">
            <span className="rt-nw-icon">💎</span>
            <div>
              <div className="rt-nw-title">Net Worth</div>
              <div className="rt-nw-subtitle">All retirement &amp; investment accounts</div>
            </div>
          </div>
          <div className="rt-nw-totals">
            <div className="rt-nw-total-val">{fmtCur(totalNetWorth)}</div>
          </div>
        </div>
        <div className="rt-nw-cards">
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">💵</div>
            <div className="rt-nw-card-label">HYSA</div>
            <div className="rt-nw-card-value">{hysaBalance > 0 ? fmtCur(hysaBalance) : '—'}</div>
            <div className="rt-nw-card-sub">{hysaRate}% APY</div>
          </div>
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">🏥</div>
            <div className="rt-nw-card-label">HSA</div>
            <div className="rt-nw-card-value">{fmtCur(allTimeTotals.hsa)}</div>
            <div className="rt-nw-card-sub">contributions</div>
          </div>
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">🏦</div>
            <div className="rt-nw-card-label">401k</div>
            <div className="rt-nw-card-value">{fmtCur(allTimeTotals.k401)}</div>
            <div className="rt-nw-card-sub">contributions</div>
          </div>
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">📈</div>
            <div className="rt-nw-card-label">ESPP ({espp.ticker})</div>
            <div className="rt-nw-card-value">
              {esppValue != null ? fmtCur(esppValue)
                : prices[espp.ticker]?.state === 'loading' ? <span className="muted">…</span>
                : '—'}
            </div>
            <div className="rt-nw-card-sub">
              {esppDerived.totalShares > 0
                ? `${esppDerived.totalShares.toFixed(2)} shares`
                : 'no shares'}
              {esppValue == null && esppDerived.totalShares > 0 && prices[espp.ticker]?.state === 'error' && ' · price unavail.'}
            </div>
          </div>
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">📊</div>
            <div className="rt-nw-card-label">Brokerage</div>
            <div className="rt-nw-card-value">{brkTotal > 0 ? fmtCur(brkTotal) : '—'}</div>
            <div className="rt-nw-card-sub">
              {brokerage.holdings.length > 0
                ? `${brokerage.holdings.length} position${brokerage.holdings.length !== 1 ? 's' : ''}`
                : 'no positions'}
            </div>
          </div>
          <div className="rt-nw-card">
            <div className="rt-nw-card-icon">🔒</div>
            <div className="rt-nw-card-label">RSUs ({rsu.ticker})</div>
            <div className="rt-nw-card-value">
              {vestedRsuValue > 0 ? fmtCur(vestedRsuValue)
                : unvestedValue != null ? fmtCur(unvestedValue)
                : prices[rsu.ticker]?.state === 'loading' ? <span className="muted">…</span>
                : '—'}
            </div>
            <div className="rt-nw-card-sub">
              {totalVestedShares > 0
                ? `${totalVestedShares.toLocaleString()} vested shares`
                : totalUnvestedShares > 0
                  ? `${totalUnvestedShares.toLocaleString()} unvested shares`
                  : 'no grants yet'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="rt-section-tabs">
        <button className={`rt-section-tab${rtTab === 'hsa' ? ' active' : ''}`} onClick={() => setRtTab('hsa')}>
          💼 HSA &amp; 401k
          {n > 0 && <span className="rt-tab-badge">{n}</span>}
        </button>
        <button className={`rt-section-tab${rtTab === 'espp' ? ' active' : ''}`} onClick={() => setRtTab('espp')}>
          📈 ESPP
          {espp.purchases.length > 0 && <span className="rt-tab-badge">{espp.purchases.length}</span>}
        </button>
        <button className={`rt-section-tab${rtTab === 'brokerage' ? ' active' : ''}`} onClick={() => setRtTab('brokerage')}>
          📊 Brokerage
          {brokerage.holdings.length > 0 && <span className="rt-tab-badge">{brokerage.holdings.length}</span>}
        </button>
        <button className={`rt-section-tab${rtTab === 'rsu' ? ' active' : ''}`} onClick={() => setRtTab('rsu')}>
          🔒 RSUs
          {unvestedGrants.length > 0 && <span className="rt-tab-badge">{unvestedGrants.length}</span>}
        </button>
        <button className={`rt-section-tab${rtTab === 'hysa' ? ' active' : ''}`} onClick={() => setRtTab('hysa')}>
          💵 HYSA
        </button>
      </div>

      {/* ════ HSA & 401k tab ════════════════════════════════════════════════════ */}
      {rtTab === 'hsa' && <>

        {/* ── Year / settings row ── */}
        <div className="rt-year-row">
          <div className="rt-year-tabs">
            {yearsWithData.map(y => (
              <button key={y} className={`rt-year-tab${year === y ? ' active' : ''}`} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
          <button className="rt-settings-btn" onClick={() => setShowSettings(s => !s)}>⚙ Settings</button>
        </div>

        {showSettings && (
          <div className="rt-settings-panel">
            <div className="rt-settings-grid">
              <div className="rt-settings-field">
                <label className="rt-settings-lbl">HSA Coverage Type</label>
                <div className="rt-toggle-group">
                  <button className={`rt-toggle-btn${settings.hsaType === 'individual' ? ' active' : ''}`} onClick={() => updateSettings({ hsaType: 'individual', hsaLimit: null })}>Individual</button>
                  <button className={`rt-toggle-btn${settings.hsaType === 'family' ? ' active' : ''}`} onClick={() => updateSettings({ hsaType: 'family', hsaLimit: null })}>Family</button>
                </div>
              </div>
              <div className="rt-settings-field">
                <label className="rt-settings-lbl">401k Catch-up (age 50+)</label>
                <div className="rt-toggle-group">
                  <button className={`rt-toggle-btn${!settings.catchUp ? ' active' : ''}`} onClick={() => updateSettings({ catchUp: false, k401Limit: null })}>No</button>
                  <button className={`rt-toggle-btn${settings.catchUp ? ' active' : ''}`} onClick={() => updateSettings({ catchUp: true, k401Limit: null })}>Yes (+$7,500)</button>
                </div>
              </div>
              <div className="rt-settings-field">
                <label className="rt-settings-lbl">Override HSA Limit {!limits.knownYear && <span className="rt-settings-hint">(unknown year)</span>}</label>
                <input className="rt-settings-inp" type="number" min="0" step="50"
                  placeholder={`${limits.hsa} (IRS default)`} value={settings.hsaLimit ?? ''}
                  onChange={e => updateSettings({ hsaLimit: e.target.value ? parseFloat(e.target.value) : null })} />
              </div>
              <div className="rt-settings-field">
                <label className="rt-settings-lbl">Override 401k Limit {!limits.knownYear && <span className="rt-settings-hint">(unknown year)</span>}</label>
                <input className="rt-settings-inp" type="number" min="0" step="100"
                  placeholder={`${limits.k401} (IRS default)`} value={settings.k401Limit ?? ''}
                  onChange={e => updateSettings({ k401Limit: e.target.value ? parseFloat(e.target.value) : null })} />
              </div>
            </div>
            <div className="rt-settings-note">HSA limit is the IRS total (your contributions + employer combined). 401k limit is employee elective deferral only.</div>
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="rt-summary-grid">
          <div className="rt-summary-card rt-hsa">
            <div className="rt-card-header">
              <span className="rt-card-icon">🏥</span>
              <div>
                <div className="rt-card-title">HSA — {year}</div>
                <div className="rt-card-sub">{settings.hsaType === 'family' ? 'Family' : 'Individual'} plan</div>
              </div>
              <div className="rt-card-total">{fmtCur(totals.hsaEmp + totals.hsaMatch)}</div>
            </div>
            <div className="rt-card-rows">
              <div className="rt-card-row"><span>Your contributions</span><strong>{fmtCur(totals.hsaEmp)}</strong></div>
              <div className="rt-card-row"><span>Employer contributions</span><strong>{fmtCur(totals.hsaMatch)}</strong></div>
              {payPeriodsLeft > 0 && perPeriodHsa > 0 && (
                <div className="rt-card-row rt-card-proj">
                  <span>Projected year-end{hsaCapped ? ' (limit)' : ''}</span>
                  <strong>{fmtCur(hsaProjected)}</strong>
                </div>
              )}
              {hsaLimitDate && (
                <div className="rt-card-row rt-limit-date-row">
                  <span>Limit reached ~</span>
                  <strong className="rt-limit-date">{hsaLimitDate}</strong>
                </div>
              )}
            </div>
            <LimitBar value={totals.hsaEmp + totals.hsaMatch} limit={limits.hsa} label={`IRS limit: ${fmtCur(limits.hsa)}`} />
          </div>

          <div className="rt-summary-card rt-k401">
            <div className="rt-card-header">
              <span className="rt-card-icon">🏦</span>
              <div>
                <div className="rt-card-title">401k — {year}</div>
                <div className="rt-card-sub">{settings.catchUp ? 'With catch-up' : 'Standard'} limit</div>
              </div>
              <div className="rt-card-total">{fmtCur(totals.k401Emp + totals.k401Match)}</div>
            </div>
            <div className="rt-card-rows">
              <div className="rt-card-row"><span>Your contributions</span><strong>{fmtCur(totals.k401Emp)}</strong></div>
              <div className="rt-card-row"><span>Employer match</span><strong>{fmtCur(totals.k401Match)}</strong></div>
              {payPeriodsLeft > 0 && perPeriodK401 > 0 && (
                <div className="rt-card-row rt-card-proj">
                  <span>Projected year-end{k401Capped ? ' (limit)' : ''}</span>
                  <strong>{fmtCur(k401Projected)}</strong>
                </div>
              )}
              {k401LimitDate && (
                <div className="rt-card-row rt-limit-date-row">
                  <span>Limit reached ~</span>
                  <strong className="rt-limit-date">{k401LimitDate}</strong>
                </div>
              )}
            </div>
            <LimitBar value={totals.k401Emp} limit={limits.k401} label={`Employee limit: ${fmtCur(limits.k401)}`} />
          </div>
        </div>

        {/* ── Cumulative chart ── */}
        {chartData.length > 1 && (
          <div className="rt-chart-wrap">
            <div className="rt-chart-title">Cumulative Contributions — {year}</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="hsaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} /><stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="k401Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v)} width={52} />
                <Tooltip formatter={(v, name) => [fmtCur(v), name]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="HSA total"  stroke="#38bdf8" strokeWidth={2} fill="url(#hsaGrad)"  dot={false} />
                <Area type="monotone" dataKey="HSA (you)"  stroke="#0ea5e9" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
                <Area type="monotone" dataKey="401k total" stroke="#a78bfa" strokeWidth={2} fill="url(#k401Grad)" dot={false} />
                <Area type="monotone" dataKey="401k (you)" stroke="#7c3aed" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Log Pay Period form ── */}
        <div className="rt-form-wrap">
          <div className="rt-form-title-row">
            <div className="rt-form-title">Log Pay Period</div>
            {upcomingPeriods.length > 0 && (
              <div className="rt-period-shortcuts">
                <span className="rt-period-shortcuts-lbl">Quick select:</span>
                {upcomingPeriods.map(d => (
                  <button key={d} className={`rt-period-btn${form.date === d ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, date: d }))}>
                    {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rt-form-grid">
            <div className="rt-form-field rt-form-date">
              <label className="rt-form-lbl">Pay Date</label>
              <input className="rt-form-inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="rt-form-group">
              <div className="rt-form-group-label"><span className="rt-hsa-color">🏥</span> HSA</div>
              <div className="rt-form-pair">
                <div className="rt-form-field">
                  <label className="rt-form-lbl">Your contribution</label>
                  <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.hsaEmp} onChange={e => setForm(f => ({ ...f, hsaEmp: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEntry()} />
                </div>
                <div className="rt-form-field">
                  <label className="rt-form-lbl">Employer match</label>
                  <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.hsaMatch} onChange={e => setForm(f => ({ ...f, hsaMatch: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEntry()} />
                </div>
              </div>
            </div>
            <div className="rt-form-group">
              <div className="rt-form-group-label"><span className="rt-k401-color">🏦</span> 401k</div>
              <div className="rt-form-pair">
                <div className="rt-form-field">
                  <label className="rt-form-lbl">Your contribution</label>
                  <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.k401Emp} onChange={e => setForm(f => ({ ...f, k401Emp: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEntry()} />
                </div>
                <div className="rt-form-field">
                  <label className="rt-form-lbl">Employer match</label>
                  <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.k401Match} onChange={e => setForm(f => ({ ...f, k401Match: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEntry()} />
                </div>
              </div>
            </div>
            <button className="rt-add-btn" onClick={addEntry}>+ Add Pay Period</button>
          </div>
        </div>

        {/* ── Pay period table ── */}
        {yearEntries.length > 0 ? (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row">
              <span className="rt-table-title">{yearEntries.length} pay periods logged in {year}</span>
              <span className="rt-table-pace">{`Period ${n} of ${totalPeriods} logged · ${payPeriodsLeft} remaining`}</span>
            </div>
            <div className="rt-table-scroll">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th>Pay Date</th>
                    <th className="rt-col-hsa">HSA (you)</th><th className="rt-col-hsa">HSA Match</th>
                    <th className="rt-col-k401">401k (you)</th><th className="rt-col-k401">401k Match</th>
                    <th className="rt-col-total">Total</th><th className="rt-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...yearEntries].reverse().map(e => {
                    const isEditing = editId === e.id
                    const rowTotal = e.hsaEmp + e.hsaMatch + e.k401Emp + e.k401Match
                    return (
                      <tr key={e.id} className={isEditing ? 'rt-row-editing' : ''}>
                        {isEditing ? (
                          <>
                            <td><input className="rt-edit-inp" type="date" value={editForm.date} onChange={ev => setEditForm(f => ({ ...f, date: ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={editForm.hsaEmp}    onChange={ev => setEditForm(f => ({ ...f, hsaEmp:   ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={editForm.hsaMatch}   onChange={ev => setEditForm(f => ({ ...f, hsaMatch:  ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={editForm.k401Emp}    onChange={ev => setEditForm(f => ({ ...f, k401Emp:  ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={editForm.k401Match}  onChange={ev => setEditForm(f => ({ ...f, k401Match: ev.target.value }))} /></td>
                            <td className="rt-col-total">—</td>
                            <td className="rt-col-actions">
                              <button className="rt-action-save" onClick={saveEdit} title="Save">✓</button>
                              <button className="rt-action-cancel" onClick={() => { setEditId(null); setEditForm(null) }} title="Cancel">✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="rt-date-cell">{fmtDate(e.date)}</td>
                            <td className="rt-col-hsa rt-amt">{e.hsaEmp   > 0 ? fmtCur(e.hsaEmp)   : '—'}</td>
                            <td className="rt-col-hsa rt-amt rt-match">{e.hsaMatch  > 0 ? fmtCur(e.hsaMatch)  : '—'}</td>
                            <td className="rt-col-k401 rt-amt">{e.k401Emp  > 0 ? fmtCur(e.k401Emp)  : '—'}</td>
                            <td className="rt-col-k401 rt-amt rt-match">{e.k401Match > 0 ? fmtCur(e.k401Match) : '—'}</td>
                            <td className="rt-col-total rt-amt rt-total-amt">{fmtCur(rowTotal)}</td>
                            <td className="rt-col-actions">
                              <button className="rt-action-edit" onClick={() => startEdit(e)} title="Edit">✎</button>
                              <button className="rt-action-del"  onClick={() => removeEntry(e.id)} title="Delete">✕</button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="rt-tfoot-row">
                    <td>YTD Total</td>
                    <td className="rt-col-hsa rt-amt">{fmtCur(totals.hsaEmp)}</td>
                    <td className="rt-col-hsa rt-amt rt-match">{fmtCur(totals.hsaMatch)}</td>
                    <td className="rt-col-k401 rt-amt">{fmtCur(totals.k401Emp)}</td>
                    <td className="rt-col-k401 rt-amt rt-match">{fmtCur(totals.k401Match)}</td>
                    <td className="rt-col-total rt-amt rt-total-amt">{fmtCur(totals.hsaEmp + totals.hsaMatch + totals.k401Emp + totals.k401Match)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="rt-empty">
            <div className="rt-empty-icon">💰</div>
            <div className="rt-empty-title">No entries yet for {year}</div>
            <div className="rt-empty-sub">Use the form above to log your first pay period.</div>
          </div>
        )}
      </>}

      {/* ════ ESPP tab ══════════════════════════════════════════════════════════ */}
      {rtTab === 'espp' && <>

        {/* ── ESPP settings inline ── */}
        <div className="rt-espp-settings">
          <div className="rt-form-field">
            <label className="rt-form-lbl">Ticker symbol</label>
            <input className="rt-form-inp rt-espp-ticker-inp" type="text" maxLength={10} spellCheck={false}
              value={espp.ticker}
              onChange={e => updateEspp({ ticker: e.target.value.toUpperCase() })} />
          </div>
          <div className="rt-form-field">
            <label className="rt-form-lbl">Discount %</label>
            <input className="rt-form-inp rt-espp-pct-inp" type="number" min="1" max="15" step="0.5"
              value={espp.discountPct}
              onChange={e => updateEspp({ discountPct: parseFloat(e.target.value) || 10 })} />
          </div>
          <div className="rt-espp-settings-note">
            Shares are purchased at the end of each quarter at {espp.discountPct}% off the market price.
          </div>
        </div>

        {/* ── ESPP summary cards ── */}
        <div className="rt-espp-cards">
          <div className="rt-espp-card">
            <div className="rt-espp-card-label">Current Quarter Withheld</div>
            <div className="rt-espp-card-value">{fmtCur(esppDerived.currentQTotal)}</div>
            <div className="rt-espp-card-sub">
              {esppDerived.currentQContribs.length} pay period{esppDerived.currentQContribs.length !== 1 ? 's' : ''} since last purchase
              {esppDerived.lastPurchase && ` (${fmtDate(esppDerived.lastPurchase.date)})`}
            </div>
            {esppDerived.estimatedShares && (
              <div className="rt-espp-est">
                ≈ {esppDerived.estimatedShares} shares at entered price
              </div>
            )}
          </div>

          <div className="rt-espp-card">
            <div className="rt-espp-card-label">Total Shares Acquired</div>
            <div className="rt-espp-card-value">{esppDerived.totalShares.toFixed(4)}</div>
            <div className="rt-espp-card-sub">
              across {espp.purchases.length} quarter{espp.purchases.length !== 1 ? 'ly purchases' : 'ly purchase'}
            </div>
            <div className="rt-espp-card-cost">Total invested: {fmtCur(esppDerived.totalCost)}</div>
          </div>

          <div className="rt-espp-card rt-espp-card-gain">
            <div className="rt-espp-card-label">Total Discount Gain</div>
            <div className="rt-espp-card-value rt-gain-value">{fmtCur(esppDerived.totalDiscountGain)}</div>
            <div className="rt-espp-card-sub">
              {esppDerived.purchasesWithFmv.length < espp.purchases.length
                ? `Based on ${esppDerived.purchasesWithFmv.length} of ${espp.purchases.length} purchases (FMV entered)`
                : 'Immediate gain from the discount at purchase'}
            </div>
            {esppDerived.totalCost > 0 && esppDerived.totalDiscountGain > 0 && (
              <div className="rt-espp-card-pct">
                {((esppDerived.totalDiscountGain / esppDerived.totalCost) * 100).toFixed(1)}% return on cost
              </div>
            )}
          </div>
        </div>

        {/* ── Log withholding form ── */}
        <div className="rt-form-wrap">
          <div className="rt-form-title-row">
            <div className="rt-form-title">Log Pay Period Withholding</div>
            {upcomingPeriods.length > 0 && (
              <div className="rt-period-shortcuts">
                <span className="rt-period-shortcuts-lbl">Quick select:</span>
                {upcomingPeriods.map(d => (
                  <button key={d} className={`rt-period-btn${esppContribForm.date === d ? ' active' : ''}`}
                    onClick={() => setEsppContribForm(f => ({ ...f, date: d }))}>
                    {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rt-espp-contrib-form">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Pay Date</label>
              <input className="rt-form-inp" type="date" value={esppContribForm.date}
                onChange={e => setEsppContribForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Amount withheld</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="0.00"
                value={esppContribForm.amount}
                onChange={e => setEsppContribForm(f => ({ ...f, amount: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addEsppContrib()} />
            </div>
            <button className="rt-add-btn rt-espp-contrib-btn" onClick={addEsppContrib}>+ Add</button>
          </div>
        </div>

        {/* ── Log quarterly purchase form ── */}
        <div className="rt-form-wrap">
          <div className="rt-form-title">Log Quarterly Purchase</div>
          <div className="rt-espp-purchase-form">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Purchase Date</label>
              <input className="rt-form-inp" type="date" value={esppPurchaseForm.date}
                onChange={e => setEsppPurchaseForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Shares purchased</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.001" placeholder="0.000"
                value={esppPurchaseForm.shares}
                onChange={e => setEsppPurchaseForm(f => ({ ...f, shares: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Purchase price / share</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="what you paid"
                value={esppPurchaseForm.purchasePrice}
                onChange={e => setEsppPurchaseForm(f => ({ ...f, purchasePrice: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Market price / share <span className="rt-form-opt">(optional)</span></label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="for gain calc"
                value={esppPurchaseForm.fmv}
                onChange={e => setEsppPurchaseForm(f => ({ ...f, fmv: e.target.value }))} />
            </div>
            <div className="rt-espp-purchase-preview">
              {esppPurchaseForm.shares && esppPurchaseForm.purchasePrice && (
                <>
                  <span>Cost: {fmtCur(parseFloat(esppPurchaseForm.shares) * parseFloat(esppPurchaseForm.purchasePrice))}</span>
                  {esppPurchaseForm.fmv && (
                    <span className="rt-gain-value">
                      Discount gain: {fmtCur(parseFloat(esppPurchaseForm.shares) * (parseFloat(esppPurchaseForm.fmv) - parseFloat(esppPurchaseForm.purchasePrice)))}
                    </span>
                  )}
                  {esppDerived.currentQTotal > 0 && (
                    <span className="rt-espp-hint">
                      ≈ {(esppDerived.currentQTotal / parseFloat(esppPurchaseForm.purchasePrice)).toFixed(3)} shares from {fmtCur(esppDerived.currentQTotal)} withheld
                    </span>
                  )}
                </>
              )}
            </div>
            <button className="rt-add-btn" onClick={addEsppPurchase}
              disabled={!esppPurchaseForm.shares || !esppPurchaseForm.purchasePrice}>
              + Log Purchase
            </button>
          </div>
        </div>

        {/* ── Purchase history table ── */}
        {espp.purchases.length > 0 && (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row">
              <span className="rt-table-title">Purchase History — all time</span>
            </div>
            <div className="rt-table-scroll">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th>Purchase Date</th>
                    <th>Shares</th>
                    <th>Purchase Price</th>
                    <th>Market Price</th>
                    <th>Total Cost</th>
                    <th>Discount Gain</th>
                    <th className="rt-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...espp.purchases].reverse().map(p => {
                    const isEditing = esppEditingPurchase?.id === p.id
                    const cost = p.shares * p.purchasePrice
                    const gain = p.fmv != null ? p.shares * (p.fmv - p.purchasePrice) : null
                    return (
                      <tr key={p.id} className={isEditing ? 'rt-row-editing' : ''}>
                        {isEditing ? (
                          <>
                            <td><input className="rt-edit-inp" type="date" value={esppEditingPurchase.date}
                              onChange={ev => setEsppEditingPurchase(f => ({ ...f, date: ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.001" value={esppEditingPurchase.shares}
                              onChange={ev => setEsppEditingPurchase(f => ({ ...f, shares: ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={esppEditingPurchase.purchasePrice}
                              onChange={ev => setEsppEditingPurchase(f => ({ ...f, purchasePrice: ev.target.value }))} /></td>
                            <td><input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01" value={esppEditingPurchase.fmv ?? ''}
                              onChange={ev => setEsppEditingPurchase(f => ({ ...f, fmv: ev.target.value }))} /></td>
                            <td>—</td><td>—</td>
                            <td className="rt-col-actions">
                              <button className="rt-action-save" onClick={saveEsppPurchaseEdit}>✓</button>
                              <button className="rt-action-cancel" onClick={() => setEsppEditingPurchase(null)}>✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="rt-date-cell">{fmtDate(p.date)}</td>
                            <td className="rt-amt">{p.shares.toFixed(4)}</td>
                            <td className="rt-amt">{fmtCur(p.purchasePrice)}</td>
                            <td className="rt-amt">{p.fmv != null ? fmtCur(p.fmv) : '—'}</td>
                            <td className="rt-amt">{fmtCur(cost)}</td>
                            <td className="rt-amt rt-gain-value">{gain != null ? fmtCur(gain) : '—'}</td>
                            <td className="rt-col-actions">
                              <button className="rt-action-edit" onClick={() => setEsppEditingPurchase({ ...p })} title="Edit">✎</button>
                              <button className="rt-action-del"  onClick={() => removeEsppPurchase(p.id)} title="Delete">✕</button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="rt-tfoot-row">
                    <td>Total</td>
                    <td className="rt-amt">{esppDerived.totalShares.toFixed(4)}</td>
                    <td></td><td></td>
                    <td className="rt-amt">{fmtCur(esppDerived.totalCost)}</td>
                    <td className="rt-amt rt-gain-value">{fmtCur(esppDerived.totalDiscountGain)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Withholding log (collapsible) ── */}
        {espp.contributions.length > 0 && (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row" style={{ cursor: 'pointer' }} onClick={() => setShowContribLog(v => !v)}>
              <span className="rt-table-title">
                {showContribLog ? '▾' : '▸'} Pay Period Withholdings ({espp.contributions.length} entries · {fmtCur(espp.contributions.reduce((s, c) => s + c.amount, 0))} total)
              </span>
            </div>
            {showContribLog && (
              <div className="rt-table-scroll">
                <table className="rt-table">
                  <thead><tr><th>Date</th><th>Amount Withheld</th><th className="rt-col-actions"></th></tr></thead>
                  <tbody>
                    {[...espp.contributions].reverse().map(c => (
                      <tr key={c.id}>
                        <td className="rt-date-cell">{fmtDate(c.date)}</td>
                        <td className="rt-amt">{fmtCur(c.amount)}</td>
                        <td className="rt-col-actions">
                          <button className="rt-action-del" onClick={() => removeEsppContrib(c.id)} title="Delete">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {espp.contributions.length === 0 && espp.purchases.length === 0 && (
          <div className="rt-empty">
            <div className="rt-empty-icon">📈</div>
            <div className="rt-empty-title">No ESPP data yet</div>
            <div className="rt-empty-sub">Log each pay period's withholding above, then record each quarterly purchase when Microsoft buys your shares at the {espp.discountPct}% discount.</div>
          </div>
        )}
      </>}

      {/* ════ Brokerage tab ═════════════════════════════════════════════════════ */}
      {rtTab === 'brokerage' && <>

        <div className="rt-form-wrap">
          <div className="rt-form-title">Add Position</div>
          <div className="rt-brk-form">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Ticker Symbol</label>
              <input className="rt-form-inp rt-espp-ticker-inp" type="text" maxLength={10}
                spellCheck={false} placeholder="AAPL"
                value={brkForm.ticker}
                onChange={e => setBrkForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                onKeyDown={e => e.key === 'Enter' && addHolding()} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Shares Owned</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.001"
                placeholder="0.000"
                value={brkForm.shares}
                onChange={e => setBrkForm(f => ({ ...f, shares: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addHolding()} />
            </div>
            <button className="rt-add-btn" onClick={addHolding}
              disabled={!brkForm.ticker.trim() || !brkForm.shares}>
              + Add
            </button>
          </div>
        </div>

        {brkHoldingsWithValues.length > 0 ? (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row">
              <span className="rt-table-title">
                {brokerage.holdings.length} position{brokerage.holdings.length !== 1 ? 's' : ''}
              </span>
              <span className="rt-table-pace">Total: {fmtCur(brkTotal)}</span>
            </div>
            <div className="rt-table-scroll">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Name</th>
                    <th>Shares</th>
                    <th>Price</th>
                    <th>Value</th>
                    <th>% of Portfolio</th>
                    <th className="rt-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {brkHoldingsWithValues.map(h => {
                    const isEditing = brkEditId === h.id
                    return (
                      <tr key={h.id} className={isEditing ? 'rt-row-editing' : ''}>
                        <td className="rt-date-cell rt-brk-ticker">{h.ticker}</td>
                        <td className="rt-brk-name">{h.priceName ?? '—'}</td>
                        <td className="rt-amt">
                          {isEditing ? (
                            <input
                              className="rt-edit-inp rt-edit-money"
                              type="number" min="0" step="0.001" autoFocus
                              value={brkEditShares}
                              onChange={e => setBrkEditShares(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveHolding(h.id)
                                if (e.key === 'Escape') setBrkEditId(null)
                              }}
                            />
                          ) : (
                            h.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })
                          )}
                        </td>
                        <td className="rt-amt">
                          {h.priceState === 'loading' ? <span className="muted">…</span>
                            : h.price != null ? fmtCur(h.price)
                            : <span className="muted">N/A</span>}
                        </td>
                        <td className="rt-amt rt-total-amt">{h.value != null ? fmtCur(h.value) : '—'}</td>
                        <td className="rt-amt">
                          {h.value != null && brkTotal > 0
                            ? ((h.value / brkTotal) * 100).toFixed(1) + '%'
                            : '—'}
                        </td>
                        <td className="rt-col-actions">
                          {isEditing ? (
                            <>
                              <button className="rt-action-save" onClick={() => saveHolding(h.id)} title="Save">✓</button>
                              <button className="rt-action-cancel" onClick={() => setBrkEditId(null)} title="Cancel">✕</button>
                            </>
                          ) : (
                            <>
                              <button className="rt-action-edit" onClick={() => { setBrkEditId(h.id); setBrkEditShares(String(h.shares)) }} title="Edit shares">✎</button>
                              <button className="rt-action-del" onClick={() => removeHolding(h.id)} title="Remove">✕</button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {brkTotal > 0 && (
                  <tfoot>
                    <tr className="rt-tfoot-row">
                      <td colSpan={4}>Total</td>
                      <td className="rt-amt rt-total-amt">{fmtCur(brkTotal)}</td>
                      <td></td><td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ) : (
          <div className="rt-empty">
            <div className="rt-empty-icon">📊</div>
            <div className="rt-empty-title">No positions added yet</div>
            <div className="rt-empty-sub">Enter a ticker and your share count above to track your brokerage holdings.</div>
          </div>
        )}
      </>}

      {/* ════ RSU tab ════════════════════════════════════════════════════════════ */}
      {rtTab === 'rsu' && <>

        {/* ── RSU settings ── */}
        <div className="rt-espp-settings">
          <div className="rt-form-field">
            <label className="rt-form-lbl">Ticker symbol</label>
            <input className="rt-form-inp rt-espp-ticker-inp" type="text" maxLength={10}
              spellCheck={false} value={rsu.ticker}
              onChange={e => updateRsu({ ticker: e.target.value.toUpperCase() })} />
          </div>
          <div className="rt-espp-settings-note">
            RSUs vest as ordinary income at the fair market value on the vest date.
            After vesting, move shares to your Brokerage tab.
          </div>
        </div>

        {/* ── RSU summary cards ── */}
        {rsu.grants.length > 0 && (
          <div className="rt-espp-cards">
            <div className="rt-espp-card">
              <div className="rt-espp-card-label">Next Vest</div>
              {nextVest ? (
                <>
                  <div className="rt-espp-card-value">
                    {new Date(nextVest.vestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="rt-espp-card-sub">{nextVest.shares.toLocaleString()} shares</div>
                  {rsuPrice != null && (
                    <div className="rt-espp-card-cost">≈ {fmtCur(nextVest.shares * rsuPrice)} at current price</div>
                  )}
                </>
              ) : (
                <div className="rt-espp-card-value muted">All vested</div>
              )}
            </div>

            <div className="rt-espp-card">
              <div className="rt-espp-card-label">Total Unvested Shares</div>
              <div className="rt-espp-card-value">{totalUnvestedShares.toLocaleString()}</div>
              <div className="rt-espp-card-sub">
                across {unvestedGrants.length} grant{unvestedGrants.length !== 1 ? 's' : ''}
              </div>
              {unvestedValue != null && (
                <div className="rt-espp-card-cost">≈ {fmtCur(unvestedValue)} at current price</div>
              )}
            </div>

            <div className="rt-espp-card rt-espp-card-gain">
              <div className="rt-espp-card-label">Current {rsu.ticker} Price</div>
              <div className="rt-espp-card-value">
                {rsuPrice != null ? fmtCur(rsuPrice)
                  : prices[rsu.ticker]?.state === 'loading' ? <span className="muted">Loading…</span>
                  : <span className="muted">Unavailable</span>}
              </div>
              <div className="rt-espp-card-sub">
                {rsu.grants.filter(g => g.vested).length > 0
                  ? `${rsu.grants.filter(g => g.vested).length} tranche${rsu.grants.filter(g => g.vested).length !== 1 ? 's' : ''} vested`
                  : 'No tranches vested yet'}
              </div>
            </div>
          </div>
        )}

        {/* ── Add grant form ── */}
        <div className="rt-form-wrap">
          <div className="rt-form-title-row">
            <div className="rt-form-title">Add Vesting Tranche</div>
            <div className="rt-period-shortcuts">
              <span className="rt-period-shortcuts-lbl">Quick dates:</span>
              {rsuQuickDates.map(d => (
                <button key={d} className={`rt-period-btn${rsuForm.vestDate === d ? ' active' : ''}`}
                  onClick={() => setRsuForm(f => ({ ...f, vestDate: d }))}>
                  Dec 15, {d.slice(0, 4)}
                </button>
              ))}
            </div>
          </div>
          <div className="rt-brk-form rt-rsu-form">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Vest Date</label>
              <input className="rt-form-inp" type="date" value={rsuForm.vestDate}
                onChange={e => setRsuForm(f => ({ ...f, vestDate: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Shares Vesting</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="1" placeholder="0"
                value={rsuForm.shares}
                onChange={e => setRsuForm(f => ({ ...f, shares: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addGrant()} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Grant Price <span className="rt-form-opt">(optional)</span></label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="0.01" placeholder="price at grant"
                value={rsuForm.grantPrice}
                onChange={e => setRsuForm(f => ({ ...f, grantPrice: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addGrant()} />
            </div>
            <button className="rt-add-btn" onClick={addGrant}
              disabled={!rsuForm.vestDate || !rsuForm.shares}>
              + Add
            </button>
          </div>
        </div>

        {/* ── Vesting schedule table ── */}
        {rsu.grants.length > 0 ? (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row">
              <span className="rt-table-title">Vesting Schedule</span>
              {totalUnvestedShares > 0 && rsuPrice != null && (
                <span className="rt-table-pace">
                  {totalUnvestedShares.toLocaleString()} unvested · {fmtCur(unvestedValue)}
                </span>
              )}
            </div>
            <div className="rt-table-scroll">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th>Vest Date</th>
                    <th>Shares</th>
                    <th>Grant Price</th>
                    <th>Value at Vest</th>
                    <th>Current Value</th>
                    <th>Status</th>
                    <th className="rt-col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {rsu.grants.map(g => {
                    const curVal = rsuPrice != null ? g.shares * rsuPrice : null
                    const vestVal = g.vestPrice != null ? g.shares * g.vestPrice : null
                    const isConfirming = vestingRsuId === g.id
                    return (
                      <tr key={g.id} className={g.vested ? 'rt-row-vested' : ''}>
                        <td className="rt-date-cell">
                          {new Date(g.vestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="rt-amt">{g.shares.toLocaleString()}</td>
                        <td className="rt-amt">{g.grantPrice != null ? fmtCur(g.grantPrice) : '—'}</td>
                        <td className="rt-amt">{vestVal != null ? fmtCur(vestVal) : g.vestPrice != null ? fmtCur(g.vestPrice) : '—'}</td>
                        <td className="rt-amt rt-total-amt">{curVal != null ? fmtCur(curVal) : '—'}</td>
                        <td>
                          {g.vested
                            ? <span className="rt-rsu-vested-badge">Vested{g.vestPrice != null ? ` @ ${fmtCur(g.vestPrice)}` : ''}</span>
                            : isConfirming
                            ? (
                              <div className="rt-rsu-vest-confirm">
                                <input className="rt-edit-inp rt-edit-money" type="number" min="0" step="0.01"
                                  placeholder="vest price (opt)"
                                  value={vestPriceInput}
                                  onChange={e => setVestPriceInput(e.target.value)}
                                  autoFocus />
                                <button className="rt-action-save" onClick={() => confirmVest(g.id)} title="Confirm">✓</button>
                                <button className="rt-action-cancel" onClick={() => { setVestingRsuId(null); setVestPriceInput('') }} title="Cancel">✕</button>
                              </div>
                            )
                            : <span className="rt-rsu-upcoming-badge">
                                {new Date(g.vestDate + 'T12:00:00') <= new Date() ? 'Pending' : 'Upcoming'}
                              </span>}
                        </td>
                        <td className="rt-col-actions">
                          {g.vested
                            ? <button className="rt-action-cancel" onClick={() => unmarkVested(g.id)} title="Undo vest">↩</button>
                            : !isConfirming && (
                              <>
                                <button className="rt-action-save" onClick={() => { setVestingRsuId(g.id); setVestPriceInput('') }} title="Mark as vested">✓</button>
                                <button className="rt-action-del" onClick={() => removeGrant(g.id)} title="Delete">✕</button>
                              </>
                            )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="rt-tfoot-row">
                    <td>Total</td>
                    <td className="rt-amt">{rsu.grants.reduce((s, g) => s + g.shares, 0).toLocaleString()}</td>
                    <td></td><td></td>
                    <td className="rt-amt rt-total-amt">
                      {rsuPrice != null ? fmtCur(rsu.grants.reduce((s, g) => s + g.shares * rsuPrice, 0)) : '—'}
                    </td>
                    <td></td><td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="rt-empty">
            <div className="rt-empty-icon">🔒</div>
            <div className="rt-empty-title">No RSU grants added yet</div>
            <div className="rt-empty-sub">Use the quick-date buttons above to add each Dec 15 vesting tranche.</div>
          </div>
        )}
      </>}

      {/* ════ HYSA tab ══════════════════════════════════════════════════════════ */}
      {rtTab === 'hysa' && <>
        <SectionDivider icon="💵" title="High-Yield Savings" sub="Log contributions and withdrawals at any time" />

        {/* Settings row */}
        <div className="rt-form-wrap" style={{ marginBottom: 12 }}>
          <div className="rt-form-title" style={{ marginBottom: 14 }}>Account Settings</div>
          <div className="rt-hysa-settings">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Starting Balance</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="1"
                placeholder="0"
                value={hysa.startingBalance || ''}
                onChange={e => updateHysa({ startingBalance: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">APY Rate (%)</label>
              <input className="rt-form-inp" type="number" min="0" step="0.1"
                placeholder="4.5"
                value={hysa.rate}
                onChange={e => updateHysa({ rate: e.target.value })} />
            </div>
            <div className="rt-hysa-balance-display">
              <div className="rt-hysa-balance-label">Current Balance</div>
              <div className="rt-hysa-balance-val">{fmtCur(hysaBalance)}</div>
            </div>
          </div>
        </div>

        {/* Add transaction form */}
        <div className="rt-form-wrap">
          <div className="rt-form-title" style={{ marginBottom: 14 }}>Add Transaction</div>
          <div className="rt-hysa-form">
            <div className="rt-form-field">
              <label className="rt-form-lbl">Date</label>
              <input className="rt-form-inp" type="date"
                value={hysaForm.date}
                onChange={e => setHysaForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Type</label>
              <select className="rt-form-inp"
                value={hysaForm.type}
                onChange={e => setHysaForm(f => ({ ...f, type: e.target.value }))}>
                <option value="contribution">Contribution</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Amount</label>
              <input className="rt-form-inp rt-inp-money" type="number" min="0" step="1"
                placeholder="0"
                value={hysaForm.amount}
                onChange={e => setHysaForm(f => ({ ...f, amount: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addHysaTx()} />
            </div>
            <div className="rt-form-field">
              <label className="rt-form-lbl">Note (optional)</label>
              <input className="rt-form-inp" type="text"
                placeholder="e.g. emergency fund top-up"
                value={hysaForm.note}
                onChange={e => setHysaForm(f => ({ ...f, note: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addHysaTx()} />
            </div>
            <button className="rt-add-btn" onClick={addHysaTx}
              disabled={!hysaForm.date || !hysaForm.amount}>
              + Add
            </button>
          </div>
        </div>

        {/* Summary stats */}
        {hysa.transactions.length > 0 && (() => {
          const totalIn  = hysa.transactions.filter(t => t.type === 'contribution').reduce((s, t) => s + t.amount, 0)
          const totalOut = hysa.transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
          return (
            <div className="rt-hysa-stats">
              <div className="rt-hysa-stat">
                <span className="rt-hysa-stat-label">Total in</span>
                <span className="rt-hysa-stat-val credit-color">+{fmtCur(totalIn)}</span>
              </div>
              <div className="rt-hysa-stat">
                <span className="rt-hysa-stat-label">Total out</span>
                <span className="rt-hysa-stat-val debit-color">−{fmtCur(totalOut)}</span>
              </div>
              <div className="rt-hysa-stat">
                <span className="rt-hysa-stat-label">Net</span>
                <span className={`rt-hysa-stat-val ${hysaTxTotal >= 0 ? 'credit-color' : 'debit-color'}`}>
                  {hysaTxTotal >= 0 ? '+' : '−'}{fmtCur(Math.abs(hysaTxTotal))}
                </span>
              </div>
              <div className="rt-hysa-stat">
                <span className="rt-hysa-stat-label">Transactions</span>
                <span className="rt-hysa-stat-val">{hysa.transactions.length}</span>
              </div>
            </div>
          )
        })()}

        {/* Transactions table */}
        {hysa.transactions.length > 0 ? (
          <div className="rt-table-wrap">
            <div className="rt-table-header-row">
              <span className="rt-table-title">Transaction History</span>
            </div>
            <div className="rt-table-scroll">
              <table className="rt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="rt-amt">Amount</th>
                    <th>Note</th>
                    <th className="rt-amt">Balance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let running = hysa.startingBalance
                    return hysa.transactions.map(t => {
                      running += t.type === 'contribution' ? t.amount : -t.amount
                      return (
                        <tr key={t.id}>
                          <td>{fmtDate(t.date)}</td>
                          <td>
                            <span className={t.type === 'contribution' ? 'rt-rsu-upcoming-badge' : 'rt-hysa-withdrawal-badge'}>
                              {t.type === 'contribution' ? '↑ deposit' : '↓ withdraw'}
                            </span>
                          </td>
                          <td className={`rt-amt ${t.type === 'contribution' ? 'credit-color' : 'debit-color'}`}>
                            {t.type === 'contribution' ? '+' : '−'}{fmtCur(t.amount)}
                          </td>
                          <td className="rt-brk-name">{t.note || '—'}</td>
                          <td className="rt-amt rt-total-amt">{fmtCur(running)}</td>
                          <td>
                            <button className="rt-del-btn" onClick={() => removeHysaTx(t.id)}>✕</button>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
                <tfoot>
                  <tr className="rt-tfoot-row">
                    <td colSpan={4}>Balance</td>
                    <td className="rt-amt rt-total-amt">{fmtCur(hysaBalance)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="rt-empty">
            <div className="rt-empty-icon">💵</div>
            <div className="rt-empty-title">No transactions yet</div>
            <div className="rt-empty-sub">Set a starting balance above and log deposits or withdrawals whenever you move money.</div>
          </div>
        )}
      </>}
    </div>
  )
}
