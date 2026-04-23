<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSwitch from '@/components/atoms/FSwitch.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { LANGUAGES } from '@/utils/enums'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const { locale }: any = useI18n({ useScope: 'global' })
const appI18n: any = (window as any).__i18n

const {
  setSettingValue,
  userLanguage,
  userSoundVolume,
  userMusicVolume,
  userMouseSensitivity,
  userInvertY
} = useUser()

const currentTab = ref('general')

watch(userLanguage, async (newValue: string) => {
  if (appI18n) await setI18nLocale(appI18n, newValue)
  else locale.value = newValue
})

const tabs = computed(() => [
  { value: 'general', label: t('general') },
  { value: 'audio', label: t('audio') },
  { value: 'controls', label: t('controlsTab') }
])

const languagesList = computed(() =>
  LANGUAGES.map(lng => ({ value: lng, label: `${t(lng)} (${lng})` }))
)
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="false"
    :title="t('options')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    div(v-if="currentTab === 'general'")
      div(class="flex flex-col gap-2 p-2")
        div(class="z-[10] flex flex-col gap-2 scale-80 sm:scale-100")
          FSelect(
            class="!text-[10px] md:text-[12px]"
            :label="t('language')"
            :options="languagesList"
            :model-value="userLanguage"
            @update:model-value="setSettingValue('language', $event)"
          )

    div(v-else-if="currentTab === 'audio'").flex.flex-col.justify-between.items-center
      FSlider.px-4(class="!py-1 !pb-3 !max-w-[300px]" :model-value="userSoundVolume" @update:modelValue="setSettingValue('sound', $event)" :label="t('soundEffects')" :min="0" :max="1" :step="0.01")
      FSlider.px-4(class="!py-1 !pb-2 !max-w-[300px]" :model-value="userMusicVolume" @update:modelValue="setSettingValue('music', $event)" :label="t('music')" :min="0" :max="1" :step="0.01")

    div(v-else-if="currentTab === 'controls'").flex.flex-col.gap-2.items-center
      FSlider.px-4(class="!py-1 !max-w-[300px]" :model-value="userMouseSensitivity" @update:modelValue="setSettingValue('mouseSensitivity', $event)" :label="t('mouseSensitivity')" :min="0.05" :max="2" :step="0.05")
      div.flex.items-center.gap-4.py-2
        FSwitch(:model-value="userInvertY" @update:model-value="setSettingValue('invertY', $event)") {{ t('invertY') }}

    template(#footer)
      FButton.w-full(@click="emit('close')") {{ t('close') }}
</template>

<style lang="sass" scoped>
span
  text-shadow: 2px 2px 0 #000
</style>

<i18n lang="yaml">
en:
  options: "Options"
  general: "General"
  audio: "Audio"
  controlsTab: "Controls"
  language: "Language"
  close: "Save & Close"
  soundEffects: "Sound Effects"
  music: "Music"
  mouseSensitivity: "Mouse Sensitivity"
  invertY: "Invert Mouse Y"
  en: "English"
  de: "German"
  fr: "French"
  es: "Spanish"
  ru: "Russian"
de:
  options: "Optionen"
  general: "Allgemein"
  audio: "Audio"
  controlsTab: "Steuerung"
  language: "Sprache"
  close: "Speichern & Schließen"
  soundEffects: "Soundeffekte"
  music: "Musik"
  mouseSensitivity: "Maus-Empfindlichkeit"
  invertY: "Maus Y invertieren"
  en: "Englisch"
  de: "Deutsch"
  fr: "Französisch"
  es: "Spanisch"
  ru: "Russisch"
fr:
  options: "Options"
  general: "Général"
  audio: "Audio"
  controlsTab: "Contrôles"
  language: "Langue"
  close: "Sauvegarder et Fermer"
  soundEffects: "Effets Sonores"
  music: "Musique"
  mouseSensitivity: "Sensibilité Souris"
  invertY: "Inverser l'axe Y"
  en: "Anglais"
  de: "Allemand"
  fr: "Français"
  es: "Espagnol"
  ru: "Russe"
es:
  options: "Opciones"
  general: "General"
  audio: "Audio"
  controlsTab: "Controles"
  language: "Idioma"
  close: "Guardar y Cerrar"
  soundEffects: "Efectos de Sonido"
  music: "Música"
  mouseSensitivity: "Sensibilidad del Ratón"
  invertY: "Invertir Eje Y"
  en: "Inglés"
  de: "Alemán"
  fr: "Francés"
  es: "Español"
  ru: "Ruso"
ru:
  options: "Настройки"
  general: "Общее"
  audio: "Звук"
  controlsTab: "Управление"
  language: "Язык"
  close: "Сохранить и Закрыть"
  soundEffects: "Звуковые эффекты"
  music: "Музыка"
  mouseSensitivity: "Чувствительность мыши"
  invertY: "Инверт. Y"
  en: "Английский"
  de: "Немецкий"
  fr: "Французский"
  es: "Испанский"
  ru: "Русский"
</i18n>
