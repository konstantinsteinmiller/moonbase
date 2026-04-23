import type { LocalStorageAccessor, SaveStrategy } from './types'

// ─── CrazyGames data-module strategy ───────────────────────────────────────
//
// Mirrors the game's localStorage into the CrazyGames SDK's `data` module so
// progress follows the player between devices on the CrazyGames portal.
//
// The SDK does not expose a "list keys" API, so we keep our own manifest of
// keys we've written. On boot we read the manifest, pull each key back from
// the SDK into localStorage, then patch-through every subsequent local
// write.
//
// Extracted from the previous inline implementation in `useCrazyGames.ts`
// so that the choice between CrazyGames / Glitch / localStorage can be made
// declaratively by `SaveManager`.

const KEYS_MANIFEST = '__save_internal__crazy_keys'
const FLUSH_DELAY_MS = 500

interface SdkDataModule {
  getItem: (key: string) => Promise<string | null> | string | null
  setItem: (key: string, value: string) => Promise<void> | void
  removeItem: (key: string) => Promise<void> | void
}

/**
 * Resolves the SDK's data module. Injectable so unit tests can supply a
 * fake without standing up the full `window.CrazyGames` shape.
 */
export type CrazySdkDataGetter = () => SdkDataModule | null

export class CrazyGamesStrategy implements SaveStrategy {
  readonly name = 'crazyGames'

  private local: LocalStorageAccessor | null = null
  private dirty = new Map<string, string | null>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly getData: CrazySdkDataGetter) {
  }

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    this.local = local
    const data = this.getData()
    if (!data) {
      // SDK not available — strategy degrades to pure localStorage.
      return
    }

    try {
      const manifestRaw = await data.getItem(KEYS_MANIFEST)
      const keys = parseManifest(manifestRaw)
      for (const key of keys) {
        try {
          const value = await data.getItem(key)
          if (value !== null && value !== undefined) {
            local.set(key, String(value))
          }
        } catch (e) {
          console.warn(`[save/crazy] hydrate getItem("${key}") failed`, e)
        }
      }
    } catch (e) {
      console.warn('[save/crazy] hydrate manifest failed', e)
    }
  }

  onLocalSet(key: string, value: string): void {
    this.dirty.set(key, value)
    this.trackKey(key)
    this.scheduleFlush()
  }

  onLocalRemove(key: string): void {
    this.dirty.set(key, null)
    this.untrackKey(key)
    this.scheduleFlush()
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.doFlush()
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.dirty.clear()
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.doFlush()
    }, FLUSH_DELAY_MS)
  }

  private async doFlush(): Promise<void> {
    const data = this.getData()
    if (!data) return
    const batch = this.dirty
    this.dirty = new Map()
    for (const [key, value] of batch) {
      try {
        if (value !== null) {
          await data.setItem(key, value)
        } else {
          await data.removeItem(key)
        }
      } catch (e) {
        console.warn(`[save/crazy] sdk.data sync ("${key}") failed`, e)
      }
    }
    try {
      const manifest = this.readManifest()
      await data.setItem(KEYS_MANIFEST, JSON.stringify(manifest))
    } catch (e) {
      console.warn('[save/crazy] manifest sync failed', e)
    }
  }

  private readManifest(): string[] {
    if (!this.local) return []
    const raw = this.local.get(KEYS_MANIFEST)
    return parseManifest(raw)
  }

  private writeManifest(keys: string[]): void {
    this.local?.set(KEYS_MANIFEST, JSON.stringify(keys))
  }

  private trackKey(key: string): void {
    const keys = this.readManifest()
    if (!keys.includes(key)) {
      keys.push(key)
      this.writeManifest(keys)
    }
  }

  private untrackKey(key: string): void {
    const keys = this.readManifest()
    const next = keys.filter(k => k !== key)
    if (next.length !== keys.length) this.writeManifest(next)
  }
}

const parseManifest = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}
