// ─── CrazyGames SDK integration ────────────────────────────────────────────
//
// Encapsulates everything the rest of the app needs to talk to the
// CrazyGames SDK loaded via a <script> tag in index.html:
//
//   1. init() — probes `window.CrazyGames.SDK`, calls SDK.init(), and flips
//      `isSdkActive` to true iff the SDK reports a real CrazyGames environment
//      ('crazygames' for live iframe, 'local' for local dev tooling) AND the
//      build-time `isCrazyWeb` flag is set (VITE_APP_CRAZY_WEB=true).
//
//   2. Data persistence mirror — when the SDK is active, every subsequent
//      `localStorage.setItem` / `removeItem` is also forwarded to the SDK's
//      data module so progress follows the player across devices. All existing
//      synchronous `localStorage.getItem` reads in the app keep working
//      because we hydrate the browser's localStorage from the SDK *before*
//      the main Vue app module graph loads (see main.ts).
//
//   3. Gameplay lifecycle — `startGameplay()` / `stopGameplay()` wrap the
//      SDK's `game.gameplayStart()` / `gameplayStop()` hooks, which let
//      CrazyGames know when the player is actually in a match (vs menus).
//
//   4. `showRewardedAd()` — a Promise-based wrapper around the SDK's
//      `ad.requestAd('rewarded', …)` callback API. Resolves `true` only when
//      the video played all the way through, so callers can safely grant the
//      reward on success and be silent on failure.
//
// Outside of a CrazyGames build the module is inert: `isSdkActive` stays
// false, localStorage is untouched, and `showRewardedAd()` resolves false.

import { ref } from 'vue'
import { isCrazyWeb } from '@/use/useUser'

// The CrazyGames SDK is loaded globally via a script tag in index.html.
// We interact with it entirely through `window.CrazyGames.SDK`, so the
// types are intentionally loose — we only touch the members we need.
declare global {
  interface Window {
    CrazyGames?: {
      SDK?: any
    }
  }
}

/** Reactive: true when the SDK finished init AND we're in a crazy-web build. */
export const isSdkActive = ref(false)

/**
 * Last known mute state reported by the CrazyGames SDK. `null` until we've
 * either read `sdk.game.muteAudio` at init time or received an event from
 * `sdk.game.addMuteListener`. Components can mirror this into their own
 * volume settings to keep the platform-level mute toggle in sync.
 */
export const isSdkMuted = ref<boolean | null>(null)

/**
 * CrazyGames-side display name for the current player, when available.
 * Falls back to `null` for anonymous sessions or non-crazy builds — callers
 * should default to a generic label like "You".
 */
export const crazyPlayerName = ref<string | null>(null)

/**
 * Two-letter language code derived from `sdk.user.systemInfo.locale`
 * (e.g. `en` from `en-US`). `null` when the SDK didn't expose one.
 */
export const crazyLocale = ref<string | null>(null)

// Internal handles — captured during init() and reused by the rest of the
// module. Keeping them here (rather than re-reading window.CrazyGames.SDK on
// every call) makes the intent explicit and lets us no-op cleanly when the
// script tag never loaded.
let sdk: any = null
let initialized = false
let gameplayActive = false

// Manifest key used to track which keys have been written through
// `localStorage.setItem` while the SDK was active. We need it because the
// SDK's data module doesn't expose a "list all keys" API — so on the next
// session we hydrate by iterating this manifest.
const KEYS_MANIFEST = '__ca_keys__'

// Raw localStorage bindings captured before we replace the public ones.
// Used by the mirror to actually write to the browser without recursing
// into our own wrappers.
let rawSetItem: (key: string, value: string) => void = window.localStorage.setItem.bind(window.localStorage)
let rawRemoveItem: (key: string) => void = window.localStorage.removeItem.bind(window.localStorage)
let lsPatched = false

