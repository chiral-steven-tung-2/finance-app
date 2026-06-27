import { useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const NO_CATEGORY = '(Uncategorized)'

const CAT_COLORS = [
  '#818cf8', '#fb923c', '#34d399', '#f472b6',
  '#38bdf8', '#fbbf24', '#a78bfa', '#4ade80',
  '#f87171', '#2dd4bf', '#e879f9', '#fdba74',
]

function dollarFmt(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(v))
}

const TOOLTIP = {
  contentStyle: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    fontSize: '13px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '10px 14px',
  },
  itemStyle: { color: 'var(--text-h)', padding: 0 },
  labelStyle: { color: 'var(--text)', fontWeight: 600, marginBottom: 4 },
}

const AXIS_TICK = { fontSize: 11, fill: '#9ca3af' }
const GRID = 'rgba(128,128,128,0.1)'

export function CategoryDonut({ activeTxs }) {
  const data = useMemo(() => {
    const map = new Map()
    for (const t of activeTxs) {
      if (t.amount >= 0) continue
      const cat = t.category || NO_CATEGORY
      map.set(cat, (map.get(cat) || 0) + Math.abs(t.amount))
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
      .sort((a, b) => b.value - a.value)
  }, [activeTxs])

  const total = data.reduce((s, d) => s + d.value, 0)

  if (!data.length) return <div className="chart-empty">No spending data</div>

  return (
    <div className="chart-card">
      <div className="chart-card-title">Spending by Category</div>
      <div className="donut-layout">
        <div className="donut-pie">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [dollarFmt(v), '']}
                {...TOOLTIP}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="donut-legend">
          {data.map((d, i) => (
            <div key={d.name} className="donut-row">
              <span className="donut-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
              <span className="donut-name" title={d.name}>{d.name}</span>
              <span className="donut-pct">{((d.value / total) * 100).toFixed(0)}%</span>
              <span className="donut-val">{dollarFmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DailyChart({ activeTxs }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const data = useMemo(() => {
    const map = new Map()
    for (const t of activeTxs) {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, spending: 0, earnings: 0 })
      const d = map.get(t.date)
      if (t.amount < 0) d.spending = +(d.spending + Math.abs(t.amount)).toFixed(2)
      else d.earnings = +(d.earnings + t.amount).toFixed(2)
    }
    return [...map.values()]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(d => ({ ...d, label: d.date.slice(0, 5) }))
  }, [activeTxs])

  const dayTxs = useMemo(() =>
    selectedDate ? activeTxs.filter(t => t.date === selectedDate) : [],
    [activeTxs, selectedDate]
  )

  if (!data.length) return <div className="chart-empty">No data</div>

  const barSize = Math.max(4, Math.min(16, Math.floor(300 / (data.length || 1)) - 6))
  const hasSelection = selectedDate !== null

  function handleBarClick(chartData) {
    if (!chartData?.activePayload?.length) return
    const date = chartData.activePayload[0].payload.date
    setSelectedDate(prev => prev === date ? null : date)
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">
        Daily Activity
        <span className="chart-card-hint">click a bar to see transactions</span>
      </div>
      <ResponsiveContainer width="100%" height={216}>
        <BarChart
          data={data}
          barSize={barSize}
          barGap={2}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          onClick={handleBarClick}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `$${v}`}
            width={56}
          />
          <Tooltip
            formatter={(v, key) => [dollarFmt(v), key === 'spending' ? 'Spending' : 'Earnings']}
            cursor={{ fill: 'rgba(128,128,128,0.06)' }}
            {...TOOLTIP}
          />
          <Bar dataKey="spending" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill="#f87171"
                fillOpacity={hasSelection && d.date !== selectedDate ? 0.25 : 1}
              />
            ))}
          </Bar>
          <Bar dataKey="earnings" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill="#4ade80"
                fillOpacity={hasSelection && d.date !== selectedDate ? 0.25 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="legend-swatch" style={{ background: '#4ade80' }} />Earnings</span>
        <span><i className="legend-swatch" style={{ background: '#f87171' }} />Spending</span>
      </div>

      {/* Day transaction drawer */}
      {selectedDate && (
        <div className="daily-tx-panel">
          <div className="daily-tx-header">
            <span className="daily-tx-date">{selectedDate}</span>
            <span className="daily-tx-summary">
              {dayTxs.filter(t => t.amount < 0).length > 0 && (
                <span className="debit-color">
                  −{dollarFmt(dayTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0))}
                </span>
              )}
              {dayTxs.filter(t => t.amount >= 0).length > 0 && (
                <span className="credit-color">
                  &nbsp;+{dollarFmt(dayTxs.filter(t => t.amount >= 0).reduce((s, t) => s + t.amount, 0))}
                </span>
              )}
            </span>
            <button className="daily-tx-close" onClick={() => setSelectedDate(null)} title="Close">✕</button>
          </div>
          <div className="daily-tx-list">
            {dayTxs.map(tx => (
              <div key={tx.id} className="daily-tx-row">
                <div className="daily-tx-info">
                  <span className="daily-tx-desc">{tx.description}</span>
                  {tx.category && <span className="daily-tx-cat">{tx.category}</span>}
                </div>
                <span className={`daily-tx-amt ${tx.amount >= 0 ? 'credit-color' : 'debit-color'}`}>
                  {tx.amount >= 0 ? '+' : '−'}{dollarFmt(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TopMerchants({ activeTxs }) {
  const data = useMemo(() => {
    const map = new Map()
    for (const t of activeTxs) {
      if (t.amount >= 0) continue
      if (!map.has(t.description)) map.set(t.description, { name: t.description, total: 0, count: 0 })
      const m = map.get(t.description)
      m.total += Math.abs(t.amount)
      m.count++
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map(m => ({ ...m, total: +m.total.toFixed(2) }))
  }, [activeTxs])

  if (!data.length) return null

  const max = data[0].total

  return (
    <div className="chart-card merchants-card">
      <div className="chart-card-title">Top Merchants by Spending</div>
      <div className="merchants-list">
        {data.map((m, i) => (
          <div key={m.name} className="merchant-row">
            <span className="merchant-rank">{i + 1}</span>
            <span className="merchant-name" title={m.name}>{m.name}</span>
            <div className="merchant-track">
              <div className="merchant-fill" style={{ width: `${(m.total / max) * 100}%` }} />
            </div>
            <span className="merchant-count">{m.count}×</span>
            <span className="merchant-total">{dollarFmt(m.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
