<script setup lang="ts">
import { computed } from 'vue'
import useMission from '@/use/useMission'

interface Props {
  fuel: number          // 0..1
  energy: number        // 0..1
  oreCount: number
  metalCount: number
  partsCount?: number
  hasFlagSeen: boolean
  markerScreen: { x: number; y: number; visible: boolean; distance: number } | null
  /** Contextual interact prompt (e.g. "[E] to refuel"); null hides it. */
  interactPrompt?: string | null
  /** Screen-projected HP bars for quarry stones currently near the player.
   *  `hp` is 0..1; the bar renders red-orange and only shows while the
   *  player is inside the smelt range. */
  stoneBars?: { id: string; x: number; y: number; hp: number }[]
}

const props = defineProps<Props>()
const { missionBanner, objective, phase } = useMission()

const fuelPct = computed(() => Math.max(0, Math.min(1, props.fuel)) * 100)
const fuelBarClass = computed(() => {
  if (props.fuel > 0.5) return 'bg-gradient-to-r from-emerald-400 to-emerald-600'
  if (props.fuel > 0.2) return 'bg-gradient-to-r from-amber-300 to-amber-500'
  return 'bg-gradient-to-r from-red-400 to-red-600 animate-pulse'
})

const energyPct = computed(() => Math.max(0, Math.min(1, props.energy)) * 100)
const energyBarClass = computed(() => {
  if (props.energy > 0.4) return 'bg-gradient-to-r from-sky-400 to-blue-600'
  if (props.energy > 0.15) return 'bg-gradient-to-r from-cyan-300 to-sky-500 animate-pulse'
  return 'bg-gradient-to-r from-indigo-400 to-blue-700 animate-pulse'
})
</script>

<template lang="pug">
  div.mission-hud.pointer-events-none.fixed.inset-0.z-20
    //- Top: Mission banner (temporary announcement) + persistent objective.
    div.absolute.top-12.inset-x-0.flex.flex-col.items-center.gap-2
      Transition(name="banner")
        div.banner(
          v-if="missionBanner"
          class="rounded-full border border-[#f7a000]/40 bg-black/75 px-6 py-2 text-[#ffcd00] font-black uppercase tracking-widest text-sm shadow-lg"
        ) {{ missionBanner }}
      div.objective(
        class="rounded-full bg-black/55 border border-white/10 px-4 py-1 text-xs uppercase tracking-wider text-white/70"
      ) Objective · {{ objective }}

    //- Bottom left: inventory counters (ore/metal/parts).
    div.absolute.bottom-6.left-6.flex.flex-col.gap-1.text-xs(class="text-white/70")
      div.ore(v-if="oreCount > 0") Ore · {{ oreCount }}
      div.metal(v-if="metalCount > 0") Metal · {{ metalCount }}
      div.parts(v-if="(partsCount ?? 0) > 0" class="text-emerald-300/80") Salvage · {{ partsCount }}

    //- Bottom right: fuel + energy gauges stacked, unlabelled. Fuel sits
    //- above the blue energy bar (with spark effect overlay).
    div.gauges.absolute.bottom-6.right-6.flex.flex-col.gap-2.w-56
      div.relative.h-3.rounded-full.border.overflow-hidden(class="border-white/15 bg-black/60")
        div(
          class="h-full transition-[width] duration-200"
          :class="fuelBarClass"
          :style="{ width: `${fuelPct}%` }"
        )
      div.relative.h-3.rounded-full.border.overflow-hidden(class="border-sky-300/25 bg-black/60")
        div(
          class="h-full transition-[width] duration-200"
          :class="energyBarClass"
          :style="{ width: `${energyPct}%` }"
        )
        //- Sparkle overlay — four tiny blurred dots drifting across the bar.
        //- Pure CSS animation (transform + opacity on a handful of elements),
        //- confined to this ~220x12 px box so cost is negligible.
        div.sparkles(
          v-if="energyPct > 3"
          class="pointer-events-none absolute inset-0"
          :style="{ clipPath: `inset(0 ${100 - energyPct}% 0 0)` }"
        )
          span.spark.spark-a
          span.spark.spark-b
          span.spark.spark-c
          span.spark.spark-d

    //- Center-lower interact prompt.
    Transition(name="banner")
      div.interact-prompt(
        v-if="interactPrompt"
        class="absolute left-1/2 bottom-32 -translate-x-1/2 rounded-xl border border-[#ffcd00]/60 bg-black/70 px-5 py-2 text-[#ffcd00] font-bold uppercase tracking-widest text-sm shadow-xl"
      ) {{ interactPrompt }}

    //- World marker pointing to next objective.
    Transition(name="marker")
      div.objective-marker(
        v-if="markerScreen?.visible && phase !== 'complete'"
        :style="{ left: `${markerScreen.x}px`, top: `${markerScreen.y}px` }"
        class="absolute -translate-x-1/2 -translate-y-full"
      )
        div.pulse
        div.label(class="mt-1 rounded bg-black/70 px-2 py-0.5 text-[11px] text-[#ffcd00]")
          | {{ Math.round(markerScreen.distance) }}m

    //- Quarry stone HP bars — one per nearby live stone. Positioned above
    //- each stone in screen-space by the render loop; width reflects
    //- remaining HP and the bar glows hotter as the block melts.
    template(v-for="b in (stoneBars ?? [])" :key="b.id")
      div.stone-hp-bar(
        :style="{ left: `${b.x}px`, top: `${b.y}px` }"
        class="absolute -translate-x-1/2 -translate-y-full"
      )
        div(class="relative h-1.5 w-14 rounded-full border border-black/70 bg-black/60 overflow-hidden")
          div(
            class="h-full transition-[width] duration-75 bg-gradient-to-r from-[#ffe3a8] via-[#ff9a2a] to-[#ff3b0d]"
            :style="{ width: `${Math.max(0, Math.min(1, b.hp)) * 100}%` }"
          )

    //- Bottom right controls hint — pushed up to clear the gauge stack.
    div.controls-hint(class="absolute bottom-28 right-6 text-[11px] text-white/50 uppercase tracking-widest leading-relaxed text-right")
      div WASD · Move / Turn
      div Shift · Sprint
      div Mouse · Look
      div LMB / RMB · Left / Right Hand
      div F · Flamethrower
      div E · Interact · C · Craft
      div G · Screenshot Mode
      div ESC · Pause
