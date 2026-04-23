<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted, onUnmounted, ref } from 'vue'
import { mobileCheck } from '@/utils/function'
import { useMusic } from '@/use/useSound'
import { windowWidth, windowHeight, orientation } from '@/use/useUser'
import useAssets from '@/use/useAssets'
import FLogoProgress from '@/components/atoms/FLogoProgress.vue'
import FPerfMeter from '@/components/atoms/FPerfMeter.vue'

const { initMusic, pauseMusic, continueMusic } = useMusic()
const { preloadAssets } = useAssets()
preloadAssets()
initMusic()

const onContextMenu = (e: MouseEvent) => e.preventDefault()
const onTouchStart = (e: TouchEvent) => {
  if (e.touches.length > 1) e.preventDefault()
}
const onGestureStart = (e: Event) => e.preventDefault()

const handleVisibilityChange = () => {
  if (document.hidden) pauseMusic()
  else continueMusic()
}

const updateGlobalDimensions = () => {
  windowWidth.value = window.innerWidth
  windowHeight.value = window.innerHeight
  orientation.value = mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait'
}

const dimensionsInterval = ref<any | null>(null)

onMounted(() => {
  window.addEventListener('resize', updateGlobalDimensions)
  dimensionsInterval.value = setInterval(updateGlobalDimensions, 500)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('touchstart', onTouchStart, { passive: false })
  document.addEventListener('gesturestart', onGestureStart)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateGlobalDimensions)
  clearInterval(dimensionsInterval.value)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('gesturestart', onGestureStart)
})
</script>

<template lang="pug">
  div#app-root(class="relative h-screen w-screen overflow-hidden bg-[#05060a] text-white")
    FLogoProgress
    FPerfMeter
    RouterView
</template>

<style lang="sass">
*
  user-select: none
  -webkit-user-select: none
  -moz-user-select: none
  -ms-user-select: none
  -webkit-tap-highlight-color: transparent

img
  pointer-events: none

#app, #app-root
  width: 100%
  height: 100%
</style>
