import { ref } from 'vue'
import { prependBaseUrl } from '@/utils/function'

const loadingProgress = ref(0)
const areAllAssetsLoaded = ref(false)

export const resourceCache = {
  images: new Map<string, HTMLImageElement>(),
  audio: new Map<string, HTMLAudioElement>(),
  videos: new Map<string, HTMLVideoElement>()
}

// Only a small set of critical assets are preloaded before the game boots.
// The world geometry is procedural, so there are no 3D model downloads to
// wait for. Voice-over lines are loaded on-demand by the dialog system.
const STATIC_IMAGES: string[] = [
  'images/logo/logo_256x256.webp'
]

const SOUND_ASSETS: string[] = [
  // Meteor shower cue bank — the shower cinematic needs zero-latency
  // playback when it triggers (the flyby plays the instant the event
  // fires; the four impact clips ricochet randomly as small rocks hit).
  'audio/sfx/meteor-flyby.ogg',
  'audio/sfx/meteor-impact-1.ogg',
  'audio/sfx/meteor-impact-2.ogg',
  'audio/sfx/meteor-impact-3.ogg',
  'audio/sfx/meteor-impact-4.ogg'
]

// Non-critical videos — fetched after the main preload finishes, during an
// idle tick, so the loading screen never waits on them.
const IDLE_VIDEO_ASSETS: string[] = [
  'video/ekon-tusk-no-voice.mp4'
]

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

const preloadVideo = (src: string): Promise<void> =>
  new Promise(resolve => {
    if (resourceCache.videos.has(src)) {
      resolve()
      return
    }
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    const done = () => {
      resourceCache.videos.set(src, video)
      resolve()
    }
    video.addEventListener('canplaythrough', done, { once: true })
    video.addEventListener('error', () => resolve(), { once: true })
    video.src = src
    video.load()
  })

const scheduleIdle = (cb: () => void) => {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined
  if (ric) ric(() => cb(), { timeout: 3000 })
  else setTimeout(cb, 500)
}

const runInChunks = async (assets: AssetEntry[], chunkSize: number, onLoaded?: () => void) => {
  for (let i = 0; i < assets.length; i += chunkSize) {
    const chunk = assets.slice(i, i + chunkSize)
    await Promise.all(chunk.map(a => loadAsset(a, onLoaded)))
  }
}

export default () => {
  const preloadAssets = async () => {
    if (areAllAssetsLoaded.value) return
    const allAssets: AssetEntry[] = [
      ...STATIC_IMAGES.map(src => ({ src: prependBaseUrl(src), type: 'image' as const })),
      ...SOUND_ASSETS.map(src => ({ src: prependBaseUrl(src), type: 'audio' as const }))
    ]
    const totalCount = Math.max(1, allAssets.length)
    let loadedCount = 0
    const onOne = () => {
      loadedCount++
      loadingProgress.value = Math.floor((loadedCount / totalCount) * 100)
    }
    try {
      await runInChunks(allAssets, 10, onOne)
    } catch (e) {
      console.error('Preload failed:', e)
    } finally {
      areAllAssetsLoaded.value = true
      loadingProgress.value = 100
      // Kick off non-critical video preloads once the main bar finishes and
      // the main thread is idle — keeps them out of the boot critical path.
      scheduleIdle(() => {
        for (const path of IDLE_VIDEO_ASSETS) {
          preloadVideo(prependBaseUrl(path))
        }
      })
    }
  }

  /** Load a set of .ogg voice-over clips on demand; resolves once all are ready. */
  const preloadVoiceLines = async (paths: string[]): Promise<void> => {
    const entries: AssetEntry[] = paths
      .map(p => ({ src: prependBaseUrl(p), type: 'audio' as const }))
      .filter(e => !resourceCache.audio.has(e.src))
    if (entries.length === 0) return
    await runInChunks(entries, 4)
  }

  return {
    loadingProgress,
    areAllAssetsLoaded,
    preloadAssets,
    preloadVoiceLines,
    resourceCache
  }
}
