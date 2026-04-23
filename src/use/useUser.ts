import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import {
  GAME_USER_LANGUAGE,
  GAME_USER_SOUND_VOLUME,
  GAME_USER_MUSIC_VOLUME,
  GAME_USER_MOUSE_SENSITIVITY,
  GAME_USER_INVERT_Y
} from '@/utils/constants'
import { mobileCheck } from '@/utils/function'

export const windowWidth = ref(window.innerWidth)
export const windowHeight = ref(window.innerHeight)
export const orientation = ref(mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait')

export const isMobileLandscape = computed(() =>
  mobileCheck() && windowWidth.value > 500 && orientation.value === 'landscape'
)
export const isMobilePortrait = computed(() =>
  mobileCheck() && windowWidth.value <= 500
)

declare const APP_VERSION: string
export const version: string = APP_VERSION

export const isNative = import.meta.env.VITE_APP_NATIVE === 'true'
export const isWeb = import.meta.env.VITE_APP_NATIVE !== 'true'

// crazygames/wavedash/itch flags are stubbed false — this build targets
// desktop web only, but App.vue still imports these names so we keep them.
export const isCrazyWeb = false
export const isWaveDash = false
export const isItch = false
export const isDemo = false

const readNumber = (key: string, fallback: number) => {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

const readString = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

const readBool = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    return v === 'true'
  } catch {
    return fallback
  }
}

const userSoundVolume: Ref<number> = ref(readNumber(GAME_USER_SOUND_VOLUME, 0.7))
const userMusicVolume: Ref<number> = ref(readNumber(GAME_USER_MUSIC_VOLUME, 0.5))
const userLanguage: Ref<string> = ref(readString(GAME_USER_LANGUAGE, 'en'))
const userMouseSensitivity: Ref<number> = ref(readNumber(GAME_USER_MOUSE_SENSITIVITY, 0.5))
const userInvertY: Ref<boolean> = ref(readBool(GAME_USER_INVERT_Y, false))
const isOptionsModalOpen: Ref<boolean> = ref(false)
const isPauseMenuOpen: Ref<boolean> = ref(false)

watch(userSoundVolume, v => {
  try {
    localStorage.setItem(GAME_USER_SOUND_VOLUME, String(v))
  } catch {
  }
})
watch(userMusicVolume, v => {
  try {
    localStorage.setItem(GAME_USER_MUSIC_VOLUME, String(v))
  } catch {
  }
})
watch(userLanguage, v => {
  try {
    localStorage.setItem(GAME_USER_LANGUAGE, v)
    sessionStorage.setItem(GAME_USER_LANGUAGE, v)
  } catch {
  }
})
watch(userMouseSensitivity, v => {
  try {
    localStorage.setItem(GAME_USER_MOUSE_SENSITIVITY, String(v))
  } catch {
  }
})
watch(userInvertY, v => {
  try {
    localStorage.setItem(GAME_USER_INVERT_Y, String(v))
  } catch {
  }
})

const useUser = () => {
  const setSettingValue = (name: string, value: any) => {
    switch (name) {
      case 'sound':
        userSoundVolume.value = value
        break
      case 'music':
        userMusicVolume.value = value
        break
      case 'language':
        userLanguage.value = value
        break
      case 'mouseSensitivity':
        userMouseSensitivity.value = value
        break
      case 'invertY':
        userInvertY.value = value
        break
    }
  }

  return {
    userSoundVolume,
    userMusicVolume,
    userLanguage,
    userMouseSensitivity,
    userInvertY,
    setSettingValue,
    isOptionsModalOpen,
    isPauseMenuOpen
  }
}

export default useUser
