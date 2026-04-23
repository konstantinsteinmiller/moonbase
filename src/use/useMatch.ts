import { ref, computed, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import useSound from '@/use/useSound.ts'

const debugSaved = localStorage.getItem('debug') || 'false'
export const isDebug = ref(!!JSON.parse(debugSaved))
export const isCrazyGamesFullRelease = import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'

export const isDbInitialized = ref<boolean>(false)

export const useMatch = () => {
  return {}
}

export default useMatch