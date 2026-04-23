<script setup lang="ts">
import { computed } from 'vue'

/**
 * Retro top-right radar HUD.
 *
 * Shows the current mission target's direction and distance relative to the
 * player. The sweep is a pure CSS animation so the rAF loop never touches it.
 * Blip brightness decays with distance so far-away targets read as faint.
 *
 * The caller passes the target position relative to the player, already in
 * the player's local frame (x = right, z = forward with +z pointing away
 * from the player). We'll project that onto a 2D disk, clamp to the radar
 * radius, and render two things:
 *   • a blip dot that flashes when the sweep passes over it (optional —
 *     reads as more retro);
 *   • an off-edge arrow when the target is past `maxRange`.
 */

interface Props {
  /** target offset from player in WORLD XZ (metres); null hides the blip. */
  dx: number | null
  dz: number | null
  /** player yaw in radians, 0 = +Z. Used to rotate the blip into radar frame. */
  yaw: number
  /** hard range limit in metres; targets past this clamp to the edge. */
  maxRange?: number
  /** optional label (e.g. distance) shown below the radar. */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  maxRange: 120,
  label: ''
})

const RADIUS_PX = 52 // radar disk half-size on screen

const blip = computed(() => {
  if (props.dx == null || props.dz == null) return null
  // Rotate world-space (dx, dz) into the player's local frame:
  //   local x =  dx*cos(yaw) - dz*sin(yaw)
  //   local z =  dx*sin(yaw) + dz*cos(yaw)
  const c = Math.cos(props.yaw)
  const s = Math.sin(props.yaw)
  const lx = props.dx * c - props.dz * s
  const lz = props.dx * s + props.dz * c
  const distWorld = Math.sqrt(lx * lx + lz * lz)
  const norm = Math.min(1, distWorld / props.maxRange)
  // Radar convention: up = forward (+z), right = +x. Screen y is inverted.
  const px = (lx / distWorld) * norm * RADIUS_PX
  const py = -(lz / distWorld) * norm * RADIUS_PX
  const offEdge = distWorld > props.maxRange
  // Brightness fades past 60 % of range so distant blips read as faint.
  const brightness = norm < 0.6 ? 1 : 1 - (norm - 0.6) * 0.9
  return { px, py, distWorld, offEdge, brightness }
})

const arrowStyle = computed(() => {
  if (!blip.value?.offEdge) return null
  const angleDeg = Math.atan2(blip.value.py, blip.value.px) * (180 / Math.PI)
  return { transform: `translate(-50%, -50%) rotate(${angleDeg + 90}deg)` }
})
</script>

<template lang="pug">
  div.retro-radar(
    class="pointer-events-none absolute top-4 right-4 z-20"
    :style="{\
      top: `calc(1rem + env(safe-area-inset-top, 0px))`,\
      right: `calc(1rem + env(safe-area-inset-right, 0px))`\
    }"
  )
    div.radar-frame(
      class="relative rounded-full border-2 border-emerald-400/80 bg-black/70 shadow-[0_0_18px_rgba(16,185,129,0.4)]"
      :style="{ width: `${RADIUS_PX * 2}px`, height: `${RADIUS_PX * 2}px` }"
    )
      //- Concentric range rings.
      div.ring(class="absolute inset-[12%] rounded-full border border-emerald-400/25")
      div.ring(class="absolute inset-[30%] rounded-full border border-emerald-400/20")
      div.ring(class="absolute inset-[48%] rounded-full border border-emerald-400/18")
      //- Cross-hair axes.
      div.axis.axis-v(class="absolute left-1/2 top-1/4 bottom-1/4 w-px -translate-x-1/2 bg-emerald-400/25")
      div.axis.axis-h(class="absolute top-1/2 left-1/4 right-1/4 h-px -translate-y-1/2 bg-emerald-400/25")
      //- Sweep wedge (CSS animated).
      div.sweep(class="absolute inset-0 rounded-full overflow-hidden")
      //- Outgoing signal wave rings.
      div.wave
      div.wave.wave-delay-1
      div.wave.wave-delay-2
      //- Centre dot (player).
      div(class="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,1)]")
      //- Target blip.
      template(v-if="blip && !blip.offEdge")
        div.blip(
          class="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300"
          :style="{\
            transform: `translate(calc(-50% + ${blip.px}px), calc(-50% + ${blip.py}px))`,\
            opacity: blip.brightness,\
            boxShadow: `0 0 ${4 + blip.brightness * 6}px rgba(252,211,77,${0.6 + blip.brightness * 0.4})`\
          }"
        )
      //- Off-edge arrow.
      template(v-else-if="blip?.offEdge && arrowStyle")
        div.edge-arrow(
          class="absolute left-1/2 top-1/2 h-3 w-3"
          :style="arrowStyle"
        )
          svg(viewBox="0 0 12 12" class="h-full w-full text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.7)]")
            path(d="M6 0 L11 10 L6 7.5 L1 10 Z" fill="currentColor")

    div.label(
      v-if="label"
      class="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-emerald-300/80"
    ) {{ label }}
</template>

<style scoped lang="sass">
.sweep
  // Radial sweep: conic gradient spinning around the centre. The leading
  // edge is a bright green wedge, fading to transparent 90° behind it.
  background: conic-gradient(from 0deg, rgba(110, 231, 183, 0.55) 0deg, rgba(16, 185, 129, 0.22) 20deg, rgba(16, 185, 129, 0) 90deg, rgba(16, 185, 129, 0) 360deg)
  animation: radar-sweep 2.2s linear infinite
  mask-image: radial-gradient(circle at center, black 60%, transparent 100%)
  -webkit-mask-image: radial-gradient(circle at center, black 60%, transparent 100%)

.wave
  position: absolute
  left: 50%
  top: 50%
  width: 10%
  height: 10%
  border-radius: 999px
  border: 1.5px solid rgba(110, 231, 183, 0.7)
  transform: translate(-50%, -50%) scale(1)
  opacity: 0
  animation: radar-wave 2.6s cubic-bezier(0.2, 0.6, 0.2, 1) infinite
  pointer-events: none

.wave-delay-1
  animation-delay: 0.86s

.wave-delay-2
  animation-delay: 1.72s

@keyframes radar-sweep
  to
    transform: rotate(360deg)

@keyframes radar-wave
  0%
    transform: translate(-50%, -50%) scale(1)
    opacity: 0.85
  80%
    opacity: 0
  100%
    transform: translate(-50%, -50%) scale(9)
    opacity: 0
</style>
