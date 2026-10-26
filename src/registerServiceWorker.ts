import { registerSW } from 'virtual:pwa-register'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** A page this young has nothing worth keeping, so a new version can replace it right away. */
const FRESH_PAGE_MS = 10_000

const isOAuthReturn = () => {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') && params.has('state')
}

/**
 * Registers the PWA service worker. The worker activates new versions immediately
 * (`skipWaiting` + `clientsClaim` in vite.config.ts) and this reloads the page onto them, so
 * the precached shell can't stay stale. A fresh page reloads at once; an older one waits until
 * the person returns to the tab, so a deploy never wipes work in progress. The browser only
 * checks for a new worker on navigation, so we also poll (visible tabs hourly, and on focus).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return

  const reloadWhenSafe = () => {
    if (performance.now() < FRESH_PAGE_MS && !isOAuthReturn()) {
      window.location.reload()
      return
    }
    const reloadOnReturn = () => {
      if (document.visibilityState !== 'visible' || isOAuthReturn()) return
      document.removeEventListener('visibilitychange', reloadOnReturn)
      window.location.reload()
    }
    document.addEventListener('visibilitychange', reloadOnReturn)
  }

  registerSW({
    onNeedReload: reloadWhenSafe,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {})
      }
      setInterval(() => {
        if (document.visibilityState === 'visible') check()
      }, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
