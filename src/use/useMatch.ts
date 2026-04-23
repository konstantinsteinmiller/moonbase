import { ref, computed, type ComputedRef } from 'vue'
import useModels, { modelImgPath } from '@/use/useModels'
import { useRouter } from 'vue-router'
import type { CampaignNode } from '@/use/useCampaign'
import useSound from '@/use/useSound.ts'

const debugSaved = localStorage.getItem('debug') || 'false'
const campaignTestSaved = localStorage.getItem('campaign-test') || 'false'
export const isDebug = ref(!!JSON.parse(debugSaved))
export const isCrazyGamesFullRelease = import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'
export const isCampaignTest = ref(!!JSON.parse(campaignTestSaved))

export const isSplashScreenVisible = ref<boolean>(false)
export const isDbInitialized = ref<boolean>(false)

export const useMatch = () => {
  const turn = ref<'player' | 'npc'>('player')
  const isThinking = ref(false)
  const {} = useModels()
  const router = useRouter()
  const { playSound } = useSound()

  const resetGame = () => {
  }

  return {
    turn,
    resetGame,
    isThinking
  }
}

export default useMatch