// Re-entrancy guard: when true, localStorage writes come from the SDK
// itself (caching cloud data) and must not be mirrored back.
let mirroring = false

// Keys the SDK writes internally — never mirror these back to sdk.data.
const isInternalKey = (key: string): boolean =>
  key === KEYS_MANIFEST ||
  key.startsWith('__SafeLocalStorage__') ||
  key.startsWith('SDK_DATA_')

// Debounce: collect dirty keys and flush them to sdk.data in one batch
// so rapid game-state writes don't each trigger a separate cloud round-trip.
let dirtyKeys = new Map<string, string | null>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DELAY_MS = 500

const scheduleFlush = () => {
  if (flushTimer !== null) return
  flushTimer = setTimeout(flushToSdk, FLUSH_DELAY_MS)
}

const flushToSdk = () => {
  flushTimer = null
  if (!sdk) return
  const batch = dirtyKeys
  dirtyKeys = new Map()
  mirroring = true
  for (const [key, value] of batch) {
    try {
      if (value !== null) {
        sdk.data?.setItem?.(key, value)
      } else {
        sdk.data?.removeItem?.(key)
      }
    } catch (e) {
      console.warn(`[crazygames] sdk.data sync ("${key}") failed`, e)
    }
  }
  // Sync the manifest so the next session can hydrate all keys
  try {
    const manifest = readManifest()
    sdk.data?.setItem?.(KEYS_MANIFEST, JSON.stringify(manifest))
  } catch (e) {
    console.warn('[crazygames] manifest sync failed', e)
  }
  mirroring = false
}

const getSdk = (): any => (typeof window !== 'undefined' ? window.CrazyGames?.SDK ?? null : null)

