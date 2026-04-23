import * as THREE from 'three'

/**
 * Low-cost flamethrower particle system.
 *
 * Uses a single `Points` object with a soft radial-gradient sprite; each
 * particle has a lifetime and velocity. Colour fades from white-hot through
 * yellow to deep red, then dies.
 */

const MAX_PARTICLES = 280

const createSprite = () => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,220,120,0.9)')
  g.addColorStop(0.7, 'rgba(255,100,40,0.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  return tex
}

export interface FlameHit {
  position: THREE.Vector3
  direction: THREE.Vector3
}

export interface FlamethrowerSystem {
  points: THREE.Points
  spawn: (origin: THREE.Vector3, forward: THREE.Vector3) => void
  update: (dt: number) => void
  isActive: () => boolean
}

export const buildFlamethrower = (): FlamethrowerSystem => {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(MAX_PARTICLES * 3)
  const sizes = new Float32Array(MAX_PARTICLES)
  const alphas = new Float32Array(MAX_PARTICLES)
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))

  const sprite = createSprite()
  const mat = new THREE.PointsMaterial({
    size: 0.6,
    map: sprite,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true
  })

  const colors = new Float32Array(MAX_PARTICLES * 3)
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  ;(mat as any).size = 0.9

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false

  const vel = new Float32Array(MAX_PARTICLES * 3)
  const life = new Float32Array(MAX_PARTICLES)
  const maxLife = new Float32Array(MAX_PARTICLES)
  let cursor = 0
  let activeParticles = 0

  const tmpDir = new THREE.Vector3()

  const spawn = (origin: THREE.Vector3, forward: THREE.Vector3) => {
    // Emit ~6 particles per call.
    for (let i = 0; i < 6; i++) {
      const idx = cursor
      cursor = (cursor + 1) % MAX_PARTICLES
      positions[idx * 3] = origin.x
      positions[idx * 3 + 1] = origin.y
      positions[idx * 3 + 2] = origin.z
      // Cone spread.
      tmpDir.copy(forward).normalize()
      const spread = 0.22
      const jx = (Math.random() - 0.5) * spread
      const jy = (Math.random() - 0.5) * spread
      const jz = (Math.random() - 0.5) * spread
      const speed = 8 + Math.random() * 4
      vel[idx * 3] = (tmpDir.x + jx) * speed
      vel[idx * 3 + 1] = (tmpDir.y + jy + 0.1) * speed // buoyant
      vel[idx * 3 + 2] = (tmpDir.z + jz) * speed
      maxLife[idx] = 0.55 + Math.random() * 0.3
      life[idx] = maxLife[idx]
    }
    activeParticles = Math.min(MAX_PARTICLES, activeParticles + 6)
  }

  const update = (dt: number) => {
    let alive = 0
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i]! <= 0) {
        positions[i * 3] = 0
        positions[i * 3 + 1] = -9999
        positions[i * 3 + 2] = 0
        colors[i * 3] = 0
        colors[i * 3 + 1] = 0
        colors[i * 3 + 2] = 0
        continue
      }
      life[i]! -= dt
      const t = life[i]! / maxLife[i]!
      // Drag so flame slows and buoys upward.
      vel[i * 3]! *= 0.94
      vel[i * 3 + 1] = vel[i * 3 + 1]! * 0.96 + 1.2 * dt
      vel[i * 3 + 2]! *= 0.94
      positions[i * 3]! += vel[i * 3]! * dt
      positions[i * 3 + 1]! += vel[i * 3 + 1]! * dt
      positions[i * 3 + 2]! += vel[i * 3 + 2]! * dt
      // Colour ramp: white-yellow → orange → red.
      if (t > 0.7) {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 1.0
        colors[i * 3 + 2] = 0.75
      } else if (t > 0.35) {
        colors[i * 3] = 1.0
        colors[i * 3 + 1] = 0.55
        colors[i * 3 + 2] = 0.1
      } else {
        colors[i * 3] = 0.7 * t * 2.5
        colors[i * 3 + 1] = 0.15 * t * 2
        colors[i * 3 + 2] = 0.05
      }
      alive++
    }
    activeParticles = alive
    ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(geo.attributes.color as THREE.BufferAttribute).needsUpdate = true
  }

  const isActive = () => activeParticles > 0

  return { points, spawn, update, isActive }
}
