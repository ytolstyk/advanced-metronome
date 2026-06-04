import '@testing-library/jest-dom'

// Polyfill ResizeObserver for jsdom (required by Radix UI primitives)
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Polyfill crypto.randomUUID for jsdom
if (typeof crypto === 'undefined' || typeof crypto.randomUUID === 'undefined') {
  let counter = 0
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => `test-uuid-${++counter}`,
    },
    writable: true,
  })
}
