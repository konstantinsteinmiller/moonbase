import { prependBaseUrl } from '@/utils/function'
import useUser from '@/use/useUser'
import { resourceCache } from '@/use/useAssets'

import { ref, onMounted, watch, onUnmounted } from 'vue'

// We keep the audio instance outside the hook so it's a true Singleton
const bgMusic = ref<HTMLAudioElement | null>(null)
const isLoaded = ref(false)
const isPlaying = ref(false)
// Tracks whether music is *meant* to be playing right now (i.e. a battle is
// in progress). Used so visibility-change resume only un-pauses when there's
// actually a battle running.
const shouldPlay = ref(false)

export const useMusic = () => {
  const { userMusicVolume } = useUser()

  watch(userMusicVolume, () => {
    if (!bgMusic.value) return
    bgMusic.value.volume = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.025))
  })

  const pauseMusic = () => {
    if (bgMusic.value) {
      bgMusic.value.pause()
      isPlaying.value = false
    }
  }

  const continueMusic = () => {
    if (bgMusic.value && shouldPlay.value) {
      playWithFade()
    }
  }

  const initMusic = () => {
    onMounted(() => {
      if (bgMusic.value) return // Already initialized
      const audio = new Audio()
      audio.loop = true
      audio.volume = 0
      audio.preload = 'auto'
      bgMusic.value = audio
    })
    onUnmounted(() => {
      bgMusic.value?.pause()
      bgMusic.value?.removeAttribute('src')
      bgMusic.value = null
      shouldPlay.value = false
      isPlaying.value = false
      isLoaded.value = false
    })
  }

  const startBattleMusic = () => {
    if (!bgMusic.value) return
    // Already playing a battle track — leave it alone so we don't restart
    // mid-fight on extra calls.
    if (shouldPlay.value && isPlaying.value) return
    shouldPlay.value = true
    const idx = Math.floor(Math.random() * 3) + 1
    const filename = `battle-${idx}.ogg`
    const src = prependBaseUrl('audio/music/' + filename)
    const cached = resourceCache.audio.get(src)

    bgMusic.value.pause()
    bgMusic.value.volume = 0

    if (cached) {
      // Use preloaded audio — already decoded, skip network fetch
      bgMusic.value.src = cached.src
      isLoaded.value = true
      playWithFade()
    } else {
      bgMusic.value.src = src
      bgMusic.value.load()
      bgMusic.value.addEventListener('canplaythrough', () => {
        isLoaded.value = true
        playWithFade()
      }, { once: true })
    }
  }

  const stopBattleMusic = () => {
    shouldPlay.value = false
    if (!bgMusic.value) return
    fadeOut(() => {
      bgMusic.value?.pause()
      isPlaying.value = false
    })
  }

  const playWithFade = () => {
    if (!bgMusic.value) return

    // Browsers block autoplay until user interaction
    bgMusic.value.play().then(() => {
      isPlaying.value = true
      fadeIn()
    }).catch(() => {
      // Attach a one-time listener to the window to play on first click
      window.addEventListener('click', () => {
        if (!isPlaying.value && shouldPlay.value) playWithFade()
      }, { once: true })
    })
  }

  const fadeIn = () => {
    if (!bgMusic.value) return
    let vol = 0
    const target = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.6) * 0.025))
    const interval = setInterval(() => {
      if (!bgMusic.value || !shouldPlay.value) {
        clearInterval(interval)
        return
      }
      if (vol < target) {
        vol += 0.005
        bgMusic.value.volume = Math.min(vol, target)
      } else {
        clearInterval(interval)
      }
    }, 50)
  }

  const fadeOut = (onDone?: () => void) => {
    if (!bgMusic.value) {
      onDone?.()
      return
    }
    const interval = setInterval(() => {
      if (!bgMusic.value) {
        clearInterval(interval)
        onDone?.()
        return
      }
      const v = bgMusic.value.volume
      if (v > 0.005) {
        bgMusic.value.volume = Math.max(0, v - 0.005)
      } else {
        bgMusic.value.volume = 0
        clearInterval(interval)
        onDone?.()
      }
    }, 50)
  }


  return { initMusic, isLoaded, isPlaying, pauseMusic, continueMusic, startBattleMusic, stopBattleMusic }
}

const useSounds = () => {
  const { userSoundVolume } = useUser()

  const playSound = (effect: string, ratio = 0.025) => {
    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)
    const cached = resourceCache.audio.get(src)
    // Clone from preloaded cache to avoid re-decoding; fall back to new Audio
    const audio = cached
      ? cached.cloneNode(false) as HTMLAudioElement
      : new Audio(src)
    // iOS requires volume to be set BEFORE play().
    // Clamp to [0,1] — Firefox throws DOMException if volume is NaN or out of range
    // (can happen when userSoundVolume hasn't loaded from IndexedDB yet).
    audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * ratio))
    audio.play().catch(e => {/*console.warn('SFX play blocked:', e)*/
    })
    return audio
  }

  return {
    playSound
  }
}

export default useSounds

