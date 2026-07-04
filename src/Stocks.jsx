import { useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// ── Scoring helpers ────────────────────────────────────────────────────────────

function score(value, thresholds) {
  // thresholds: [{max, score}] sorted ascending by max (last entry has no max)
  if (value == null || isNaN(value)) return null
  for (const t of thresholds) {
    if (t.max == null || value <= t.max) return t.score
  }
  return thresholds.at(-1).score
}

function pctScore(value, thresholds) {
  return score(value != null ? value * 100 : null, thresholds)
}

function computeRecommendation(metrics) {
  const scores = []

  // Valuation
  if (metrics.trailingPE > 0) scores.push(score(metrics.trailingPE, [
    { max: 12, score: 9 }, { max: 18, score: 7 }, { max: 25, score: 5 },
    { max: 35, score: 3 }, { max: null, score: 1 },
  ]))
  if (metrics.forwardPE > 0) scores.push(score(metrics.forwardPE, [
    { max: 12, score: 9 }, { max: 18, score: 7 }, { max: 25, score: 5 },
    { max: 35, score: 3 }, { max: null, score: 1 },
  ]))
  if (metrics.priceToBook != null) scores.push(score(metrics.priceToBook, [
    { max: 1, score: 9 }, { max: 2, score: 7 }, { max: 4, score: 5 },
    { max: 7, score: 3 }, { max: null, score: 1 },
  ]))
  if (metrics.pegRatio != null && metrics.pegRatio > 0) scores.push(score(metrics.pegRatio, [
    { max: 0.8, score: 9 }, { max: 1.2, score: 7 }, { max: 2, score: 5 },
    { max: 3, score: 3 }, { max: null, score: 1 },
  ]))
  if (metrics.priceToSales != null) scores.push(score(metrics.priceToSales, [
    { max: 1, score: 9 }, { max: 3, score: 7 }, { max: 6, score: 5 },
    { max: 10, score: 3 }, { max: null, score: 1 },
  ]))

  // Growth
  if (metrics.revenueGrowth != null) scores.push(pctScore(metrics.revenueGrowth, [
    { max: -5, score: 1 }, { max: 0, score: 3 }, { max: 8, score: 5 },
    { max: 20, score: 7 }, { max: null, score: 9 },
  ]))
  if (metrics.earningsGrowth != null) scores.push(pctScore(metrics.earningsGrowth, [
    { max: -10, score: 1 }, { max: 0, score: 3 }, { max: 10, score: 5 },
    { max: 25, score: 7 }, { max: null, score: 9 },
  ]))

  // Profitability
  if (metrics.profitMargin != null) scores.push(pctScore(metrics.profitMargin, [
    { max: 0, score: 1 }, { max: 5, score: 3 }, { max: 12, score: 5 },
    { max: 20, score: 7 }, { max: null, score: 9 },
  ]))
  if (metrics.grossMargin != null) scores.push(pctScore(metrics.grossMargin, [
    { max: 15, score: 2 }, { max: 30, score: 4 }, { max: 45, score: 6 },
    { max: 60, score: 8 }, { max: null, score: 9 },
  ]))
  if (metrics.returnOnEquity != null) scores.push(pctScore(metrics.returnOnEquity, [
    { max: 0, score: 1 }, { max: 8, score: 3 }, { max: 15, score: 5 },
    { max: 25, score: 7 }, { max: null, score: 9 },
  ]))

  // Financial health
  if (metrics.debtToEquity != null) scores.push(score(metrics.debtToEquity, [
    { max: 30, score: 9 }, { max: 80, score: 7 }, { max: 150, score: 5 },
    { max: 300, score: 3 }, { max: null, score: 1 },
  ]))
  if (metrics.currentRatio != null) scores.push(score(metrics.currentRatio, [
    { max: 0.8, score: 2 }, { max: 1, score: 4 }, { max: 1.5, score: 6 },
    { max: 2.5, score: 8 }, { max: null, score: 9 },
  ]))
  if (metrics.freeCashflow != null) scores.push(metrics.freeCashflow > 0 ? 8 : 3)

  if (!scores.length) return null
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  if (avg >= 7.5) return { label: 'Strong Buy',  cls: 'rec-strong-buy',  pct: avg }
  if (avg >= 6)   return { label: 'Buy',          cls: 'rec-buy',         pct: avg }
  if (avg >= 4.5) return { label: 'Hold',         cls: 'rec-hold',        pct: avg }
  if (avg >= 3)   return { label: 'Sell',         cls: 'rec-sell',        pct: avg }
  return                  { label: 'Strong Sell', cls: 'rec-strong-sell', pct: avg }
}

// ── Color-band helper ──────────────────────────────────────────────────────────

function metricColor(value, bands) {
  // bands: [{max, cls}] sorted ascending; last entry catches the rest
  if (value == null || isNaN(value)) return 'metric-na'
  for (const b of bands) {
    if (b.max == null || value <= b.max) return b.cls
  }
  return bands.at(-1).cls
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(decimals)
}
function fmtPct(n, decimals = 1) {
  if (n == null || isNaN(n)) return '—'
  return (n * 100).toFixed(decimals) + '%'
}
function fmtLargePct(n, decimals = 1) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(decimals) + '%'
}
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (Math.abs(n) >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B'
  if (Math.abs(n) >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M'
  return '$' + n.toLocaleString()
}
function fmtPrice(n, currency = 'USD') {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

// ── MetricCard ─────────────────────────────────────────────────────────────────

function MetricCard({ label, value, colorCls, subtext, bar, barPct, tooltip }) {
  return (
    <div className={`sk-metric-card ${colorCls ?? 'metric-na'}`} title={tooltip ?? ''}>
      <div className="sk-metric-label">{label}</div>
      <div className="sk-metric-value">{value}</div>
      {subtext && <div className="sk-metric-sub">{subtext}</div>}
      {bar && (
        <div className="sk-metric-bar-track">
          <div className="sk-metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, barPct ?? 0))}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Price chart ────────────────────────────────────────────────────────────────

function PriceChart({ prices, ticker }) {
  const [range, setRange] = useState('5y')
  const now = new Date()
  const cutoff = {
    '1y': new Date(now.getFullYear() - 1, now.getMonth()),
    '3y': new Date(now.getFullYear() - 3, now.getMonth()),
    '5y': new Date(now.getFullYear() - 5, now.getMonth()),
    '10y': new Date(now.getFullYear() - 10, now.getMonth()),
    'all': new Date(0),
  }[range]

  const data = prices.filter(p => new Date(p.date + '-01') >= cutoff)
  if (!data.length) return null

  const minP = Math.min(...data.map(d => d.price))
  const maxP = Math.max(...data.map(d => d.price))
  const startP = data[0].price
  const endP = data.at(-1).price
  const gain = ((endP - startP) / startP) * 100
  const positive = endP >= startP

  return (
    <div className="sk-chart-wrap">
      <div className="sk-chart-header">
        <span className="sk-chart-title">{ticker} Price History</span>
        <span className={`sk-chart-gain ${positive ? 'up' : 'down'}`}>
          {positive ? '+' : ''}{gain.toFixed(1)}% over {range}
        </span>
        <div className="sk-range-tabs">
          {['1y','3y','5y','10y','all'].map(r => (
            <button key={r} className={`sk-range-tab${range === r ? ' active' : ''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={d => d.slice(0, 7)} interval="preserveStartEnd" />
          <YAxis domain={[minP * 0.97, maxP * 1.03]} tick={{ fontSize: 11 }} tickLine={false}
            axisLine={false} tickFormatter={v => '$' + v.toFixed(0)} width={52} />
          <Tooltip
            formatter={(v) => ['$' + v.toFixed(2), 'Price']}
            labelFormatter={l => l}
            contentStyle={{ fontSize: 12 }}
          />
          <Line type="monotone" dataKey="price" dot={false} strokeWidth={2}
            stroke={positive ? '#22c55e' : '#f87171'} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main Stocks component ──────────────────────────────────────────────────────

const POPULAR = ['AAPL','MSFT','NVDA','AMZN','GOOG','META','TSLA','JPM','BRK-B','VOO','QQQ','SPY']

export function Stocks() {
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [data,    setData]    = useState(null)

  const search = useCallback(async (ticker) => {
    const t = (ticker ?? query).trim().toUpperCase()
    if (!t) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const [quote, chart] = await Promise.all([
        fetch(`/api/stock-quote/${t}`).then(r => r.json()),
        fetch(`/api/stock/${t}`).then(r => r.json()),
      ])
      if (quote.error) throw new Error(quote.error)
      if (chart.error) throw new Error(chart.error)
      setData({ ...quote, prices: chart.prices ?? [], cagr1y: chart.cagr1y, cagr5y: chart.cagr5y, cagr10y: chart.cagr10y })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [query])

  const rec = data ? computeRecommendation(data) : null

  const pctFmt = fmtPct
  const d = data ?? {}

  // 52-week position (0–100%)
  const week52Pct = (d.week52High && d.week52Low && d.currentPrice)
    ? ((d.currentPrice - d.week52Low) / (d.week52High - d.week52Low)) * 100
    : null

  return (
    <div className="sk-root">
      {/* ── Search bar ── */}
      <div className="sk-search-row">
        <div className="sk-search-box">
          <input
            className="sk-search-input"
            value={query}
            onChange={e => setQuery(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Enter ticker symbol, e.g. AAPL"
            spellCheck={false}
          />
          <button className="sk-search-btn" onClick={() => search()} disabled={loading}>
            {loading ? '⏳' : '🔍'} Analyze
          </button>
        </div>
        <div className="sk-popular">
          {POPULAR.map(t => (
            <button key={t} className="sk-popular-btn" onClick={() => { setQuery(t); search(t) }}>{t}</button>
          ))}
        </div>
      </div>

      {error && <div className="sk-error">⚠ {error}</div>}

      {loading && <div className="sk-loading"><div className="sk-spinner" />Loading data for {query}…</div>}

      {data && (
        <>
          {/* ── Header ── */}
          <div className="sk-header">
            <div className="sk-header-left">
              <div className="sk-ticker-badge">{d.ticker}</div>
              <div className="sk-name-wrap">
                <div className="sk-company-name">{d.name}</div>
                {d.sector && <div className="sk-sector">{d.sector}</div>}
              </div>
            </div>
            <div className="sk-header-right">
              <div className="sk-price">{fmtPrice(d.currentPrice, d.currency)}</div>
              {d.changePct != null && (
                <div className={`sk-change ${d.changePct >= 0 ? 'up' : 'down'}`}>
                  {d.changePct >= 0 ? '▲' : '▼'} {Math.abs(d.changePct * 100).toFixed(2)}% today
                </div>
              )}
              <div className="sk-mktcap">{fmtMoney(d.marketCap)} mkt cap</div>
            </div>
            {rec && (
              <div className={`sk-rec-badge ${rec.cls}`}>
                <div className="sk-rec-label">{rec.label}</div>
                <div className="sk-rec-score">Score {rec.pct.toFixed(1)}/10</div>
              </div>
            )}
          </div>

          {/* ── Chart ── */}
          {d.prices?.length > 0 && <PriceChart prices={d.prices} ticker={d.ticker} />}

          {/* ── CAGR pills ── */}
          {(d.cagr1y || d.cagr5y || d.cagr10y) && (
            <div className="sk-cagr-row">
              {d.cagr1y  != null && <div className={`sk-cagr-pill ${d.cagr1y  >= 0 ? 'up' : 'down'}`}>1Y CAGR {d.cagr1y  >= 0 ? '+' : ''}{(d.cagr1y  * 100).toFixed(1)}%</div>}
              {d.cagr5y  != null && <div className={`sk-cagr-pill ${d.cagr5y  >= 0 ? 'up' : 'down'}`}>5Y CAGR {d.cagr5y  >= 0 ? '+' : ''}{(d.cagr5y  * 100).toFixed(1)}%</div>}
              {d.cagr10y != null && <div className={`sk-cagr-pill ${d.cagr10y >= 0 ? 'up' : 'down'}`}>10Y CAGR {d.cagr10y >= 0 ? '+' : ''}{(d.cagr10y * 100).toFixed(1)}%</div>}
            </div>
          )}

          {/* ── Valuation metrics ── */}
          <div className="sk-section-label">Valuation</div>
          <div className="sk-metrics-grid">
            <MetricCard label="P/E Ratio (TTM)" value={d.trailingPE > 0 ? fmtNum(d.trailingPE) : '—'}
              colorCls={d.trailingPE > 0 ? metricColor(d.trailingPE, [
                { max: 12, cls: 'metric-great' }, { max: 18, cls: 'metric-good' },
                { max: 25, cls: 'metric-ok' }, { max: 35, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ]) : 'metric-na'}
              subtext={d.trailingPE <= 0 ? 'Negative earnings' : d.trailingPE < 15 ? 'Undervalued' : d.trailingPE < 25 ? 'Fair value' : 'Premium'}
              tooltip="Lower is generally better. <15 cheap, 15–25 fair, >35 expensive"
            />
            <MetricCard label="Forward P/E" value={d.forwardPE > 0 ? fmtNum(d.forwardPE) : '—'}
              colorCls={d.forwardPE > 0 ? metricColor(d.forwardPE, [
                { max: 12, cls: 'metric-great' }, { max: 18, cls: 'metric-good' },
                { max: 25, cls: 'metric-ok' }, { max: 35, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ]) : 'metric-na'}
              subtext="Based on next year's earnings estimate"
              tooltip="Forward P/E uses analyst earnings estimates. Lower = better value expected"
            />
            <MetricCard label="PEG Ratio" value={d.pegRatio > 0 ? fmtNum(d.pegRatio) : '—'}
              colorCls={d.pegRatio > 0 ? metricColor(d.pegRatio, [
                { max: 0.8, cls: 'metric-great' }, { max: 1.2, cls: 'metric-good' },
                { max: 2, cls: 'metric-ok' }, { max: 3, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ]) : 'metric-na'}
              subtext={d.pegRatio > 0 ? (d.pegRatio < 1 ? 'Undervalued vs growth' : d.pegRatio < 2 ? 'Fairly priced' : 'Expensive vs growth') : null}
              tooltip="PEG = P/E ÷ earnings growth rate. <1 undervalued, >2 expensive relative to growth"
            />
            <MetricCard label="Price/Book" value={d.priceToBook != null ? fmtNum(d.priceToBook) : '—'}
              colorCls={metricColor(d.priceToBook, [
                { max: 1, cls: 'metric-great' }, { max: 2, cls: 'metric-good' },
                { max: 4, cls: 'metric-ok' }, { max: 7, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ])}
              subtext="Price vs book value per share"
              tooltip="P/B <1 means trading below book value (often cheap). High P/B may mean overvalued or asset-light business"
            />
            <MetricCard label="Price/Sales" value={d.priceToSales != null ? fmtNum(d.priceToSales) : '—'}
              colorCls={metricColor(d.priceToSales, [
                { max: 1, cls: 'metric-great' }, { max: 3, cls: 'metric-good' },
                { max: 6, cls: 'metric-ok' }, { max: 10, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ])}
              subtext="Market cap relative to revenue"
              tooltip="P/S <1 = trading below revenue. High P/S requires strong growth to justify"
            />
            <MetricCard label="EPS (TTM)" value={d.trailingEps != null ? fmtPrice(d.trailingEps, d.currency) : '—'}
              colorCls={d.trailingEps == null ? 'metric-na' : d.trailingEps >= 0 ? 'metric-good' : 'metric-bad'}
              subtext={d.forwardEps != null ? `Forward EPS: ${fmtPrice(d.forwardEps, d.currency)}` : null}
              tooltip="Earnings per share. Positive = profitable; negative = loss-making"
            />
          </div>

          {/* ── Growth metrics ── */}
          <div className="sk-section-label">Growth</div>
          <div className="sk-metrics-grid">
            <MetricCard label="Revenue Growth (YoY)" value={d.revenueGrowth != null ? fmtPct(d.revenueGrowth) : '—'}
              colorCls={metricColor(d.revenueGrowth != null ? d.revenueGrowth * 100 : null, [
                { max: -5, cls: 'metric-bad' }, { max: 0, cls: 'metric-warn' },
                { max: 10, cls: 'metric-ok' }, { max: 20, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext={d.revenueGrowthFwd != null ? `Fwd est: ${fmtPct(d.revenueGrowthFwd)}` : null}
              tooltip="Year-over-year revenue growth"
            />
            <MetricCard label="Earnings Growth (YoY)" value={d.earningsGrowth != null ? fmtPct(d.earningsGrowth) : '—'}
              colorCls={metricColor(d.earningsGrowth != null ? d.earningsGrowth * 100 : null, [
                { max: -10, cls: 'metric-bad' }, { max: 0, cls: 'metric-warn' },
                { max: 10, cls: 'metric-ok' }, { max: 25, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Year-over-year earnings growth"
              tooltip="EPS growth rate year over year"
            />
            <MetricCard label="1Y CAGR" value={d.cagr1y != null ? `${d.cagr1y >= 0 ? '+' : ''}${(d.cagr1y * 100).toFixed(1)}%` : '—'}
              colorCls={d.cagr1y == null ? 'metric-na' : d.cagr1y >= 0.15 ? 'metric-great' : d.cagr1y >= 0.05 ? 'metric-good' : d.cagr1y >= 0 ? 'metric-ok' : 'metric-bad'}
              subtext="Stock price 1-year return"
            />
            <MetricCard label="5Y CAGR" value={d.cagr5y != null ? `${d.cagr5y >= 0 ? '+' : ''}${(d.cagr5y * 100).toFixed(1)}%` : '—'}
              colorCls={d.cagr5y == null ? 'metric-na' : d.cagr5y >= 0.15 ? 'metric-great' : d.cagr5y >= 0.08 ? 'metric-good' : d.cagr5y >= 0 ? 'metric-ok' : 'metric-bad'}
              subtext="Annualized 5-year stock return"
            />
            <MetricCard label="10Y CAGR" value={d.cagr10y != null ? `${d.cagr10y >= 0 ? '+' : ''}${(d.cagr10y * 100).toFixed(1)}%` : '—'}
              colorCls={d.cagr10y == null ? 'metric-na' : d.cagr10y >= 0.12 ? 'metric-great' : d.cagr10y >= 0.07 ? 'metric-good' : d.cagr10y >= 0 ? 'metric-ok' : 'metric-bad'}
              subtext="Annualized 10-year stock return"
            />
          </div>

          {/* ── Profitability metrics ── */}
          <div className="sk-section-label">Profitability</div>
          <div className="sk-metrics-grid">
            <MetricCard label="Gross Margin" value={d.grossMargin != null ? fmtPct(d.grossMargin) : '—'}
              colorCls={metricColor(d.grossMargin != null ? d.grossMargin * 100 : null, [
                { max: 15, cls: 'metric-bad' }, { max: 30, cls: 'metric-warn' },
                { max: 45, cls: 'metric-ok' }, { max: 60, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Revenue minus cost of goods"
              bar barPct={d.grossMargin != null ? d.grossMargin * 100 : 0}
              tooltip="Higher gross margin means more revenue left for operating expenses and profit"
            />
            <MetricCard label="Operating Margin" value={d.operatingMargin != null ? fmtPct(d.operatingMargin) : '—'}
              colorCls={metricColor(d.operatingMargin != null ? d.operatingMargin * 100 : null, [
                { max: 0, cls: 'metric-bad' }, { max: 8, cls: 'metric-warn' },
                { max: 15, cls: 'metric-ok' }, { max: 25, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Earnings after operating costs"
              bar barPct={d.operatingMargin != null ? Math.max(0, d.operatingMargin * 100) : 0}
              tooltip="Operating profit as % of revenue. >15% is solid for most industries"
            />
            <MetricCard label="Net Profit Margin" value={d.profitMargin != null ? fmtPct(d.profitMargin) : '—'}
              colorCls={metricColor(d.profitMargin != null ? d.profitMargin * 100 : null, [
                { max: 0, cls: 'metric-bad' }, { max: 5, cls: 'metric-warn' },
                { max: 12, cls: 'metric-ok' }, { max: 20, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Bottom-line profitability"
              bar barPct={d.profitMargin != null ? Math.max(0, d.profitMargin * 100) : 0}
              tooltip="Net income as % of revenue. >15% is excellent"
            />
            <MetricCard label="Return on Equity" value={d.returnOnEquity != null ? fmtPct(d.returnOnEquity) : '—'}
              colorCls={metricColor(d.returnOnEquity != null ? d.returnOnEquity * 100 : null, [
                { max: 0, cls: 'metric-bad' }, { max: 8, cls: 'metric-warn' },
                { max: 15, cls: 'metric-ok' }, { max: 25, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Profit generated per dollar of equity"
              tooltip="ROE >15% indicates efficient use of shareholder capital. Warren Buffett looks for >20%"
            />
            <MetricCard label="Return on Assets" value={d.returnOnAssets != null ? fmtPct(d.returnOnAssets) : '—'}
              colorCls={metricColor(d.returnOnAssets != null ? d.returnOnAssets * 100 : null, [
                { max: 0, cls: 'metric-bad' }, { max: 3, cls: 'metric-warn' },
                { max: 7, cls: 'metric-ok' }, { max: 12, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Profit generated per dollar of assets"
              tooltip="ROA >7% is solid. Measures how efficiently assets are used"
            />
            <MetricCard label="Free Cash Flow" value={fmtMoney(d.freeCashflow)}
              colorCls={d.freeCashflow == null ? 'metric-na' : d.freeCashflow > 0 ? 'metric-good' : 'metric-bad'}
              subtext={d.freeCashflow > 0 ? 'Cash-generating' : d.freeCashflow < 0 ? 'Cash-burning' : null}
              tooltip="Cash left after capital expenditures. Positive FCF is essential for dividends, buybacks, and growth"
            />
          </div>

          {/* ── Financial health ── */}
          <div className="sk-section-label">Financial Health</div>
          <div className="sk-metrics-grid">
            <MetricCard label="Debt/Equity" value={d.debtToEquity != null ? fmtNum(d.debtToEquity / 100) : '—'}
              colorCls={metricColor(d.debtToEquity, [
                { max: 30, cls: 'metric-great' }, { max: 80, cls: 'metric-good' },
                { max: 150, cls: 'metric-ok' }, { max: 300, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ])}
              subtext={d.debtToEquity != null ? (d.debtToEquity < 50 ? 'Low leverage' : d.debtToEquity < 150 ? 'Moderate leverage' : 'High leverage') : null}
              tooltip="Total debt relative to equity. Lower is safer. >2x (200) is highly leveraged"
            />
            <MetricCard label="Current Ratio" value={d.currentRatio != null ? fmtNum(d.currentRatio) : '—'}
              colorCls={metricColor(d.currentRatio, [
                { max: 0.8, cls: 'metric-bad' }, { max: 1, cls: 'metric-warn' },
                { max: 1.5, cls: 'metric-ok' }, { max: 2.5, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext="Current assets vs current liabilities"
              tooltip="Current ratio >1.5 = can comfortably cover short-term obligations. <1 = potential liquidity risk"
            />
            <MetricCard label="Quick Ratio" value={d.quickRatio != null ? fmtNum(d.quickRatio) : '—'}
              colorCls={metricColor(d.quickRatio, [
                { max: 0.5, cls: 'metric-bad' }, { max: 1, cls: 'metric-warn' },
                { max: 1.5, cls: 'metric-ok' }, { max: null, cls: 'metric-good' },
              ])}
              subtext="Liquid assets vs current liabilities"
              tooltip="Like current ratio but excludes inventory. >1 is healthy"
            />
            <MetricCard label="Total Cash" value={fmtMoney(d.totalCash)}
              colorCls={d.totalCash == null ? 'metric-na' : d.totalCash > 0 ? 'metric-good' : 'metric-na'}
              subtext={d.totalDebt != null ? `Total debt: ${fmtMoney(d.totalDebt)}` : null}
              tooltip="Cash and equivalents on the balance sheet"
            />
          </div>

          {/* ── Dividend & risk ── */}
          <div className="sk-section-label">Dividend & Risk</div>
          <div className="sk-metrics-grid">
            <MetricCard label="Dividend Yield" value={d.dividendYield != null ? fmtPct(d.dividendYield) : 'None'}
              colorCls={d.dividendYield == null ? 'metric-na' : metricColor(d.dividendYield * 100, [
                { max: 0, cls: 'metric-na' }, { max: 1.5, cls: 'metric-ok' },
                { max: 3.5, cls: 'metric-good' }, { max: null, cls: 'metric-great' },
              ])}
              subtext={d.dividendYield != null ? (d.dividendYield >= 0.04 ? 'High income yield' : 'Income component') : 'No dividend'}
              tooltip="Annual dividend as % of current price. >4% is high-yield. Check payout ratio for sustainability"
            />
            <MetricCard label="Beta" value={d.beta != null ? fmtNum(d.beta) : '—'}
              colorCls={d.beta == null ? 'metric-na' : metricColor(Math.abs(d.beta), [
                { max: 0.5, cls: 'metric-great' }, { max: 1, cls: 'metric-good' },
                { max: 1.5, cls: 'metric-ok' }, { max: 2, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
              ])}
              subtext={d.beta != null ? (d.beta < 0.8 ? 'Low volatility' : d.beta < 1.2 ? 'Market-level risk' : d.beta < 1.8 ? 'High volatility' : 'Very volatile') : null}
              tooltip="Beta measures volatility vs the market. 1.0 = moves with market. >1.5 = very volatile"
            />
            {(d.week52Low != null && d.week52High != null) && (
              <div className="sk-metric-card metric-na sk-52w-card">
                <div className="sk-metric-label">52-Week Range</div>
                <div className="sk-52w-bar-wrap">
                  <span className="sk-52w-lo">{fmtPrice(d.week52Low, d.currency)}</span>
                  <div className="sk-52w-track">
                    {week52Pct != null && (
                      <div className="sk-52w-pin" style={{ left: `${week52Pct}%` }}>
                        <div className="sk-52w-pin-dot" />
                        <div className="sk-52w-pin-label">{fmtPrice(d.currentPrice, d.currency)}</div>
                      </div>
                    )}
                  </div>
                  <span className="sk-52w-hi">{fmtPrice(d.week52High, d.currency)}</span>
                </div>
                <div className="sk-52w-pct">
                  {week52Pct != null ? `${week52Pct.toFixed(0)}% of 52-week range` : ''}
                </div>
              </div>
            )}
            {d.shortRatio != null && (
              <MetricCard label="Short Ratio" value={fmtNum(d.shortRatio, 1) + ' days'}
                colorCls={metricColor(d.shortRatio, [
                  { max: 2, cls: 'metric-great' }, { max: 5, cls: 'metric-good' },
                  { max: 10, cls: 'metric-warn' }, { max: null, cls: 'metric-bad' },
                ])}
                subtext={d.sharesShortPctFloat != null ? `${fmtPct(d.sharesShortPctFloat)} of float shorted` : null}
                tooltip="Days to cover short positions. High short ratio can signal bearish sentiment or short-squeeze potential"
              />
            )}
          </div>

          {/* ── Recommendation explanation ── */}
          {rec && (
            <div className={`sk-rec-panel ${rec.cls}`}>
              <div className="sk-rec-panel-title">{rec.label}</div>
              <div className="sk-rec-panel-body">
                Composite score {rec.pct.toFixed(1)}/10 based on valuation, growth, profitability, and financial health metrics.
                {rec.pct >= 7.5 && ' Fundamentals look strong across most categories.'}
                {rec.pct >= 6 && rec.pct < 7.5 && ' Solid fundamentals with some areas to watch.'}
                {rec.pct >= 4.5 && rec.pct < 6 && ' Mixed signals — some positives, some concerns.'}
                {rec.pct < 4.5 && ' Significant concerns in one or more key areas. Consider carefully.'}
                {' '}This is not financial advice. Always do your own research.
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div className="sk-empty">
          <div className="sk-empty-icon">📊</div>
          <div className="sk-empty-title">Stock Analyzer</div>
          <div className="sk-empty-sub">Search a ticker above or click a popular stock to see detailed metrics, color-coded by quality, with a buy/hold/sell recommendation.</div>
        </div>
      )}
    </div>
  )
}
