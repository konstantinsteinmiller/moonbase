import type { LocalStorageAccessor, SaveStrategy } from './types'
import { isInternalKey } from './types'

// ─── SaveManager ───────────────────────────────────────────────────────────
//
// Owns the Strategy, the raw localStorage bindings, and the
// monkey-patching that forwards writes into the strategy. One instance is
// created at boot (`main.ts`) and held as a module-level singleton; game
// code keeps calling plain `localStorage.setItem` unchanged — the manager
// intercepts and forwards.

export class SaveManager {
  private readonly rawSet: (key: string, value: string) => void
  private readonly rawRemove: (key: string) => void
  private readonly rawClear: () => void
  private readonly storage: Storage

  private patched = false
  private hydrated = false
  private mirroring = false

  constructor(
    private readonly strategy: SaveStrategy,
    storage: Storage = window.localStorage
  ) {
    this.storage = storage
    // Capture raw bindings before we replace them so the mirror can
    // actually write without recursing into itself.
    this.rawSet = storage.setItem.bind(storage)
    this.rawRemove = storage.removeItem.bind(storage)
    this.rawClear = storage.clear.bind(storage)
  }

  /** Strategy name — useful for logs/tests. */
  get strategyName(): string {
    return this.strategy.name
  }

  isHydrated(): boolean {
    return this.hydrated
  }

  /**
   * Hydrate the local mirror from the backend, then patch
   * `localStorage.setItem` / `removeItem` so all future writes flow
   * through the strategy. Idempotent.
   *
   * MUST be awaited before the Vue app module graph loads, because
   * many composables read `localStorage.getItem(...)` at module
   * evaluation time.
   */
  async init(): Promise<void> {
    if (this.hydrated) return
    this.mirroring = true
    try {
      await this.strategy.hydrate(this.localAccessor())
    } catch (e) {
      console.warn(`[save] hydrate failed (${this.strategy.name})`, e)
    }
    this.mirroring = false
    this.patchLocalStorage()
    this.hydrated = true
  }

  /** Flush any pending writes. Best-effort — safe to await on unload. */
  async flush(): Promise<void> {
    await this.strategy.flush?.()
  }

  /** Release timers / listeners held by the strategy. */
  dispose(): void {
    this.strategy.dispose?.()
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private localAccessor(): LocalStorageAccessor {
    return {
      get: (key) => this.storage.getItem(key),
      set: (key, value) => this.rawSet(key, value),
      remove: (key) => this.rawRemove(key),
      keys: () => {
        const out: string[] = []
        for (let i = 0; i < this.storage.length; i++) {
          const k = this.storage.key(i)
          if (k !== null) out.push(k)
        }
        return out
      }
    }
  }

  private patchLocalStorage(): void {
    if (this.patched) return
    this.patched = true

    this.storage.setItem = (key: string, value: string) => {
      this.rawSet(key, value)
      if (this.mirroring || isInternalKey(key)) return
      try {
        this.strategy.onLocalSet(key, value)
      } catch (e) {
        console.warn(`[save] onLocalSet("${key}") threw`, e)
      }
    }

    this.storage.removeItem = (key: string) => {
      this.rawRemove(key)
      if (this.mirroring || isInternalKey(key)) return
      try {
        this.strategy.onLocalRemove(key)
      } catch (e) {
        console.warn(`[save] onLocalRemove("${key}") threw`, e)
      }
    }

    // `clear()` is rarely used by the game but keeping the mirror honest
    // matters if it ever is. Emits a remove for every tracked key.
    this.storage.clear = () => {
      const keys: string[] = []
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i)
        if (k !== null) keys.push(k)
      }
      this.rawClear()
      for (const k of keys) {
        if (isInternalKey(k)) continue
        try {
          this.strategy.onLocalRemove(k)
        } catch (e) {
          console.warn(`[save] onLocalRemove (clear) threw`, e)
        }
      }
    }
  }
}
