<script setup lang="ts">
import FButton from '@/components/atoms/FButton.vue'

/**
 * End-of-run screen. Shown when Ewall's solar cell has drained past zero,
 * or any future unrecoverable failure state. The "Continue" button emits
 * `continue` and the scene restores the post-meteor checkpoint — no
 * progress prior to the meteor strike is at risk.
 */

defineProps<{
  isOpen: boolean
  title?: string
  reason?: string
  /** True only if a checkpoint was actually captured. If false, the
   *  Continue button is hidden (there's nothing to resume). */
  canContinue: boolean
}>()

const emit = defineEmits<{ (e: 'continue'): void; (e: 'quit'): void }>()
</script>

<template lang="pug">
  Transition(name="go-fade")
    div.game-over(
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm pointer-events-auto"
    )
      div(class="w-full max-w-md rounded-3xl border-4 border-[#0f1a30] bg-[#1a2b4b] shadow-2xl overflow-hidden")
        div(class="bg-gradient-to-b from-red-500 to-red-700 px-6 py-4 border-b-4 border-[#0f1a30]")
          div(class="text-2xl font-black uppercase tracking-widest text-white text-center") {{ title ?? 'Chassis offline' }}
        div(class="p-6 flex flex-col gap-4 text-white")
          p(class="text-sm leading-relaxed text-white/80 text-center")
            | {{ reason ?? 'Energy reserves depleted. Ewall has gone dark on the regolith.' }}
          div(class="flex flex-col gap-2")
            FButton(
              v-if="canContinue"
              type="primary"
              @click="emit('continue')"
            ) Continue from last checkpoint
            FButton(
              type="secondary"
              @click="emit('quit')"
            ) Return to main menu
</template>

<style scoped lang="sass">
.go-fade-enter-active, .go-fade-leave-active
  transition: opacity 220ms ease

.go-fade-enter-from, .go-fade-leave-to
  opacity: 0
</style>
