import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/**
 * Renderer + scene + camera bootstrap tuned for the low-poly moon aesthetic.
 * - Fixed pixel-ratio cap so laptops don't nuke themselves trying to push 4K.
 * - Single directional light aligned to the sun, plus a hemisphere fill so
 *   the shadow side of the regolith isn't pitch black.
 * - Post-processing: UnrealBloomPass picks up the white-hot sun core and any
 *   emissive hotspots, and OutputPass handles the final tone-map → sRGB
 *   conversion so the composer matches what renderer.render would produce.
 */

export interface SceneHandle {
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sunLight: THREE.DirectionalLight
  ambient: THREE.HemisphereLight
  resize: (w: number, h: number) => void
  render: () => void
  dispose: () => void
}

export const mountThreeScene = (canvas: HTMLCanvasElement, width: number, height: number): SceneHandle => {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false
  })
  const pixelRatio = Math.min(window.devicePixelRatio, 1.5)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.setClearColor(0x05060a, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Tone mapping + exposure live on the renderer but OutputPass is the one
  // that actually applies them at end-of-pipeline — RenderPass writes the
  // scene into the composer's HDR buffer unmodified.
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = false

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05060a)
  // Fog is for terrain/props only — sky bodies opt out with `fog:false` on
  // their materials so the sun doesn't tint cold-blue at the far plane.
  scene.fog = new THREE.Fog(0x0a0c14, 120, 380)

  const camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 600)

  const sunLight = new THREE.DirectionalLight(0xfff1c0, 2.2)
  sunLight.position.set(240, 180, 260).normalize().multiplyScalar(50)
  sunLight.target.position.set(0, 0, 0)
  scene.add(sunLight)
  scene.add(sunLight.target)

  const ambient = new THREE.HemisphereLight(0x5577aa, 0x2a2824, 0.75)
  scene.add(ambient)

  // ─── Post-processing chain ──────────────────────────────────────────────
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(pixelRatio)
  composer.setSize(width, height)

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  // UnrealBloomPass(resolution, strength, radius, threshold).
  // threshold 0.85 → only super-bright pixels (white-hot sun core, specular
  // hits) bleed; strength 1.1 gives a punchy star-like bloom without washing
  // out the regolith.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.1,   // strength
    0.7,   // radius
    0.85   // threshold (luminance)
  )
  composer.addPass(bloomPass)

  // OutputPass applies the tone-map + sRGB conversion that RenderPass skips
  // when a composer is in play.
  composer.addPass(new OutputPass())

  const resize = (w: number, h: number) => {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloomPass.setSize(w, h)
  }

  const render = () => {
    composer.render()
  }

  const dispose = () => {
    composer.dispose()
    renderer.dispose()
    scene.traverse(obj => {
      const m = obj as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(mm => mm.dispose())
      else mat?.dispose()
    })
  }

  return { renderer, composer, bloomPass, scene, camera, sunLight, ambient, resize, render, dispose }
}
