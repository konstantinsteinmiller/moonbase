import { ref, readonly } from 'vue'
import type * as THREE from 'three'

/**
 * Performance telemetry singleton.
 *
 * `tick(dt, renderer)` is called once per rendered frame. FPS is a rolling
 * average over a half-second window so the display doesn't flicker on every
 * frame-time jitter; draw calls are read straight from
 * `renderer.info.render.calls` which Three.js resets per-frame internally.
 *
 * The meter component mounts unconditionally but hides itself when the
 * `fps` localStorage flag isn't set, so callers don't need to guard the
 * tick at the call site.
 */

const fps = ref(0)
const drawCalls = ref(0)
const triangles = ref(0)

const WINDOW_S = 0.5
let windowTime = 0
let windowFrames = 0

const tick = (dt: number, renderer: THREE.WebGLRenderer) => {
  windowTime += dt
  windowFrames++
  if (windowTime >= WINDOW_S) {
    fps.value = windowFrames / windowTime
    windowTime = 0
    windowFrames = 0
  }
  const info = renderer.info.render
  drawCalls.value = info.calls
  triangles.value = info.triangles
}

const usePerf = () => ({
  fps: readonly(fps),
  drawCalls: readonly(drawCalls),
  triangles: readonly(triangles),
  tick
})

export default usePerf
