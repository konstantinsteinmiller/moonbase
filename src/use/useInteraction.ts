import { ref, type Ref } from 'vue'
import type { GameCard } from '@/types/game'

export const useInteraction = (
  playerHand: Ref<GameCard[]>,
  placeCard: (card: GameCard, x: number, y: number) => boolean
) => {
  const selectedCardId = ref<string | null>(null)
  const errorSlot = ref<{ x: number, y: number } | null>(null)

  const triggerError = (x: number, y: number) => {
    errorSlot.value = { x, y }
    setTimeout(() => {
      errorSlot.value = null
    }, 500)
  }

  const handleDragStart = (event: DragEvent, cardInstanceId: string) => {
    if (event.dataTransfer) {
      event.dataTransfer.setData('cardInstanceId', cardInstanceId)
      event.dataTransfer.dropEffect = 'move'
    }
    selectedCardId.value = cardInstanceId
  }

  const handleDrop = (event: DragEvent, x: number, y: number) => {
    const instanceId = event.dataTransfer?.getData('cardInstanceId')
    if (!instanceId) return

    const card = playerHand.value.find((c) => c.instanceId === instanceId)
    if (card) {
      const success = placeCard(card, x, y)
      if (success) {
        selectedCardId.value = null
      } else {
        triggerError(x, y)
      }
    }
  }

  const handleTapSelect = (cardInstanceId: string) => {
    if (!cardInstanceId) return
    selectedCardId.value = selectedCardId.value === cardInstanceId ? null : cardInstanceId
  }

  const handleSlotTap = (x: number, y: number) => {
    if (!selectedCardId.value) return

    const card = playerHand.value.find((c) => c.instanceId === selectedCardId.value)
    if (card) {
      const success = placeCard(card, x, y)
      if (success) {
        selectedCardId.value = null
      } else {
        triggerError(x, y)
      }
    }
  }

  return {
    selectedCardId,
    errorSlot,
    handleDragStart,
    handleDrop,
    handleTapSelect,
    handleSlotTap
  }
}