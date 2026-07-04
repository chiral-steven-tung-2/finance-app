import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function parseLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseLine(lines[0])
  return lines.slice(1).map((line, i) => {
    if (!line.trim()) return null
    const values = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    return row
  }).filter(Boolean)
}

function detectFormat(headers) {
  if (headers.includes('Details') && headers.includes('Posting Date')) return 'chase-checking'
  if (headers.includes('Transaction Date') && headers.includes('Category')) return 'chase-credit'
  return 'unknown'
}

function normalizeRow(row, format, account, fileKey, index) {
  const id = `${fileKey}::${index}`
  if (format === 'chase-checking') {
    const amount = parseFloat(row['Amount']) || 0
    return { id, account, date: row['Posting Date'], description: row['Description'], amount, category: null, type: row['Type'] }
  }
  if (format === 'chase-credit') {
    const amount = parseFloat(row['Amount']) || 0
    return { id, account, date: row['Transaction Date'], description: row['Description'], amount, category: row['Category'] || null, type: row['Type'] }
  }
  return null
}

function financeAPIPlugin() {
  return {
    name: 'finance-api',
    configureServer(server) {
      server.middlewares.use('/api/transactions', (req, res) => {
        try {
          const statementsDir = path.resolve(process.cwd(), 'statements')
          const transactions = []

          for (const accountDir of fs.readdirSync(statementsDir)) {
            const accountPath = path.join(statementsDir, accountDir)
            if (!fs.statSync(accountPath).isDirectory()) continue

            const account = accountDir
              .replace(/-/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase())

            for (const file of fs.readdirSync(accountPath)) {
              if (!file.toLowerCase().endsWith('.csv')) continue
              const filePath = path.join(accountPath, file)
              const content = fs.readFileSync(filePath, 'utf-8')
              const rows = parseCSV(content)
              if (!rows.length) continue

              const headers = Object.keys(rows[0])
              const format = detectFormat(headers)
              const fileKey = `${accountDir}/${file}`

              for (let i = 0; i < rows.length; i++) {
                const tx = normalizeRow(rows[i], format, account, fileKey, i)
                if (tx) transactions.push(tx)
              }
            }
          }

          transactions.sort((a, b) => new Date(b.date) - new Date(a.date))

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(transactions))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

// ─── Stock data API ───────────────────────────────────────
const stockCache = new Map() // ticker → { data, ts }
const CACHE_TTL  = 60 * 60 * 1000 // 1 hour

async function fetchStockData(ticker) {
  const hit = stockCache.get(ticker)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=10y`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${ticker}`)

  const json = await res.json()
  if (json.chart?.error) throw new Error(json.chart.error.description ?? 'Yahoo Finance error')

  const result = json.chart?.result?.[0]
  if (!result) throw new Error(`No chart result for ${ticker}`)

  const meta       = result.meta
  const timestamps = result.timestamp ?? []
  const adjCloses  = result.indicators?.adjclose?.[0]?.adjclose
  const rawCloses  = result.indicators?.quote?.[0]?.close
  const priceArr   = adjCloses ?? rawCloses ?? []

  const prices = timestamps.reduce((acc, ts, i) => {
    const p = priceArr[i]
    if (p != null && !isNaN(p) && p > 0) {
      acc.push({ date: new Date(ts * 1000).toISOString().slice(0, 7), price: p })
    }
    return acc
  }, [])

  if (!prices.length) throw new Error(`No valid prices for ${ticker}`)

  const currentPrice = meta.regularMarketPrice ?? prices.at(-1).price
  const prevClose    = meta.chartPreviousClose ?? meta.previousClose ?? null
  const changePct    = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : null

  function cagr(yrs) {
    const n = Math.min(yrs * 12, prices.length - 1)
    if (n < 6) return null
    const start = prices.at(-1 - n)?.price
    const end   = prices.at(-1)?.price
    if (!start || start <= 0) return null
    return Math.pow(end / start, 1 / yrs) - 1
  }

  const data = {
    ticker: meta.symbol ?? ticker,
    name: meta.longName ?? meta.shortName ?? ticker,
    currentPrice,
    currency: meta.currency ?? 'USD',
    changePct,
    prices, // [{date:'YYYY-MM', price:float}, ...]
    cagr1y:  cagr(1),
    cagr5y:  prices.length >= 60  ? cagr(5)  : null,
    cagr10y: prices.length >= 120 ? cagr(10) : null,
  }
  stockCache.set(ticker, { data, ts: Date.now() })
  return data
}

// ─── Yahoo crumb / session cookie ────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
let yfCrumb = null
let yfCookie = ''
let yfCrumbTs = 0

async function getYahooCrumb() {
  if (yfCrumb && Date.now() - yfCrumbTs < 55 * 60 * 1000) return

  // Step 1: establish session by hitting Yahoo's consent gate, grab Set-Cookie
  const consentRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA, 'Accept': '*/*' },
    redirect: 'follow',
  })
  const setCookies = typeof consentRes.headers.getSetCookie === 'function'
    ? consentRes.headers.getSetCookie()
    : (consentRes.headers.get('set-cookie') ?? '').split(/,(?=[^ ])/)
  yfCookie = setCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')

  // Step 2: exchange session for a crumb token
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': yfCookie, 'Accept': '*/*' },
  })
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<') || crumb.length > 30) {
    throw new Error(`Failed to obtain Yahoo Finance crumb (status ${crumbRes.status})`)
  }
  yfCrumb = crumb
  yfCrumbTs = Date.now()
  console.log('[stock-api] refreshed Yahoo Finance crumb')
}

// ─── Fundamentals cache ───────────────────────────────────
const fundCache = new Map()

async function fetchFundamentals(ticker) {
  const hit = fundCache.get(ticker)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

  await getYahooCrumb()

  const YH = 'https://query1.finance.yahoo.com'
  const headers = { 'User-Agent': UA, 'Cookie': yfCookie, 'Accept': 'application/json' }

  const modules = 'summaryDetail,defaultKeyStatistics,financialData,price,earningsTrend'
  const url = `${YH}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(yfCrumb)}`
  const r = await fetch(url, { headers })
  if (!r.ok) {
    // crumb may have expired mid-session; force a refresh on the next call
    if (r.status === 401) { yfCrumb = null; yfCrumbTs = 0 }
    throw new Error(`Yahoo Finance quoteSummary HTTP ${r.status}`)
  }
  const json = await r.json()
  if (json.quoteSummary?.error) throw new Error(json.quoteSummary.error.description ?? 'quoteSummary error')
  const q = json.quoteSummary?.result?.[0]
  if (!q) throw new Error(`No quoteSummary result for ${ticker}`)

  const sd = q.summaryDetail   ?? {}
  const ks = q.defaultKeyStatistics ?? {}
  const fd = q.financialData   ?? {}
  const pr = q.price           ?? {}
  const et = q.earningsTrend   ?? {}

  function v(obj, key) {
    const x = obj[key]
    return (x && typeof x === 'object' && 'raw' in x) ? x.raw : (x ?? null)
  }

  // Best estimate for next-year revenue growth from analyst trends
  let revenueGrowthFwd = null
  const trends = et.trend ?? []
  const nextYr = trends.find(t => t.period === '+1y')
  if (nextYr?.revenueEstimate?.growth?.raw != null) {
    revenueGrowthFwd = nextYr.revenueEstimate.growth.raw
  }

  const data = {
    // identification
    ticker: v(pr, 'symbol') ?? ticker,
    name:   v(pr, 'longName') ?? v(pr, 'shortName') ?? ticker,
    sector: v(pr, 'sector') ?? null,
    // price
    currentPrice:  v(pr, 'regularMarketPrice'),
    currency:      v(pr, 'currency') ?? 'USD',
    changePct:     v(pr, 'regularMarketChangePercent'),
    marketCap:     v(pr, 'marketCap'),
    // valuation
    trailingPE:    v(sd, 'trailingPE'),
    forwardPE:     v(sd, 'forwardPE'),
    priceToBook:   v(sd, 'priceToBook'),
    priceToSales:  v(ks, 'priceToSalesTrailing12Months'),
    pegRatio:      v(ks, 'pegRatio'),
    enterpriseValue: v(ks, 'enterpriseValue'),
    // earnings
    trailingEps:   v(ks, 'trailingEps'),
    forwardEps:    v(ks, 'forwardEps'),
    earningsGrowth: v(fd, 'earningsGrowth'),
    // profitability
    grossMargin:       v(fd, 'grossMargins'),
    operatingMargin:   v(fd, 'operatingMargins'),
    profitMargin:      v(fd, 'profitMargins') ?? v(ks, 'profitMargins'),
    returnOnEquity:    v(fd, 'returnOnEquity'),
    returnOnAssets:    v(fd, 'returnOnAssets'),
    // growth
    revenueGrowth:     v(fd, 'revenueGrowth'),
    revenueGrowthFwd,
    // balance sheet
    debtToEquity:  v(fd, 'debtToEquity'),
    currentRatio:  v(fd, 'currentRatio'),
    quickRatio:    v(fd, 'quickRatio'),
    totalCash:     v(fd, 'totalCash'),
    totalDebt:     v(fd, 'totalDebt'),
    freeCashflow:  v(fd, 'freeCashflow'),
    // dividend & risk
    dividendYield: v(sd, 'dividendYield'),
    beta:          v(sd, 'beta'),
    // 52-week
    week52High: v(sd, 'fiftyTwoWeekHigh'),
    week52Low:  v(sd, 'fiftyTwoWeekLow'),
    // volume
    volume:    v(pr, 'regularMarketVolume'),
    avgVolume: v(sd, 'averageVolume'),
    // short interest
    shortRatio: v(ks, 'shortRatio'),
    sharesShortPctFloat: v(ks, 'sharesPercentSharesOut'),
  }

  fundCache.set(ticker, { data, ts: Date.now() })
  return data
}

function stockAPIPlugin() {
  return {
    name: 'stock-api',
    configureServer(server) {
      server.middlewares.use('/api/stock', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }

        const ticker = req.url.replace(/^\/+/, '').split('?')[0].toUpperCase()
        if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid ticker' }))
          return
        }

        try {
          const data = await fetchStockData(ticker)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'max-age=3600')
          res.end(JSON.stringify(data))
        } catch (err) {
          console.error(`[stock-api] ${ticker}:`, err.message)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      server.middlewares.use('/api/stock-quote', async (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }

        const ticker = req.url.replace(/^\/+/, '').split('?')[0].toUpperCase()
        if (!ticker || !/^[A-Z0-9.\-]{1,10}$/.test(ticker)) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Invalid ticker' }))
          return
        }

        try {
          const [chart, fundamentals] = await Promise.all([
            fetchStockData(ticker),
            fetchFundamentals(ticker),
          ])
          const data = { ...fundamentals, prices: chart.prices, cagr1y: chart.cagr1y, cagr5y: chart.cagr5y, cagr10y: chart.cagr10y }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'max-age=3600')
          res.end(JSON.stringify(data))
        } catch (err) {
          console.error(`[stock-quote] ${ticker}:`, err.message)
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

// ─── App data persistence (statements/app-data.json) ─────
function appDataPlugin() {
  return {
    name: 'app-data',
    configureServer(server) {
      const dataPath = path.resolve(process.cwd(), 'statements', 'app-data.json')

      server.middlewares.use('/api/app-data', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')

        if (req.method === 'GET') {
          try {
            res.end(fs.existsSync(dataPath) ? fs.readFileSync(dataPath, 'utf-8') : '{}')
          } catch (err) {
            res.statusCode = 500; res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              JSON.parse(body) // validate
              const dir = path.dirname(dataPath)
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(dataPath, body, 'utf-8')
              res.end(JSON.stringify({ ok: true }))
            } catch (err) {
              res.statusCode = 400; res.end(JSON.stringify({ error: err.message }))
            }
          })
          return
        }

        res.statusCode = 405; res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), financeAPIPlugin(), stockAPIPlugin(), appDataPlugin()],
})