</template>

<style scoped lang="sass">
.banner-enter-active, .banner-leave-active
  transition: opacity 250ms ease, transform 250ms ease

.banner-enter-from, .banner-leave-to
  opacity: 0
  transform: translateY(-8px)

.marker-enter-active, .marker-leave-active
  transition: opacity 200ms ease

.marker-enter-from, .marker-leave-to
  opacity: 0

.objective-marker
  pointer-events: none

  .pulse
    width: 18px
    height: 18px
    border-radius: 999px
    border: 2px solid #ffcd00
    background: rgba(247, 160, 0, 0.35)
    box-shadow: 0 0 16px rgba(255, 205, 0, 0.7)
    animation: pulse 1.2s ease-in-out infinite

  .label
    text-align: center
    font-weight: 700
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8)

@keyframes pulse
  0%, 100%
    transform: scale(1)
    opacity: 1
  50%
    transform: scale(1.3)
    opacity: 0.6

// Energy-bar sparkles. Four absolutely-positioned dots with staggered
// drift animations. Using `transform: translate3d` + opacity keeps each
// tick on the GPU compositor — no layout or paint.
.sparkles
  overflow: hidden

  .spark
    position: absolute
    top: 50%
    width: 4px
    height: 4px
    border-radius: 999px
    background: #e6f7ff
    box-shadow: 0 0 6px 1px rgba(200, 230, 255, 0.85)
    opacity: 0
    will-change: transform, opacity
    animation: sparkDrift 2.6s linear infinite

  .spark-a
    animation-delay: 0s

  .spark-b
    animation-delay: 0.65s

  .spark-c
    animation-delay: 1.3s

  .spark-d
    animation-delay: 1.95s

@keyframes sparkDrift
  0%
    transform: translate3d(0, -50%, 0) scale(0.6)
    opacity: 0
  15%
    opacity: 0.9
  85%
    opacity: 0.9
  100%
    transform: translate3d(220px, -50%, 0) scale(1.1)
    opacity: 0
</style>
