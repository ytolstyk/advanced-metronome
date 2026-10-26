import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RegisterOptions = {
  onNeedReload?: () => void
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
}

const { registerSWMock } = vi.hoisted(() => ({
  registerSWMock: vi.fn<(options?: RegisterOptions) => () => Promise<void>>(),
}))

vi.mock('virtual:pwa-register', () => ({ registerSW: registerSWMock }))

import { registerServiceWorker } from './registerServiceWorker'

const HOUR_MS = 60 * 60 * 1000

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
}

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
}

function makeRegistration(update: () => Promise<void> = () => Promise.resolve()) {
  const updateMock = vi.fn(update)
  return {
    registration: { update: updateMock } as unknown as ServiceWorkerRegistration,
    update: updateMock,
  }
}

/** Runs registerServiceWorker in prod and fires the plugin's onRegisteredSW callback. */
function registerAndActivate(registration: ServiceWorkerRegistration | undefined) {
  registerServiceWorker()
  const options = registerSWMock.mock.calls[0]?.[0]
  options?.onRegisteredSW?.('/sw.js', registration)
}

describe('registerServiceWorker', () => {
  const addedListeners: EventListenerOrEventListenerObject[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    registerSWMock.mockReset()
    registerSWMock.mockReturnValue(() => Promise.resolve())
    setOnline(true)
    setVisibility('visible')

    // Track listeners so they can be removed and don't leak between tests.
    const realAdd = document.addEventListener.bind(document)
    vi.spyOn(document, 'addEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (type === 'visibilitychange') addedListeners.push(listener)
        realAdd(type, listener, options)
      },
    )
  })

  afterEach(() => {
    for (const listener of addedListeners.splice(0)) {
      document.removeEventListener('visibilitychange', listener)
    }
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('outside production', () => {
    it('does not register a service worker', () => {
      vi.stubEnv('PROD', false)
      registerServiceWorker()
      expect(registerSWMock).not.toHaveBeenCalled()
    })
  })

  describe('in production', () => {
    beforeEach(() => {
      vi.stubEnv('PROD', true)
    })

    it('calls registerSW once', () => {
      registerServiceWorker()
      expect(registerSWMock).toHaveBeenCalledTimes(1)
    })

    it('skips the hourly update while the tab is hidden', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)
      setVisibility('hidden')

      vi.advanceTimersByTime(HOUR_MS * 2)
      expect(update).not.toHaveBeenCalled()
    })

    describe('reloading onto a new version', () => {
      const reload = vi.fn()

      function needReload(search = '') {
        vi.stubGlobal('location', { reload, search })
        registerServiceWorker()
        registerSWMock.mock.calls[0]?.[0]?.onNeedReload?.()
      }

      beforeEach(() => {
        reload.mockReset()
        vi.spyOn(performance, 'now').mockReturnValue(1_000)
      })

      afterEach(() => {
        vi.unstubAllGlobals()
      })

      it('reloads at once on a freshly loaded page', () => {
        needReload()
        expect(reload).toHaveBeenCalledTimes(1)
      })

      it('waits for the person to return to an older page, then reloads once', () => {
        vi.mocked(performance.now).mockReturnValue(60_000)
        setVisibility('hidden')
        needReload()
        expect(reload).not.toHaveBeenCalled()

        document.dispatchEvent(new Event('visibilitychange'))
        expect(reload).not.toHaveBeenCalled()

        setVisibility('visible')
        document.dispatchEvent(new Event('visibilitychange'))
        document.dispatchEvent(new Event('visibilitychange'))
        expect(reload).toHaveBeenCalledTimes(1)
      })

      it('keeps a deferred reload pending while an OAuth sign-in is in the URL', () => {
        vi.mocked(performance.now).mockReturnValue(60_000)
        const location = { reload, search: '?code=a&state=b' }
        vi.stubGlobal('location', location)
        registerServiceWorker()
        registerSWMock.mock.calls[0]?.[0]?.onNeedReload?.()

        document.dispatchEvent(new Event('visibilitychange'))
        expect(reload).not.toHaveBeenCalled()

        location.search = ''
        document.dispatchEvent(new Event('visibilitychange'))
        expect(reload).toHaveBeenCalledTimes(1)
      })

      it('does not reload a fresh page that is finishing an OAuth sign-in', () => {
        needReload('?code=abc&state=xyz')
        expect(reload).not.toHaveBeenCalled()
      })
    })

    it('does nothing when registration is undefined', () => {
      registerAndActivate(undefined)
      vi.advanceTimersByTime(HOUR_MS * 2)
      document.dispatchEvent(new Event('visibilitychange'))
      expect(addedListeners).toHaveLength(0)
    })

    it('calls update() on each hourly tick while online', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)

      vi.advanceTimersByTime(HOUR_MS - 1)
      expect(update).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(update).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(HOUR_MS)
      expect(update).toHaveBeenCalledTimes(2)
    })

    it('skips the hourly update while offline', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)
      setOnline(false)

      vi.advanceTimersByTime(HOUR_MS * 3)
      expect(update).not.toHaveBeenCalled()
    })

    it('calls update() when the tab becomes visible and the browser is online', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)

      document.dispatchEvent(new Event('visibilitychange'))
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('does not call update() on visibility change while offline', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)
      setOnline(false)

      document.dispatchEvent(new Event('visibilitychange'))
      expect(update).not.toHaveBeenCalled()
    })

    it('does not call update() when the tab becomes hidden', () => {
      const { registration, update } = makeRegistration()
      registerAndActivate(registration)
      setVisibility('hidden')

      document.dispatchEvent(new Event('visibilitychange'))
      expect(update).not.toHaveBeenCalled()
    })

    it('swallows a rejected update() so no unhandled rejection occurs', async () => {
      const { registration, update } = makeRegistration(() => Promise.reject(new Error('network down')))
      registerAndActivate(registration)

      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
      await Promise.resolve()
      expect(update).toHaveBeenCalledTimes(1)
    })
  })
})
