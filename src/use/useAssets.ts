import { ref } from 'vue'
import { modelImgPath, SPINNER_MODEL_IDS, getSelectedSkin } from '@/use/useModels.ts'
import useSpinnerConfig from '@/use/useSpinnerConfig.ts'
import useSpinnerCampaign from '@/use/useSpinnerCampaign.ts'
import { prependBaseUrl } from '@/utils/function.ts'
import type { TopPartId } from '@/types/spinner'

// Shared state so it can be accessed by both the loader and the progress component
const loadingProgress = ref(0)
const areAllAssetsLoaded = ref(false)

// THIS IS THE KEY: A persistent memory reference
export const resourceCache = {
  images: new Map<string, HTMLImageElement>(),
  audio: new Map<string, HTMLAudioElement>()
}

const STATIC_IMAGES = [
  'images/logo/logo_256x256.webp',
  'images/icons/difficulty-icon_128x128.webp',
  'images/icons/settings-icon_128x128.webp',
  'images/icons/sound-icon_128x128.webp',
  'images/icons/team_128x128.webp',
  'images/icons/gears_128x128.webp',
  'images/icons/movie_128x96.webp',
  'images/icons/chest_128x128.webp',
  'images/icons/trophy_128x128.webp',
  'images/bg/parchment-ribbon_553x188.webp',
  'images/vfx/big-spark_1280x256.webp',
  'images/vfx/dark-smoke_1280x128.webp',
  'images/vfx/earth-rip-decal_138x138.webp'
]

const SOUND_ASSETS = [
  'audio/sfx/clash-1.ogg',
  'audio/sfx/clash-2.ogg',
  'audio/sfx/clash-3.ogg',
  'audio/sfx/clash-4.ogg',
  'audio/sfx/clash-5.ogg',
  'audio/sfx/celebration-1.ogg',
  'audio/sfx/celebration-2.ogg',
  'audio/sfx/happy.ogg',
  'audio/sfx/level-up.ogg',
  'audio/sfx/win.ogg',
  'audio/sfx/lose.ogg',
  'audio/sfx/reward-continue.ogg'
]

// Kept for reference — music is streamed on demand from SpinnerArena, not preloaded.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MUSIC_ASSETS = [
  'audio/music/battle-1.ogg',
  'audio/music/battle-2.ogg',
  'audio/music/battle-3.ogg',
]

/**
 * Skin IDs the player will see IMMEDIATELY on first paint:
 *   • both player-team slots (resolved via getSelectedSkin — falls back to the
 *     default catalog skin when no selection has been persisted yet, which
 *     covers the very first load).
 *   • every enemy in the current campaign stage (stored on each StageBladeConfig).
 *
 * Everything else (the other ~40 skins in the config modal catalog, future
 * stages the player hasn't unlocked yet) is deferred to `preloadRemainingSkins`
 * which runs in the background once the arena is interactive.
 */
const getCriticalSkinIds = (): Set<string> => {
  const ids = new Set<string>()
  try {
    const { playerTeam } = useSpinnerConfig()
    playerTeam.value.forEach((cfg, slotIndex) => {
      // modelId override wins; otherwise resolve the player's chosen skin for
      // this top part. getSelectedSkin always returns a valid id (default on
      // first load).
      const id = cfg.modelId ?? getSelectedSkin(cfg.topPartId as TopPartId, slotIndex)
      if (id) ids.add(id)
    })
  } catch (e) {
    console.warn('[assets] player team resolve failed, using no player skins', e)
  }
  try {
    const { currentStage } = useSpinnerCampaign()
    const stage = currentStage.value
    if (stage?.enemyTeam) {
      for (const enemy of stage.enemyTeam) {
        if (enemy.modelId) ids.add(enemy.modelId)
      }
    }
  } catch (e) {
    console.warn('[assets] stage resolve failed, using no stage skins', e)
  }
  return ids
}

type AssetEntry = { src: string; type: 'image' | 'audio' }

const loadAsset = (
  { src, type }: AssetEntry,
  onLoaded?: () => void
): Promise<unknown> => {
  if (type === 'image' && resourceCache.images.has(src)) {
    onLoaded?.()
    return Promise.resolve()
  }
  if (type === 'audio' && resourceCache.audio.has(src)) {
    onLoaded?.()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    if (type === 'image') {
      const img = new Image()
      img.onload = () => {
        resourceCache.images.set(src, img)
        onLoaded?.()
        resolve(img)
      }
      img.onerror = () => {
        console.error('Preload fail:', src)
        onLoaded?.()
        resolve(null)
      }
      img.src = src
    } else {
      const audio = new Audio()
      audio.oncanplaythrough = () => {
        resourceCache.audio.set(src, audio)
        onLoaded?.()
        resolve(audio)
      }
      audio.onerror = () => {
        onLoaded?.()
        resolve(null)
      }
      audio.src = src
      audio.load()
    }
  })
}

const runInChunks = async (assets: AssetEntry[], chunkSize: number, onLoaded?: () => void) => {
  for (let i = 0; i < assets.length; i += chunkSize) {
    const chunk = assets.slice(i, i + chunkSize)
    await Promise.all(chunk.map(a => loadAsset(a, onLoaded)))
  }
}

// Tracks in-flight background skin preload so repeat triggers noop and the
// config modal can await it if opened early.
let remainingSkinsPromise: Promise<void> | null = null

export default () => {
  const preloadAssets = async () => {
    if (areAllAssetsLoaded.value) return

    const criticalSkinIds = getCriticalSkinIds()
    const criticalSkinPaths = [...criticalSkinIds].map(id => modelImgPath(id))

    const allAssets: AssetEntry[] = [
      ...STATIC_IMAGES.map(src => ({ src: prependBaseUrl(src), type: 'image' as const })),
      ...criticalSkinPaths.map(src => ({ src, type: 'image' as const })),
      ...SOUND_ASSETS.map(src => ({ src: prependBaseUrl(src), type: 'audio' as const }))
    ]

    let loadedCount = 0
    const totalCount = allAssets.length
    const onOne = () => {
      loadedCount++
      loadingProgress.value = Math.floor((loadedCount / totalCount) * 100)
    }

    try {
      await runInChunks(allAssets, 10, onOne)
      areAllAssetsLoaded.value = true
      loadingProgress.value = 100
    } catch (error) {
      console.error('Preload failed:', error)
      loadingProgress.value = 100
    }
  }

  /**
   * Fire-and-forget background loader for every skin NOT in the critical set.
   * Safe to call multiple times — concurrent calls share the same in-flight
   * promise. Callers (e.g. the skin config modal) can `await` the returned
   * promise if they need to be sure everything's cached before rendering a
   * gallery.
   */
  const preloadRemainingSkins = (): Promise<void> => {
    if (remainingSkinsPromise) return remainingSkinsPromise

    const remaining: AssetEntry[] = SPINNER_MODEL_IDS
      .map(id => modelImgPath(id))
      .filter(src => !resourceCache.images.has(src))
      .map(src => ({ src, type: 'image' as const }))

    if (remaining.length === 0) {
      remainingSkinsPromise = Promise.resolve()
      return remainingSkinsPromise
    }

    // Smaller chunks than the critical preloader so we don't starve the main
    // thread / network while the player is already interacting with the arena.
    remainingSkinsPromise = runInChunks(remaining, 4).catch((e) => {
      console.error('Background skin preload failed:', e)
    }) as Promise<void>
    return remainingSkinsPromise
  }

  return {
    loadingProgress,
    areAllAssetsLoaded,
    preloadAssets,
    preloadRemainingSkins,
    resourceCache // Export this if you want to debug memory usage
  }
}
