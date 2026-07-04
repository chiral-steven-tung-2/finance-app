// dataPersistence.js
// Intercepts every finance-* localStorage write and debounce-syncs to
// statements/app-data.json via the Vite dev-server plugin.
// Import this module once (in App.jsx) before any component mounts.

let syncTimer = null
let _status = 'idle' // 'idle' | 'saving' | 'saved' | 'error'
const listeners = new Set()

function notify(status) {
  _status = status
  listeners.forEach(fn => fn(status))
}

function scheduleSync() {
  notify('saving')
  clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    try {
      const snapshot = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('finance-')) {
          try { snapshot[key] = JSON.parse(localStorage.getItem(key)) }
          catch { snapshot[key] = localStorage.getItem(key) }
        }
      }
      const res = await fetch('/api/app-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot, null, 2),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notify('saved')
      setTimeout(() => notify('idle'), 2500)
    } catch {
      notify('error')
    }
  }, 800)
}

// Patch localStorage.setItem — runs once when the module is imported
const _origSetItem = Storage.prototype.setItem
Storage.prototype.setItem = function (key, value) {
  _origSetItem.call(this, key, value)
  if (this === localStorage && key.startsWith('finance-')) scheduleSync()
}

/** Subscribe to sync status changes. Returns an unsubscribe function. */
export function onSyncStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSyncStatus() { return _status }

/**
 * Fetch statements/app-data.json from the server and restore all
 * finance-* keys into localStorage using the original (un-patched) setItem
 * so the write doesn't re-trigger a sync.
 * Returns true if data was found and applied, false otherwise.
 */
export async function loadFromServer() {
  try {
    const res = await fetch('/api/app-data')
    if (!res.ok) return false
    const data = await res.json()
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return false
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('finance-')) {
        _origSetItem.call(localStorage, key,
          typeof value === 'string' ? value : JSON.stringify(value))
      }
    }
    return true
  } catch {
    return false
  }
}
