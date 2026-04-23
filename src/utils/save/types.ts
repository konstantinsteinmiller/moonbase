// ─── Save Strategy contract ────────────────────────────────────────────────
//
// The game uses the browser's synchronous `localStorage` as the source of
// truth at runtime — ~15 module-level reads fire during app bootstrap and
// many components write back on change. Each environment (plain web,
// CrazyGames, Glitch) layers a different *backend* on top of that local
// mirror to persist progress between devices.
//
// Rather than scatter build-flag branches through every call site, each
// backend is implemented as a `SaveStrategy`. `SaveManager` picks one at
// boot, hydrates localStorage from the backend, then forwards every
// subsequent local write to the strategy. Adding a new backend is a matter
// of implementing this one interface.

/**
 * Narrow accessor passed to strategies so they can read / write
 * localStorage without re-entering the SaveManager's mirror wrappers.
 * Strategies MUST use this instead of `window.localStorage` during
 * hydration, otherwise they'd trigger their own mirror recursively.
 */
export interface LocalStorageAccessor {
  get(key: string): string | null

  set(key: string, value: string): void

  remove(key: string): void

  keys(): string[]
}

export interface SaveStrategy {
  /** Short human-readable name used in logs and for testing. */
  readonly name: string

  /**
   * Pull authoritative state from the backend into localStorage. Must
   * resolve before any Vue module reads `localStorage.getItem(...)` at
   * load time — the SaveManager awaits this before the main app graph
   * imports.
   *
   * A strategy should degrade to a no-op if its backend is unavailable
   * (SDK not loaded, auth token missing, network error). The local mirror
   * still works on its own — failing hydrate must never brick the game.
   */
  hydrate(local: LocalStorageAccessor): Promise<void>

  /**
   * Called every time application code writes to localStorage (after the
   * local write has already landed). Strategies typically enqueue the
   * change for eventual push to their backend, debounced to avoid
   * hammering the network on rapid game-state writes.
   */
  onLocalSet(key: string, value: string): void

  /** Companion to onLocalSet for removals. */
  onLocalRemove(key: string): void

  /** Flush any pending writes. Optional — best-effort on page unload. */
  flush?(): Promise<void>

  /** Release resources (timers, listeners). Optional. */
  dispose?(): void
}

/**
 * Keys whose persistence is internal to a strategy (manifests, version
 * counters, etc.). SaveManager never forwards these to `onLocalSet` /
 * `onLocalRemove`, preventing recursion when a strategy writes its own
 * bookkeeping through the wrapped `localStorage.setItem`.
 */
export const INTERNAL_KEY_PREFIX = '__save_internal__'

export const isInternalKey = (key: string): boolean =>
  key.startsWith(INTERNAL_KEY_PREFIX) ||
  key.startsWith('__SafeLocalStorage__') || // CrazyGames SDK scratch space
  key.startsWith('SDK_DATA_')                // CrazyGames SDK scratch space
