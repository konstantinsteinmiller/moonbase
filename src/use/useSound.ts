import { ref, onMounted, onUnmounted, watch } from 'vue'
import useUser from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'

const bgMusic = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const shouldPlay = ref(false)

export const useMusic = () => {
  const { userMusicVolume } = useUser()

  watch(userMusicVolume, () => {
    if (!bgMusic.value) return
    bgMusic.value.volume = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.5) * 0.15))
  })

  const pauseMusic = () => {
    if (bgMusic.value) {
      bgMusic.value.pause()
      isPlaying.value = false
    }
  }

  const continueMusic = () => {
    if (bgMusic.value && shouldPlay.value) playWithFade()
  }

  const initMusic = () => {
    onMounted(() => {
      if (bgMusic.value) return
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
    })
  }

  const startAmbient = () => {
    if (!bgMusic.value) return
    if (shouldPlay.value && isPlaying.value) return
    shouldPlay.value = true
    const src = prependBaseUrl('audio/music/ambient-moon.ogg')
    const cached = resourceCache.audio.get(src)
    bgMusic.value.pause()
    bgMusic.value.volume = 0
    if (cached) {
      bgMusic.value.src = cached.src
      playWithFade()
    } else {
      bgMusic.value.src = src
      bgMusic.value.load()
      bgMusic.value.addEventListener('canplaythrough', () => playWithFade(), { once: true })
    }
  }

  const stopAmbient = () => {
    shouldPlay.value = false
    if (!bgMusic.value) return
    fadeOut(() => {
      bgMusic.value?.pause()
      isPlaying.value = false
    })
  }

  const playWithFade = () => {
    if (!bgMusic.value) return
    bgMusic.value.play().then(() => {
      isPlaying.value = true
      fadeIn()
    }).catch(() => {
      window.addEventListener('click', () => {
        if (!isPlaying.value && shouldPlay.value) playWithFade()
      }, { once: true })
    })
  }

  const fadeIn = () => {
    if (!bgMusic.value) return
    let vol = 0
    const target = Math.max(0, Math.min(1, (userMusicVolume.value ?? 0.5) * 0.15))
    const interval = setInterval(() => {
      if (!bgMusic.value || !shouldPlay.value) {
        clearInterval(interval)
        return
      }
      if (vol < target) {
        vol += 0.01
        bgMusic.value.volume = Math.min(vol, target)
      } else {
        clearInterval(interval)
      }
    }, 40)
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
      if (v > 0.01) {
        bgMusic.value.volume = Math.max(0, v - 0.01)
      } else {
        bgMusic.value.volume = 0
        clearInterval(interval)
        onDone?.()
      }
    }, 40)
  }

  return { initMusic, isPlaying, pauseMusic, continueMusic, startAmbient, stopAmbient }
}

const useSounds = () => {
  const { userSoundVolume } = useUser()

  const playSound = (effect: string, ratio = 0.8) => {
    const src = prependBaseUrl(`audio/sfx/${effect}.ogg`)
    const cached = resourceCache.audio.get(src)
    const audio = cached
      ? cached.cloneNode(false) as HTMLAudioElement
      : new Audio(src)
    audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * ratio))
    audio.play().catch(() => {/* ignored — first-gesture requirement */
    })
    return audio
  }

  return { playSound }
}

export default useSounds
