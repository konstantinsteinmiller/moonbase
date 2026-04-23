<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSounds from '@/use/useSound.ts'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'

interface Props {
  /** Element where the coin explosion VFX should fly to (e.g. the coin badge). */
  targetEl?: HTMLElement | null
  /** Cooldown in ms. Default 10 minutes. */
  cooldownMs?: number
  /** localStorage key for the cooldown timestamp. */
  storageKey?: string
  /** Coins awarded on collection. */
  reward?: number
  /** Visual scale factor (1 = default size). */
  scale?: number
  /** Aura color when ready. Default gold. */
  auraColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  targetEl: null,
  cooldownMs: 10 * 60 * 1000,
  storageKey: 'spinner_chest_ready_at',
  reward: 80,
  scale: 1,
  auraColor: 'rgba(255,200,0,0.8)'
})

const { addCoins } = useSpinnerConfig()

// ─── Cooldown State ──────────────────────────────────────────────────────────

const CHEST_COOLDOWN_MS = props.cooldownMs
const CHEST_KEY = props.storageKey
const CHEST_REWARD = props.reward

const chestReadyAt = ref(parseInt(localStorage.getItem(CHEST_KEY) || '0', 10))
const chestRemaining = ref(0)
let chestIntervalId: number | null = null

const chestReady = computed(() => chestRemaining.value <= 0)

const updateChestTimer = () => {
  // Re-read from localStorage so external resets (cheats) are picked up
  chestReadyAt.value = parseInt(localStorage.getItem(CHEST_KEY) || '0', 10)
  const now = Date.now()
  chestRemaining.value = Math.max(0, chestReadyAt.value - now)
}

const chestTimeDisplay = computed(() => {
  const totalSec = Math.ceil(chestRemaining.value / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const chestCooldownPct = computed(() =>
  chestRemaining.value / CHEST_COOLDOWN_MS
)

// ─── Coin Explosion VFX ──────────────────────────────────────────────────────

const chestRef = ref<HTMLElement | null>(null)

const collectChest = () => {
  if (!chestReady.value) return
  // Set cooldown FIRST so a thrown error can't leave the chest infinitely collectable
  chestReadyAt.value = Date.now() + CHEST_COOLDOWN_MS
  localStorage.setItem(CHEST_KEY, chestReadyAt.value.toString())
  updateChestTimer()
  addCoins(CHEST_REWARD)
  const { playSound } = useSounds()
  playSound('happy')
  if (chestRef.value && props.targetEl) {
    spawnCoinExplosion({ sourceEl: chestRef.value, targetEl: props.targetEl })
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  updateChestTimer()
  chestIntervalId = window.setInterval(updateChestTimer, 1000)
})

onUnmounted(() => {
  if (chestIntervalId !== null) clearInterval(chestIntervalId)
})
</script>

<template lang="pug">
  div.flex.flex-col.items-center.pointer-events-auto(
    @click="collectChest"
    :class="chestReady ? 'cursor-pointer chest-pulse' : ''"
    :style="scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'center' } : undefined"
  )
    div.relative(ref="chestRef" class="w-10 h-10 sm:w-12 sm:h-12")
      img.object-contain.w-full.h-full(
        src="/images/icons/chest_128x128.webp"
        :style="chestReady ? { filter: `drop-shadow(0 0 8px ${auraColor})` } : undefined"
      )
      //- Circular cooldown overlay
      svg.absolute.inset-0.w-full.h-full(
        v-if="!chestReady"
        viewBox="0 0 40 40"
        style="transform: rotate(-90deg) scaleX(-1)"
      )
        circle(
          cx="20" cy="20" r="19"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          stroke-width="40"
          :stroke-dasharray="119.38"
          :stroke-dashoffset="119.38 * (1 - chestCooldownPct)"
        )
    span.game-text.text-white.font-bold(
      class="text-[10px] sm:text-xs"
    ) {{ chestTimeDisplay }}
</template>

<style scoped lang="sass">
.chest-pulse
  animation: chest-pulse 2s ease-in-out infinite

@keyframes chest-pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.5
</style>
