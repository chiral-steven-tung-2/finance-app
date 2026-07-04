import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const STORAGE_KEY = 'finance-aggregates-v1'

const PRESETS = [
  { id: 'chipotle',   keyword: 'chipotle',    label: 'Chipotle'    },
  { id: 'starbucks',  keyword: 'starbucks',   label: 'Starbucks'   },
  { id: 'amazon',     keyword: 'amazon',      label: 'Amazon'      },
  { id: 'walmart',    keyword: 'walmart',     label: 'Walmart'     },
  { id: 'target',     keyword: 'target',      label: 'Target'      },
  { id: 'mcdonald',   keyword: 'mcdonald',    label: "McDonald's"  },
  { id: 'uber',       keyword: 'uber',        label: 'Uber'        },
  { id: 'lyft',       keyword: 'lyft',        label: 'Lyft'        },
  { id: 'netflix',    keyword: 'netflix',     label: 'Netflix'     },
  { id: 'spotify',    keyword: 'spotify',     label: 'Spotify'     },
  { id: 'hulu',       keyword: 'hulu',        label: 'Hulu'        },
  { id: 'doordash',   keyword: 'doordash',    label: 'DoorDash'    },
  { id: 'grubhub',    keyword: 'grubhub',     label: 'Grubhub'     },
  { id: 'instacart',  keyword: 'instacart',   label: 'Instacart'   },
  { id: 'costco',     keyword: 'costco',      label: 'Costco'      },
  { id: 'wholefoods', keyword: 'whole food',  label: 'Whole Foods' },
  { id: 'kroger',     keyword: 'kroger',      label: 'Kroger'      },
  { id: 'cvs',        keyword: 'cvs',         label: 'CVS'         },
  { id: 'walgreens',  keyword: 'walgreens',   label: 'Walgreens'   },
  { id: 'apple',      keyword: 'apple.com',   label: 'Apple'       },
  { id: 'google',     keyword: 'google',      label: 'Google'      },
  { id: 'microsoft',  keyword: 'microsoft',   label: 'Microsoft'   },
  { id: 'discord',    keyword: 'discord',     label: 'Discord'     },
  { id: 'tiktok',     keyword: 'tiktok',      label: 'TikTok'      },
]

function loadJSON(key, fb) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fb } catch { return fb }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)) }
function newId() { return Math.random().toString(36).slice(2, 9) }

function monthKey(dateStr) {
  const [m, , y] = dateStr.split('/')
  return `${y}-${m.padStart(2, '0')}`
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

function fmt(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(v))
}

const AX   = { fontSize: 11, fill: '#9ca3af' }
const GRID = 'rgba(128,128,128,0.09)'