const isActiveEnv = (s: any): boolean => {
  if (!s) return false
  const env = s.environment
  // 'crazygames' — running inside an iframe on crazygames.com
  // 'local'      — local dev via `crazygames-sdk` CLI tool
  // 'disabled'   — plain localhost, no SDK tooling
  return (env === 'crazygames' || env === 'local') && isCrazyWeb
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialize the SDK. Must be awaited *before* the main Vue app module
 * graph loads so that hydrated data lands in localStorage before any
 * module-level `localStorage.getItem(...)` call runs.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export const initCrazyGames = async (): Promise<void> => {
  if (initialized) return
  initialized = true

  const candidate = getSdk()
  if (!candidate) {
    // Script tag didn't load (blocked, offline, or plain non-CG build).
    return
  }

  try {
    await candidate.init?.()
  } catch (e) {
    console.warn('[crazygames] SDK init failed', e)
    return
  }

  if (!isActiveEnv(candidate)) {
    // Non-crazy-web build, or running in a 'disabled' environment.
    // Leave localStorage alone and keep `isSdkActive` false.
    // sdk = candidate
    // isSdkActive.value = true
    return
  }

  sdk = candidate
  isSdkActive.value = true

  await hydrateFromSdk()
  patchLocalStorage()
  await captureSdkProfile()
  registerMuteListener()
}

// ─── Profile / settings capture ───────────────────────────────────────────

/**
 * Best-effort read of mute state, player identity, and locale from the SDK.
 * All branches are wrapped in try/catch so a single missing field doesn't
 * abort the rest — the SDK surface differs slightly between builds.
 */
const captureSdkProfile = async (): Promise<void> => {
  // Initial mute state. Per the CG SDK v3 docs, the canonical read path is
  // the property `sdk.game.settings.muteAudio` ("please disable the game
  // audio if this is true"). We also defensively check `sdk.game.muteAudio`
  // and an `isMuted()` method in case the SDK surface drifts between
  // builds, but the `settings.muteAudio` path is the documented one.
  try {
    let m: unknown = sdk?.game?.settings?.muteAudio
    if (typeof m !== 'boolean') m = sdk?.game?.muteAudio
    if (typeof m !== 'boolean' && typeof sdk?.game?.isMuted === 'function') {
      m = sdk.game.isMuted()
    }
    if (typeof m === 'boolean') isSdkMuted.value = m
  } catch (e) {
    console.warn('[crazygames] read settings.muteAudio failed', e)
  }

  // Player display name. `sdk.user.getUser()` resolves to `null` for
  // anonymous sessions, so we only fill the ref when a real username comes
  // back.
  try {
    const u = await sdk?.user?.getUser?.()
    const name = typeof u?.username === 'string' ? u.username.trim() : ''
    if (name) crazyPlayerName.value = name
  } catch (e) {
    console.warn('[crazygames] getUser failed', e)
  }

  // Locale. Newer SDK builds expose `systemInfo` as a property; older ones
  // expose a `getSystemInfo()` async accessor. We try the property first and
  // fall back to the method, then normalize whatever we find to its
  // language sub-tag (`en-US` → `en`).
  try {
    let info: any = sdk?.user?.systemInfo
    if (!info && typeof sdk?.user?.getSystemInfo === 'function') {
      info = await sdk.user.getSystemInfo()
    }
    const raw =
      info?.locale ??
      info?.userLocale ??
      info?.language ??
      null
    if (typeof raw === 'string' && raw.length >= 2) {
      crazyLocale.value = raw.split(/[-_]/)[0]!.toLowerCase()
    }
  } catch (e) {
    console.warn('[crazygames] systemInfo locale read failed', e)
  }
}

// ─── Hydration (SDK → localStorage) ───────────────────────────────────────

const hydrateFromSdk = async (): Promise<void> => {
  if (!sdk?.data) return
  mirroring = true
  try {
    const manifestRaw = await sdk.data.getItem(KEYS_MANIFEST)
    const keys: string[] = manifestRaw ? safeParseArray(manifestRaw) : []
    for (const key of keys) {
      try {
        const value = await sdk.data.getItem(key)
        if (value !== null && value !== undefined) {
          rawSetItem(key, String(value))
        }
      } catch (e) {
        console.warn(`[crazygames] hydrate getItem("${key}") failed`, e)
      }
    }
  } catch (e) {
    console.warn('[crazygames] hydrate manifest failed', e)
  }
  mirroring = false
}

const safeParseArray = (raw: string): string[] => {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}

// ─── Mirror (localStorage → SDK) ──────────────────────────────────────────

const patchLocalStorage = (): void => {
  if (lsPatched) return
  lsPatched = true

  const ls = window.localStorage
  // Rebind now in case something else replaced these between module load
  // and init() resolving.
  rawSetItem = ls.setItem.bind(ls)
  rawRemoveItem = ls.removeItem.bind(ls)

  ls.setItem = (key: string, value: string) => {
    rawSetItem(key, value)
    if (mirroring || isInternalKey(key)) return
    dirtyKeys.set(key, value)
    trackKey(key)
    scheduleFlush()
  }

  ls.removeItem = (key: string) => {
    rawRemoveItem(key)
    if (mirroring || isInternalKey(key)) return
    dirtyKeys.set(key, null)
    untrackKey(key)
    scheduleFlush()
  }
}

const readManifest = (): string[] => {
  const raw = window.localStorage.getItem(KEYS_MANIFEST)
  return raw ? safeParseArray(raw) : []
}

const writeManifest = (keys: string[]): void => {
  rawSetItem(KEYS_MANIFEST, JSON.stringify(keys))
}

const trackKey = (key: string): void => {
  const keys = readManifest()
  if (!keys.includes(key)) {
    keys.push(key)
    writeManifest(keys)
  }
}

const untrackKey = (key: string): void => {
  const keys = readManifest()
  const next = keys.filter(k => k !== key)
  if (next.length !== keys.length) writeManifest(next)
}

// ─── Gameplay lifecycle ───────────────────────────────────────────────────

/**
 * Signal a "happy moment" to the CrazyGames SDK. CrazyGames uses these
 * events to pick the best times to highlight the game and to calibrate
 * player-sentiment analytics, so we fire it when the player just landed
 * a clearly positive reward (roulette win, boss drop, etc.). No-op when
 * the SDK isn't active.
 */
export const triggerHappytime = (): void => {
  if (!sdk || !isSdkActive.value) return
  try {
    sdk.game?.happytime?.()
  } catch (e) {
    console.warn('[crazygames] happytime failed', e)
  }
}

/**
 * Notify CrazyGames that interactive gameplay is starting. Idempotent.
 * Call when the player enters the arena / begins a match.
 */
export const startGameplay = (): void => {
  if (!sdk || gameplayActive) return
  try {
    sdk.game?.gameplayStart?.()
    gameplayActive = true
  } catch (e) {
    console.warn('[crazygames] gameplayStart failed', e)
  }
}

/**
 * Notify CrazyGames that gameplay has ended. Idempotent.
 * Call when leaving the arena, opening a blocking menu, or mid-ad.
 */
export const stopGameplay = (): void => {
  if (!sdk || !gameplayActive) return
  try {
    sdk.game?.gameplayStop?.()
    gameplayActive = false
  } catch (e) {
    console.warn('[crazygames] gameplayStop failed', e)
  }
}

// ─── Mute sync ────────────────────────────────────────────────────────────

type MuteCallback = (muted: boolean) => void
const muteListeners = new Set<MuteCallback>()

/**
 * Wire up the CrazyGames → game side of the mute bridge. Called once at
 * init, after captureSdkProfile has read the initial state.
 *
 * Per the CG SDK v3 docs, the supported way to react to mute changes is
 * `sdk.game.addSettingsChangeListener(listener)`, where `listener` is
 * called with the *full settings object* (not just a boolean) every time
 * any game setting changes — we extract `muteAudio` from that object.
 *
 * We keep a defensive `addMuteListener` branch for older shims, but the
 * settings-change path is the documented one and the only one that
 * actually fires in the live SDK. The previous code here relied solely
 * on `addMuteListener`, which never fires on the real v3 surface — that
 * is why the platform mute button didn't reach the game.
 */
const registerMuteListener = (): void => {
  if (!sdk?.game) return

  const handleMuteChange = (muted: boolean) => {
    if (isSdkMuted.value === muted) return
    isSdkMuted.value = muted
    muteListeners.forEach(cb => {
      try {
        cb(muted)
      } catch (e) {
        console.warn('[crazygames] mute callback threw', e)
      }
    })
  }

  if (typeof sdk.game.addSettingsChangeListener === 'function') {
    try {
      sdk.game.addSettingsChangeListener((newSettings: any) => {
        const m = newSettings?.muteAudio
        if (typeof m === 'boolean') handleMuteChange(m)
      })
    } catch (e) {
      console.warn('[crazygames] addSettingsChangeListener failed', e)
    }
  } else if (typeof sdk.game.addMuteListener === 'function') {
    // Legacy / shim fallback.
    try {
      sdk.game.addMuteListener((muted: boolean) => handleMuteChange(!!muted))
    } catch (e) {
      console.warn('[crazygames] addMuteListener failed', e)
    }
  }
}

/**
 * Subscribe to CrazyGames-side mute toggles. The listener fires whenever
 * the platform chrome (or another part of the page) flips the mute state,
 * letting components mirror it into their own audio settings.
 *
 * New subscribers are IMMEDIATELY replayed the current SDK mute state
 * (when known), so a single hook covers both the initial sync and future
 * toggles — no separate "apply once" watcher needed.
 *
 * Returns an unsubscribe function. When the SDK isn't active, the callback
 * is never invoked and the unsubscribe is a no-op.
 */
export const onCrazyMuteChange = (cb: MuteCallback): (() => void) => {
  muteListeners.add(cb)
  if (isSdkMuted.value !== null) {
    try {
      cb(isSdkMuted.value)
    } catch (e) {
      console.warn('[crazygames] mute replay callback threw', e)
    }
  }
  return () => muteListeners.delete(cb)
}

/**
 * Record an in-game mute toggle so any code reading `isSdkMuted` sees the
 * new value. NOTE: the CrazyGames SDK v3 has no public setter for the
 * platform-level mute — that toggle is owned by the CG chrome and only
 * flows one-way (platform → game) through the settings-change listener.
 * The previous property-assignment attempts (`sdk.game.muteAudio = muted`)
 * were silently failing on the real SDK, which is why the in-game mute
 * button never moved the platform UI. We now just update our local ref so
 * internal consumers stay coherent. Safe to call when the SDK is inactive.
 */
export const setCrazyMuted = (muted: boolean): void => {
  isSdkMuted.value = muted
}

// Backwards-compat alias — `addCrazyMuteListener` was the old name used by
// `useCrazyMuteSync`. It's just `onCrazyMuteChange` under a different
// spelling so existing call sites keep compiling; prefer the new name in
// new code.
export const addCrazyMuteListener = onCrazyMuteChange

// ─── Rewarded video ads ───────────────────────────────────────────────────

/**
 * Shows a rewarded video ad via the CrazyGames SDK. Resolves `true` iff the
 * ad played all the way through — callers should only grant the reward on
 * a `true` result.
 *
 * Always resolves `false` (and is a no-op) when the SDK is not active, so
 * callers can use it unconditionally without guard checks.
 */
export const showRewardedAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve(false)
      return
    }

    // CrazyGames recommends pausing gameplay while an ad plays so that
    // sounds + timers don't run behind the video. We explicitly restart
    // gameplay on both the success and error paths so we never leave the
    // game stuck in a paused state.
    const resumeAfterAd = () => startGameplay()

    try {
      sdk.ad?.requestAd?.('rewarded', {
        adStarted: () => {
          stopGameplay()
        },
        adFinished: () => {
          resumeAfterAd()
          resolve(true)
        },
        adError: (err: unknown) => {
          console.warn('[crazygames] rewarded ad error', err)
          resumeAfterAd()
          resolve(false)
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd threw', e)
      resumeAfterAd()
      resolve(false)
    }
  })
}

