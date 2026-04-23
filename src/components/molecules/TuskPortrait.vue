<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { prependBaseUrl } from '@/utils/function'
import useMission from '@/use/useMission'

/**
 * Top-right portrait card for incoming Ekon Tusk transmissions.
 *
 * Shown only while the active dialog line is spoken by Tusk — disappears the
 * moment the line resolves or a different speaker takes over, so the frame
 * reads as a live radio patch rather than a permanent HUD fixture.
 *
 * Positioned under the RetroRadar (top:right corner) with safe-area-aware
 * offsets so iOS notches / island don't overlap it.
 */

const { currentLine } = useMission()
const isVisible = computed(() => currentLine.value?.speaker === 'tusk')

// Inline SVG placeholder — also acts as the `onerror` fallback so the frame
// is never empty even if the real PNG 404s in production.
const placeholder =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 240" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#352414"/>
      <stop offset="1" stop-color="#0a0703"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.55">
      <stop offset="0" stop-color="#ffcd00" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffcd00" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="160" height="240" fill="url(#bg)"/>
  <rect width="160" height="240" fill="url(#glow)"/>
  <!-- stylised silhouette: bald dome + shoulders -->
  <circle cx="80" cy="96" r="34" fill="#1a1308"/>
  <ellipse cx="80" cy="88" rx="30" ry="30" fill="#e9b373"/>
  <!-- collar / suit -->
  <path d="M24 220 Q80 150 136 220 Z" fill="#120a03"/>
  <path d="M40 220 Q80 170 120 220 Z" fill="#2a1a0a"/>
  <!-- tie -->
  <path d="M74 170 L86 170 L84 210 L80 218 L76 210 Z" fill="#b81e2c"/>
  <!-- eyes + mouth (cartoon) -->
  <circle cx="70" cy="85" r="2.5" fill="#0a0703"/>
  <circle cx="90" cy="85" r="2.5" fill="#0a0703"/>
  <path d="M68 106 Q80 112 92 106" stroke="#0a0703" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- label -->
  <text x="80" y="236" text-anchor="middle" font-family="Consolas, monospace" font-size="9" fill="#ffcd00" letter-spacing="2">NO SIGNAL</text>
</svg>`.trim())

const imgSrc = ref(prependBaseUrl('/images/tusk-portrait.png'))
const onError = () => {
  imgSrc.value = placeholder
}

// Silent loop overlaid on top of the still portrait when Tusk is on the mic.
// Preloaded by useAssets once the main loading screen finishes; we just
// reference the same URL so the browser serves it out of cache instantly.
const videoSrc = prependBaseUrl('/video/ekon-tusk-no-voice.mp4')
const videoEl = ref<HTMLVideoElement | null>(null)
const videoReady = ref(false)
watch(isVisible, (on) => {
  const v = videoEl.value
  if (!v) return
  if (on) {
    try {
      v.currentTime = 0
      v.play().catch(() => {
      })
    } catch {
    }
  } else {
    try {
      v.pause()
    } catch {
    }
  }
})

// Cosmetic signal-strength bars — random so every activation feels live.
const bars = [0, 1, 2, 3, 4]
const activeBars = computed(() => 3 + Math.floor(Math.random() * 2))
</script>

<template lang="pug">
  Transition(name="tusk-fade")
    div.tusk-portrait(
      v-if="isVisible"
      class="pointer-events-none absolute z-20"
      :style="{\
        top: `calc(env(safe-area-inset-top, 0px) + 10rem)`,\
        right: `calc(env(safe-area-inset-right, 0px) + 1rem)`,\
        width: `min(160px, 20vw)`\
      }"
    )
      //- OUTER BEZEL — brushed metal frame with corner rivets.
      div.bezel(class="relative rounded-md p-[6px] bg-gradient-to-b from-[#2e3340] via-[#1a1f2b] to-[#0c0f15] shadow-[0_4px_18px_rgba(0,0,0,0.6)] ring-1 ring-black/60")
        //- Corner rivets.
        template(v-for="pos in ['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1']" :key="pos")
          div(:class="['absolute h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#bfc6d2] to-[#3a4252] shadow-inner', pos]")

        //- SCREEN — CRT-tinted glass with scanlines and portrait.
        div.screen(class="relative overflow-hidden rounded-sm border border-[#ffcd00]/25 bg-black"
          :style="{ aspectRatio: '2 / 3' }")
          img(
            :src="imgSrc"
            @error="onError"
            alt="Ekon Tusk transmission"
            class="absolute inset-0 h-full w-full object-cover"
            :style="{ imageRendering: 'auto' }"
          )
          video(
            ref="videoEl"
            :src="videoSrc"
            muted
            loop
            autoplay
            playsinline
            preload="auto"
            @canplaythrough="videoReady = true"
            @error="videoReady = false"
            class="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
            :class="videoReady ? 'opacity-100' : 'opacity-0'"
          )
          //- Amber CRT tint.
          div(class="absolute inset-0 bg-gradient-to-b from-[#ffcd00]/10 via-transparent to-[#f7a000]/15 mix-blend-screen")
          //- Vignette.
          div(class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.65)_100%)]")
          //- Scanlines.
          div.scanlines(class="absolute inset-0 pointer-events-none mix-blend-overlay opacity-60")
          //- Flicker sweep.
          div.sweep(class="absolute inset-x-0 h-[18%] pointer-events-none")

          //- Corner targeting brackets.
          div(class="absolute top-1 left-1 h-3 w-3 border-t-2 border-l-2 border-[#ffcd00]/80")
          div(class="absolute top-1 right-1 h-3 w-3 border-t-2 border-r-2 border-[#ffcd00]/80")
          div(class="absolute bottom-1 left-1 h-3 w-3 border-b-2 border-l-2 border-[#ffcd00]/80")
          div(class="absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-[#ffcd00]/80")

          //- ● LIVE badge.
          div(class="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-red-300 border border-red-500/40")
            span.live-dot(class="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_4px_#ff3434]")
            span LIVE

          //- Bottom nameplate with signal bars.
          div(class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-1")
            div(class="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-[#ffcd00]")
              span EKON TUSK
              div.bars(class="flex items-end gap-[1px]")
                template(v-for="b in bars" :key="b")
                  div(
                    :class="[\
                      'w-[2px]',\
                      b < activeBars ? 'bg-[#ffcd00]' : 'bg-[#ffcd00]/25'\
                    ]"
                    :style="{ height: `${3 + b * 1.5}px` }"
                  )

        //- Below the screen — small radio-channel tag.
        div(class="mt-1 flex items-center justify-between px-1 text-[8px] font-mono uppercase tracking-[0.25em] text-white/55")
          span CH 01
          span 118.5 MHz
</template>

<style scoped lang="sass">
.tusk-fade-enter-active, .tusk-fade-leave-active
  transition: opacity 220ms ease, transform 220ms ease

.tusk-fade-enter-from, .tusk-fade-leave-to
  opacity: 0
  transform: translateX(14px) scale(0.96)

.scanlines
  background-image: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0.55) 3px)

.sweep
  background: linear-gradient(to bottom, rgba(255, 205, 0, 0) 0%, rgba(255, 205, 0, 0.18) 45%, rgba(255, 205, 0, 0) 100%)
  animation: sweep 4.2s linear infinite
  top: -18%

@keyframes sweep
  0%
    transform: translateY(0)
    opacity: 0
  5%
    opacity: 0.8
  95%
    opacity: 0.8
  100%
    transform: translateY(600%)
    opacity: 0

.live-dot
  animation: live-blink 1.1s steps(2, start) infinite

@keyframes live-blink
  0%, 100%
    opacity: 1
  50%
    opacity: 0.35
</style>