export function Merchants({ allActiveTxs }) {
  const [aggregates, setAggregates] = useState(
    () => loadJSON(STORAGE_KEY, [])
  )
  const [expandedId,  setExpandedId]  = useState(null)
  const [editingId,   setEditingId]   = useState(null)
  const [editLabel,   setEditLabel]   = useState('')
  const [editKeyword, setEditKeyword] = useState('')
  const [showAdd,     setShowAdd]     = useState(false)
  const [newKeyword,  setNewKeyword]  = useState('')
  const [newLabel,    setNewLabel]    = useState('')
  const [sortField,   setSortField]   = useState('totalOut')
  const [sortDir,     setSortDir]     = useState('desc')

  // Aggregate matching transactions per keyword (both income and expense)
  const computed = useMemo(() => {
    return aggregates.map(a => {
      const kw = a.keyword.toLowerCase()
      const matching = allActiveTxs.filter(t =>
        t.description.toLowerCase().includes(kw)
      )
      const totalOut = matching.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const totalIn  = matching.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const total    = totalOut  // kept for sort compat; use totalOut as primary
      // byMonth: net outflow per month (positive = spent more, negative = received more)
      const byMonth = new Map()
      for (const t of matching) {
        const mk = monthKey(t.date)
        byMonth.set(mk, (byMonth.get(mk) || 0) + (t.amount < 0 ? Math.abs(t.amount) : -t.amount))
      }
      const months = byMonth.size
      const net    = totalOut - totalIn
      const avg    = months > 0 ? net / months : 0
      const count  = matching.length
      return { ...a, matching, totalOut, totalIn, total, net, byMonth, months, avg, count }
    })
  }, [aggregates, allActiveTxs])

  const sorted = useMemo(() => {
    return [...computed].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [computed, sortField, sortDir])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function save(next) { setAggregates(next); saveJSON(STORAGE_KEY, next) }

  function addCustom() {
    const kw = newKeyword.trim().toLowerCase()
    if (!kw) return
    if (aggregates.some(a => a.keyword.toLowerCase() === kw)) {
      setNewKeyword(''); setNewLabel(''); return
    }
    save([...aggregates, { id: newId(), keyword: kw, label: newLabel.trim() || newKeyword.trim(), preset: false }])
    setNewKeyword(''); setNewLabel('')
  }

  function addPreset(p) {
    if (aggregates.some(a => a.id === p.id)) return
    save([...aggregates, { ...p }])
  }

  function remove(id) {
    save(aggregates.filter(a => a.id !== id))
    if (expandedId === id) setExpandedId(null)
    if (editingId  === id) setEditingId(null)
  }

  function startEdit(item, e) {
    e.stopPropagation()
    setEditingId(item.id)
    setEditLabel(item.label)
    setEditKeyword(item.keyword)
    setExpandedId(null)
  }

  function saveEdit() {
    const kw = editKeyword.trim().toLowerCase()
    if (!kw) { setEditingId(null); return }
    save(aggregates.map(a =>
      a.id === editingId
        ? { ...a, label: editLabel.trim() || editKeyword.trim(), keyword: kw }
        : a
    ))
    setEditingId(null)
  }

  function cancelEdit() { setEditingId(null) }

  const addedIds = new Set(aggregates.map(a => a.id))
  const availablePresets = PRESETS.filter(p => !addedIds.has(p.id))

  const SortIcon = ({ field }) =>
    sortField === field
      ? <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>
      : <span className="sort-icon inactive">↕</span>

  return (
    <div className="merchants-page">

      {/* ── Header ─────────────────────────────────── */}
      <div className="merch-header">
        <div className="merch-header-text">
          <div className="merch-title">Merchant Aggregator</div>
          <div className="merch-sub">Track spending across all locations by keyword — "chipotle" catches every Chipotle store.</div>
        </div>
        <button className={`merch-add-toggle${showAdd ? ' active' : ''}`} onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Close' : '+ Add Keywords'}
        </button>
      </div>

      {/* ── Add panel ──────────────────────────────── */}
      {showAdd && (
        <div className="merch-add-panel">
          <div className="merch-add-section">
            <div className="merch-add-label">Custom keyword</div>
            <div className="merch-add-row">
              <input
                className="merch-input"
                placeholder="Keyword (e.g. chipotle)"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
              />
              <input
                className="merch-input"
                placeholder="Display name (e.g. Chipotle)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
              />
              <button
                className="merch-add-btn"
                onClick={addCustom}
                disabled={!newKeyword.trim()}
              >
                Track
              </button>
            </div>
            <div className="merch-add-hint">
              Any transaction description containing the keyword will be matched — case-insensitive.
            </div>
          </div>

          {availablePresets.length > 0 && (
            <div className="merch-add-section">
              <div className="merch-add-label">Quick-add presets</div>
              <div className="merch-preset-chips">
                {availablePresets.map(p => (
                  <button key={p.id} className="merch-preset-chip" onClick={() => addPreset(p)}>
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ────────────────────────────── */}
      {sorted.length === 0 && (
        <div className="merch-empty">
          <div className="merch-empty-icon">⊕</div>
          <div className="merch-empty-title">No merchants tracked yet</div>
          <div className="merch-empty-sub">Click <strong>+ Add Keywords</strong> to start tracking spending across store locations.</div>
        </div>
      )}

      {/* ── Table ──────────────────────────────────── */}
      {sorted.length > 0 && (
        <div className="merch-table">
          <div className="merch-thead">
            <span className="merch-th-merchant">Merchant</span>
            <span className="merch-th-r sortable" onClick={() => toggleSort('avg')}>Avg/mo <SortIcon field="avg" /></span>
            <span className="merch-th-r sortable" onClick={() => toggleSort('totalOut')}>Spent ↓ <SortIcon field="totalOut" /></span>
            <span className="merch-th-r sortable" onClick={() => toggleSort('totalIn')}>Received ↑ <SortIcon field="totalIn" /></span>
            <span className="merch-th-r sortable" onClick={() => toggleSort('count')}>Txns <SortIcon field="count" /></span>
            <span className="merch-th-r sortable" onClick={() => toggleSort('months')}>Months <SortIcon field="months" /></span>
            <span />
          </div>

          {sorted.map(item => {
            const isOpen = expandedId === item.id

            const chartData = [...item.byMonth.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mk, amt]) => ({ month: monthLabel(mk), amount: amt }))

            const isEditing = editingId === item.id
            return (
              <div key={item.id} className={`merch-row-wrap${isOpen ? ' open' : ''}${isEditing ? ' editing' : ''}`}>
                {/* Summary row */}
                <div
                  className="merch-row"
                  onClick={() => !isEditing && setExpandedId(isOpen ? null : item.id)}
                  title={isEditing ? '' : item.count === 0 ? 'No matching transactions found' : 'Click to expand'}
                >
                  <div className="merch-row-name">
                    <span className="merch-row-label">{item.label}</span>
                    <span className="merch-kw-pill">"{item.keyword}"</span>
                    {item.count === 0 && <span className="merch-no-match">no matches</span>}
                  </div>
                  <span className={`merch-row-val ${item.avg < 0 ? 'merch-credit' : ''}`}>
                    {item.avg !== 0
                      ? (item.avg < 0 ? '+' : '') + fmt(Math.abs(item.avg))
                      : <span className="muted">—</span>}
                  </span>
                  <span className="merch-row-val merch-debit merch-row-total">{item.totalOut > 0 ? fmt(item.totalOut) : <span className="muted">—</span>}</span>
                  <span className="merch-row-val merch-credit">{item.totalIn  > 0 ? fmt(item.totalIn)  : <span className="muted">—</span>}</span>
                  <span className="merch-row-val">{item.count > 0 ? item.count : <span className="muted">—</span>}</span>
                  <span className="merch-row-val">{item.months > 0 ? item.months : <span className="muted">—</span>}</span>
                  <div className="merch-row-actions" onClick={e => e.stopPropagation()}>
                    <button className="merch-row-edit" onClick={e => startEdit(item, e)} title="Edit name and keyword">✎</button>
                    <button className="merch-row-delete" onClick={() => remove(item.id)} title="Stop tracking">×</button>
                  </div>
                </div>

                {/* Edit panel */}
                {isEditing && (
                  <div className="merch-edit-panel" onClick={e => e.stopPropagation()}>
                    <div className="merch-edit-fields">
                      <div className="merch-edit-field">
                        <label className="merch-edit-lbl">Display Name</label>
                        <input
                          className="merch-edit-inp"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                          autoFocus
                        />
                      </div>
                      <div className="merch-edit-field">
                        <label className="merch-edit-lbl">Keyword</label>
                        <input
                          className="merch-edit-inp merch-edit-kw"
                          value={editKeyword}
                          onChange={e => setEditKeyword(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                          placeholder="e.g. chipotle"
                        />
                      </div>
                    </div>
                    <div className="merch-edit-hint">Case-insensitive match against transaction descriptions</div>
                    <div className="merch-edit-actions">
                      <button className="merch-edit-cancel" onClick={cancelEdit}>Cancel</button>
                      <button className="merch-edit-save" onClick={saveEdit} disabled={!editKeyword.trim()}>Save</button>
                    </div>
                  </div>
                )}

                {/* Expanded detail */}
                {isOpen && item.count > 0 && (
                  <div className="merch-expanded">
                    <div className="merch-expanded-inner">
                      {/* Monthly bar chart */}
                      {chartData.length > 1 && (
                        <div className="merch-chart-wrap">
                          <div className="merch-chart-title">Monthly Net Flow</div>
                          <ResponsiveContainer width="100%" height={150}>
                            <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                              <XAxis dataKey="month" tick={AX} />
                              <YAxis tick={AX} tickFormatter={v => `$${Math.abs(v)}`} width={46} />
                              <Tooltip
                                formatter={v => [v < 0 ? `+${fmt(Math.abs(v))}` : fmt(v), v < 0 ? 'Received' : 'Spent']}
                                contentStyle={{
                                  background: 'var(--bg)', border: '1px solid var(--border)',
                                  borderRadius: 8, fontSize: 12,
                                }}
                              />
                              <ReferenceLine y={0} stroke="rgba(128,128,128,0.3)" />
                              <Bar dataKey="amount" fill="#818cf8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Transaction list */}
                      <div className="merch-tx-panel">
                        <div className="merch-chart-title">
                          Matching Transactions
                          {item.count > 40 && <span className="merch-tx-cap"> (showing 40 most recent)</span>}
                        </div>
                        <div className="merch-tx-list">
                          {[...item.matching]
                            .sort((a, b) => {
                              const [am, ad, ay] = a.date.split('/')
                              const [bm, bd, by] = b.date.split('/')
                              return new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)
                            })
                            .slice(0, 40)
                            .map(t => (
                              <div key={t.id} className="merch-tx-row">
                                <span className="merch-tx-date">{t.date}</span>
                                <span className="merch-tx-desc">{t.description}</span>
                                <span className={`merch-tx-amt ${t.amount >= 0 ? 'merch-credit' : 'merch-debit'}`}>
                                  {t.amount >= 0 ? '+' : '-'}{fmt(t.amount)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isOpen && item.count === 0 && (
                  <div className="merch-expanded">
                    <div className="merch-no-match-msg">
                      No transactions matched the keyword <strong>"{item.keyword}"</strong>.
                      Try a broader or different keyword.
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
