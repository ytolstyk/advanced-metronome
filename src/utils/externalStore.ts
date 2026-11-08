/** A value readable through `useSyncExternalStore`. */
export interface ReadableStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
}

export interface ExternalStore<T> extends ReadableStore<T> {
  set: (next: T) => void;
}

/**
 * A minimal external store. `set` is the only gate: it skips the update (and keeps the snapshot reference
 * stable) when `equals` says nothing changed, otherwise notifies every listener.
 */
export function createStore<T>(initial: T, equals: (a: T, b: T) => boolean): ExternalStore<T> {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
    set(next) {
      if (equals(next, current)) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
