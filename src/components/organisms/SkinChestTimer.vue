<script setup lang="ts">
import { computed } from 'vue'
import {
  collectSkinChest,
  skinChestCooldownPct,
  skinChestHasRewards,
  skinChestIconSkin,
  skinChestReady,
  skinChestTimeDisplay,
  type GrantedSkin
} from '@/use/useSkinChest'
import { modelImgPath } from '@/use/useModels'
import useSounds from '@/use/useSound'

const emit = defineEmits<{
  (e: 'collected', granted: GrantedSkin): void
}>()

const iconSrc = computed(() => modelImgPath(skinChestIconSkin.value))

const onClick = () => {
  if (!skinChestReady.value) return
  const granted = collectSkinChest()
  if (!granted) return
  const { playSound } = useSounds()
  playSound('happy')
  emit('collected', granted)
}
</script>

<template lang="pug">
  div.flex.flex-row.items-center.gap-1.pointer-events-auto(
    v-if="skinChestHasRewards"
    @click="onClick"
    :class="skinChestReady ? 'cursor-pointer skin-chest-pulse' : ''"
  )
    span.game-text.text-white.font-bold(class="text-[10px] sm:text-xs") {{ skinChestTimeDisplay }}
    div.relative(class="w-6 h-6 sm:w-8 sm:h-8")
      img.object-contain.w-full.h-full.rounded-full(
        :src="iconSrc"
        alt="skin-chest-preview"
        :style="skinChestReady ? { filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.95))' } : undefined"
      )
      //- Circular cooldown overlay, matches the TreasureChest style
      svg.absolute.inset-0.w-full.h-full(
        v-if="!skinChestReady"
        viewBox="0 0 40 40"
        style="transform: rotate(-90deg) scaleX(-1)"
      )
        circle(
          cx="20" cy="20" r="19"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          stroke-width="40"
          :stroke-dasharray="119.38"
          :stroke-dashoffset="119.38 * (1 - skinChestCooldownPct)"
        )
</template>

<style scoped lang="sass">
.skin-chest-pulse
  animation: skin-chest-pulse 2s ease-in-out infinite

@keyframes skin-chest-pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.55
</style>