// ─── Midgame interstitial ads ─────────────────────────────────────────────

/**
 * Shows a midgame (interstitial) video ad via the CrazyGames SDK. Unlike
 * rewarded ads there is no reward to grant, so the promise simply resolves
 * once the SDK signals the ad has finished or errored — callers can `await`
 * it to know when it's safe to resume the next match.
 *
 * No-op (and resolves immediately) when the SDK is not active.
 */
export const showMidgameAd = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!sdk || !isSdkActive.value) {
      resolve()
      return
    }

    // Pause gameplay while the ad plays so sounds and timers don't run
    // behind the video, and always resume on both success and error paths.
    const resumeAfterAd = () => startGameplay()

    try {
      sdk.ad?.requestAd?.('midgame', {
        adStarted: () => {
          stopGameplay()
        },
        adFinished: () => {
          resumeAfterAd()
          resolve()
        },
        adError: (err: unknown) => {
          console.warn('[crazygames] midgame ad error', err)
          resumeAfterAd()
          resolve()
        }
      })
    } catch (e) {
      console.warn('[crazygames] requestAd midgame threw', e)
      resumeAfterAd()
      resolve()
    }
  })
}

// ─── Default export (composable-style convenience) ───────────────────────

const useCrazyGames = () => ({
  isSdkActive,
  isSdkMuted,
  crazyPlayerName,
  crazyLocale,
  initCrazyGames,
  startGameplay,
  stopGameplay,
  showRewardedAd,
  showMidgameAd,
  addCrazyMuteListener,
  onCrazyMuteChange,
  setCrazyMuted,
  triggerHappytime
})

export default useCrazyGames
