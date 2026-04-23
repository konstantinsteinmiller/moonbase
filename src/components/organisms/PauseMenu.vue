<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSwitch from '@/components/atoms/FSwitch.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import useUser from '@/use/useUser'
import useInputMap, {
  captureNextKey,
  cancelCapture,
  prettyKey,
  type GameAction
} from '@/use/useInputMap'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'quit'): void
}>()

const { t } = useI18n()
const { bindings, rebind, resetBindings } = useInputMap()
const {
  userSoundVolume,
  userMusicVolume,
  userMouseSensitivity,
  userInvertY,
  setSettingValue
} = useUser()

const currentTab = ref('pause')
const tabs = computed(() => [
  { value: 'pause', label: t('paused') },
  { value: 'controls', label: t('controls') },
  { value: 'audio', label: t('audio') }
])

const actionLabels: Record<GameAction, string> = {
  forward: 'Move Forward',
  backward: 'Move Backward',
  strafeLeft: 'Turn / Lean Left',
  strafeRight: 'Turn / Lean Right',
  interact: 'Interact',
  flamethrower: 'Flamethrower',
  craft: 'Crafting Menu',
  pause: 'Pause',
  sprint: 'Sprint',
  screenshot: 'Cinematic Camera'
}

const rebinding = ref<GameAction | null>(null)

const actionKeys = computed(() => Object.keys(bindings) as GameAction[])

const startRebind = (action: GameAction) => {
  rebinding.value = action
  captureNextKey(code => {
    rebind(action, code)
    rebinding.value = null
  })
}

const cancelRebind = () => {
  cancelCapture()
  rebinding.value = null
}
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t('paused')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    //- PAUSE TAB ------------------------------------------------------
    div(v-if="currentTab === 'pause'" class="flex flex-col gap-3 py-4")
      p.text-sm.uppercase.tracking-widest(class="text-white/70") {{ t('pausedHint') }}
      div.flex.flex-col.gap-3.items-center
        FButton(type="primary" @click="emit('close')") {{ t('resume') }}
        FButton(type="secondary" @click="currentTab = 'controls'") {{ t('controls') }}
        FButton(type="secondary" @click="currentTab = 'audio'") {{ t('audio') }}
        FButton(type="secondary" @click="emit('quit')") {{ t('quit') }}

    //- CONTROLS TAB --------------------------------------------------
    div(v-else-if="currentTab === 'controls'" class="flex flex-col gap-3 py-2")
      div.rebind-list(class="flex flex-col gap-2 max-h-[50vh] overflow-y-auto px-2")
        div.rebind-row(
          v-for="action in actionKeys"
          :key="action"
          class="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2"
        )
          span.text-sm(class="text-white/80") {{ actionLabels[action] }}
          button.key-pill(
            class="min-w-[96px] rounded-md border border-white/20 bg-[#0f1a30] px-3 py-1 text-sm font-bold uppercase tracking-widest text-[#ffcd00] hover:bg-[#1a2b4b] transition"
            :class="{ '!bg-[#f7a000] !text-black animate-pulse': rebinding === action }"
            @click="rebinding === action ? cancelRebind() : startRebind(action)"
          )
            template(v-if="rebinding === action") {{ t('pressAnyKey') }}
            template(v-else) {{ prettyKey(bindings[action]) }}
      div.flex.justify-center.gap-3.mt-2
        FButton(type="secondary" size="sm" @click="resetBindings") {{ t('reset') }}

    //- AUDIO / SETTINGS TAB -----------------------------------------
    div(v-else-if="currentTab === 'audio'" class="flex flex-col gap-3 items-center py-2")
      FSlider.px-4(class="!py-1 !max-w-[300px]"
        :model-value="userSoundVolume"
        :label="t('soundEffects')"
        :min="0" :max="1" :step="0.01"
        @update:modelValue="setSettingValue('sound', $event)")
      FSlider.px-4(class="!py-1 !max-w-[300px]"
        :model-value="userMusicVolume"
        :label="t('music')"
        :min="0" :max="1" :step="0.01"
        @update:modelValue="setSettingValue('music', $event)")
      FSlider.px-4(class="!py-1 !max-w-[300px]"
        :model-value="userMouseSensitivity"
        :label="t('mouseSensitivity')"
        :min="0.05" :max="2" :step="0.05"
        @update:modelValue="setSettingValue('mouseSensitivity', $event)")
      div.flex.items-center.gap-4.py-2
        FSwitch(
          :model-value="userInvertY"
          @update:model-value="setSettingValue('invertY', $event)"
        ) {{ t('invertY') }}
      div.flex.items-center.gap-3.py-1
        FMuteButton
        span.text-sm(class="text-white/70") {{ t('muteAll') }}
</template>

<i18n lang="yaml">
en:
  paused: "Paused"
  pausedHint: "Game paused. Your robot is also paused."
  resume: "Resume"
  controls: "Controls"
  audio: "Audio"
  quit: "Quit to Menu"
  reset: "Reset to defaults"
  pressAnyKey: "Press a key…"
  soundEffects: "Sound FX"
  music: "Music"
  mouseSensitivity: "Mouse Sensitivity"
  invertY: "Invert Y"
  muteAll: "Mute all audio"
de:
  paused: "Pause"
  pausedHint: "Spiel pausiert. Der Roboter auch."
  resume: "Weiter"
  controls: "Steuerung"
  audio: "Audio"
  quit: "Zum Menü"
  reset: "Zurücksetzen"
  pressAnyKey: "Taste drücken…"
  soundEffects: "Soundeffekte"
  music: "Musik"
  mouseSensitivity: "Maus-Empfindlichkeit"
  invertY: "Y invertieren"
  muteAll: "Alles stummschalten"
fr:
  paused: "Pause"
  pausedHint: "Jeu en pause. Le robot aussi."
  resume: "Reprendre"
  controls: "Contrôles"
  audio: "Audio"
  quit: "Quitter"
  reset: "Réinitialiser"
  pressAnyKey: "Appuyez sur une touche…"
  soundEffects: "Effets Sonores"
  music: "Musique"
  mouseSensitivity: "Sensibilité Souris"
  invertY: "Inverser Y"
  muteAll: "Tout couper"
es:
  paused: "Pausa"
  pausedHint: "Juego pausado. El robot también."
  resume: "Reanudar"
  controls: "Controles"
  audio: "Audio"
  quit: "Salir"
  reset: "Restablecer"
  pressAnyKey: "Pulsa una tecla…"
  soundEffects: "Efectos"
  music: "Música"
  mouseSensitivity: "Sensibilidad"
  invertY: "Invertir Y"
  muteAll: "Silenciar todo"
ru:
  paused: "Пауза"
  pausedHint: "Игра на паузе. Робот тоже отдыхает."
  resume: "Продолжить"
  controls: "Управление"
  audio: "Звук"
  quit: "Выход"
  reset: "Сброс"
  pressAnyKey: "Нажмите клавишу…"
  soundEffects: "Эффекты"
  music: "Музыка"
  mouseSensitivity: "Чувствительность"
  invertY: "Инверт. Y"
  muteAll: "Выключить звук"
</i18n>
