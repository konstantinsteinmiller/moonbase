<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import { activeNode, type CampaignNode, useCampaign } from '@/use/useCampaign'
import {} from '@/use/useMatch.ts'

const originalNpcHand = ref<{ id: string }[]>([])

const props = defineProps<{
  isOpen: boolean
  isBoardFull: boolean
  scores: { player: number; npc: number },
  completeNode: (activeNode: any) => void,
  saveCampaign: (activeNode: any) => void
}>()

const emit = defineEmits<{
  (e: 'reset'): void
}>()

const router = useRouter()
const { t } = useI18n()

const areKnownCardsSaved = ref<boolean>(false)

const result = computed((): 'win' | 'lose' | 'draw' => {
  if (props.scores.player > props.scores.npc) return 'win'
  if (props.scores.npc > props.scores.player) return 'lose'
  return 'draw'
})

watch(() => props.isBoardFull, () => {
  if (!activeNode?.value || !props.isBoardFull) return

  if (result.value === 'win') {
    //set known cards for active node from the dealt npc deck
    activeNode.value.knownCards = [...new Set([
      ...(JSON.parse(JSON.stringify(activeNode.value.knownCards)) ?? []),
      ...originalNpcHand.value.map((c: { id: string }) => c.id)
    ])]
    props.completeNode(JSON.parse(JSON.stringify(activeNode.value)))
  }

  if (areKnownCardsSaved.value) return
  //set known cards for active node from the dealt npc deck
  activeNode.value.knownCards = [...new Set([
    ...(JSON.parse(JSON.stringify(activeNode.value.knownCards)) ?? []),
    ...originalNpcHand.value.map((c: { id: string }) => c.id)
  ])]
  props.saveCampaign(JSON.parse(JSON.stringify(activeNode.value)))

  areKnownCardsSaved.value = true
})

const onContinue = () => {
  if (!activeNode?.value) {
    emit('reset')
    return
  }
  emit('reset')
  router.push({ name: 'campaign' })
}

const onBackToMenu = () => {
  emit('reset')
  router.push({ name: 'main-menu' })
}

onMounted(() => {
  areKnownCardsSaved.value = false
})
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t(result)"
  )
    //- Score Display
    div(class="flex items-center justify-center gap-6 my-6 sm:my-3")
      div.flex.flex-col.items-center(class="")
        span.text-red-500.text-2xl.font-bold(class="") {{ scores.npc }}

      div(class="text-2xl italic text-slate-500 font-black") {{ t('vs') }}

      div.flex.flex-col.items-center(class="")
        span.text-blue-500.text-2xl.font-bold(class="") {{ scores.player }}

    //- Action Buttons in Footer Slot
    template(#footer)
      div(class="flex flex-col gap-2 w-full max-w-[280px] text-sm md:text-xl sm:gap-1")
        FButton(@click="onContinue") {{ t('continue') }}
        FButton(
          type="secondary"
          @click="onBackToMenu"
        ) {{ t('backToMainMenu') }}
</template>

<i18n>
en:
  win: "Victory"
  lose: "Defeat"
  draw: "Draw"
  continue: "Continue"
  playAgain: "Play Again"
  backToMainMenu: "Back to Main Menu"
de:
  win: "Sieg"
  lose: "Niederlage"
  draw: "Unentschieden"
  continue: "Weiter"
  playAgain: "Nochmal spielen"
  backToMainMenu: "Zurück zum Hauptmenü"
fr:
  win: "Victoire"
  lose: "Défaite"
  draw: "Égalité"
  continue: "Continuer"
  playAgain: "Rejouer"
  backToMainMenu: "Retour au menu principal"
es:
  win: "Victoria"
  lose: "Derrota"
  draw: "Empate"
  continue: "Continuar"
  playAgain: "Jugar de nuevo"
  backToMainMenu: "Volver al menú principal"
jp:
  win: "勝利"
  lose: "敗北"
  draw: "引き分け"
  continue: "次へ"
  playAgain: "もう一度プレイ"
  backToMainMenu: "メインメニューに戻る"
kr:
  win: "승리"
  lose: "패배"
  draw: "무승부"
  continue: "계속하기"
  playAgain: "다시 플레이"
  backToMainMenu: "메인 메뉴로 돌아가기"
zh:
  win: "胜利"
  lose: "失败"
  draw: "平局"
  continue: "继续"
  playAgain: "再玩一次"
  backToMainMenu: "返回主菜单"
ru:
  win: "Победа"
  lose: "Поражение"
  draw: "Ничья"
  continue: "Продолжить"
  playAgain: "Играть снова"
  backToMainMenu: "В главное меню"
</i18n>