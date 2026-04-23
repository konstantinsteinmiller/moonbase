<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import useMission from '@/use/useMission'

const { currentLine, isAwaitingChoice, pickChoice, advanceLine, skipDialog } = useMission()

const speakerLabel = computed(() => {
  switch (currentLine.value?.speaker) {
    case 'tusk':
      return 'Ekon Tusk'
    case 'ewall':
      return 'Ewall'
    case 'ewall9':
      return 'Ewall-9'
    case 'system':
      return 'SYSTEM'
    default:
      return ''
  }
})

const speakerClass = computed(() => {
  switch (currentLine.value?.speaker) {
    case 'tusk':
      return 'text-[#f7a000]'
    case 'ewall':
      return 'text-white'
    case 'ewall9':
      return 'text-emerald-300'
    case 'system':
      return 'text-cyan-300'
    default:
      return 'text-white'
  }
})

const lineTextClass = computed(() => {
  switch (currentLine.value?.speaker) {
    case 'tusk':
      return 'text-[#ffe3a8]'
    case 'ewall':
      return 'text-white/90 italic'
    case 'ewall9':
      return 'text-emerald-100/90 italic'
    case 'system':
      return 'text-cyan-200'
    default:
      return 'text-white/90'
  }
})

const handleKey = (e: KeyboardEvent) => {
  if (!currentLine.value) return
  if (isAwaitingChoice.value) {
    const n = Number(e.key)
    if (Number.isFinite(n) && n >= 1 && n <= (currentLine.value.choices?.length ?? 0)) {
      const c = currentLine.value.choices![n - 1]
      if (c) pickChoice(c.id)
    }
    return
  }
  if (e.code === 'Space') advanceLine()
  if (e.code === 'Escape') skipDialog()
}

onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<template lang="pug">
  Transition(name="dialog-fade")
    div.dialog-banner(v-if="currentLine"
      class="pointer-events-none fixed inset-x-0 bottom-12 z-30 flex justify-center px-4")
      div.dialog-card(
        class="pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md px-6 py-4 shadow-2xl")
        div.speaker.mb-2.text-sm.font-bold.uppercase.tracking-widest(
          :class="speakerClass"
        ) {{ speakerLabel }}
        div.text.font-medium.leading-relaxed(
          class="text-base md:text-lg"
          :class="lineTextClass"
        ) {{ currentLine.text }}
        div.choices.mt-3.flex.flex-col.gap-2(v-if="isAwaitingChoice")
          button.choice(
            v-for="(c, i) in currentLine.choices"
            :key="c.id"
            class="w-full text-left rounded-lg border border-white/20 bg-white/5 hover:bg-[#f7a000]/30 px-3 py-2 text-sm md:text-base text-white transition"
            @click="pickChoice(c.id)"
          )
            span.mr-2.opacity-60 [{{ i + 1 }}]
            span {{ c.text }}
        div.hint.mt-2.text-xs.opacity-50(v-else) Press SPACE to continue · ESC to skip
</template>

<style scoped lang="sass">
.dialog-fade-enter-active, .dialog-fade-leave-active
  transition: opacity 220ms ease, transform 220ms ease

.dialog-fade-enter-from, .dialog-fade-leave-to
  opacity: 0
  transform: translateY(12px)
</style>
