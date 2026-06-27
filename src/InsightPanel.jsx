const STYLES = {
  good: { icon: '↑', color: '#4ade80', bg: 'rgba(74,222,128,0.07)',  border: 'rgba(74,222,128,0.18)' },
  warn: { icon: '!', color: '#fbbf24', bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.18)' },
  info: { icon: 'i', color: '#38bdf8', bg: 'rgba(56,189,248,0.07)',  border: 'rgba(56,189,248,0.18)' },
  bad:  { icon: '↓', color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.18)' },
}

export function InsightPanel({ insights }) {
  if (!insights || insights.length === 0) return null
  return (
    <div className="insight-panel">
      <div className="insight-panel-hdr">
        <span className="insight-badge">✦ AI</span>
        <span className="insight-panel-label">Smart Analysis</span>
      </div>
      <div className="insight-cards">
        {insights.map((ins, i) => {
          const s = STYLES[ins.type] ?? STYLES.info
          return (
            <div key={i} className="insight-card"
              style={{ '--ic-color': s.color, '--ic-bg': s.bg, '--ic-border': s.border }}>
              <span className="insight-icon">{s.icon}</span>
              <div className="insight-body">
                <div className="insight-text">{ins.text}</div>
                {ins.detail && <div className="insight-detail">{ins.detail}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
