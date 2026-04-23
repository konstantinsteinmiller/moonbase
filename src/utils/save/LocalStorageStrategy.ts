import type { LocalStorageAccessor, SaveStrategy } from './types'

// Default fallback strategy — no remote backend, `localStorage` is the
// source of truth. `hydrate` is a no-op because localStorage is already
// populated by the browser; `onLocalSet`/`onLocalRemove` are no-ops
// because there is no backend to mirror to.
//
// Kept as its own class (rather than an inline null-object) so tests and
// future extensions can swap it out cleanly, and so `SaveManager.name`
// reports something useful in logs.
export class LocalStorageStrategy implements SaveStrategy {
  readonly name = 'localStorage'

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // noop — browser already hydrated localStorage for us.
  }

  onLocalSet(_key: string, _value: string): void {
    // noop — no remote backend.
  }

  onLocalRemove(_key: string): void {
    // noop — no remote backend.
  }
}
