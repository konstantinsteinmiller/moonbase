import { watch, type Ref, ref, onUnmounted, type ComputedRef } from 'vue'
import type { GameCard, BoardSlot, GameTurn } from '@/types/game'
import { type Difficulties, DIFFICULTY } from '@/utils/enums'

// Vite way to import a web worker
import NPCWorker from '@/use/npc.worker?worker'

export const useNPC = (
  turn: Ref<GameTurn>,
  npcHand: Ref<GameCard[]>,
  board: Ref<BoardSlot[][]>,
  placeCard: (card: GameCard, x: number, y: number) => void,
  difficulty: Ref<Difficulties>,
  playerHand: Ref<GameCard[]>,
  isInitialDialogueDone: Ref<boolean>,
  hasWonAnyGame: ComputedRef<boolean>
) => {


  return {}
}