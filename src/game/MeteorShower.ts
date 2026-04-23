import * as THREE from 'three'
import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'
import useUser from '@/use/useUser'

/**
 * Meteor-strike spectacle that fires when Ewall-13 first reaches the
 * exploration target in the valleys.
 *
 * Two distinct subsystems live under one module:
 *
 *   1. **Big meteor.** A single large dark-grey sphere, spawned high in the
 *      sky at roughly 10 o'clock relative to Ewall's current facing. It
 *      streaks past him (miss-trajectory) on a ballistic arc and craters
 *      far away. Its world-space position is what the cinematic camera
 *      locks to for ~4 s; MoonScene reads `getBigMeteorPos()` each render
 *      frame to orient the camera.
 *
 *   2. **Small rocks.** ~20 cm granite nuggets falling from the upper
 *      hemisphere. Every rock has a simple ballistic trajectory (no full
 *      Rapier body — the pool is cheap Three.js meshes) and triggers one of
 *      the pre-loaded `meteor-impact-1..4` clips on contact with either the
 *      terrain (y<=terrainY) or Ewall (horizontal distance<HIT_RADIUS).
 *
 * The module owns its own Three.js resources (meshes, material) and
 * cleans up in `dispose()` — MoonScene simply mounts the returned root
 * into the scene graph.
 */

const BIG_METEOR_RADIUS = 2.6
const SMALL_ROCK_RADIUS = 0.1        // ~20 cm diameter as specified
const SMALL_ROCK_COUNT = 24
const HIT_RADIUS = 1.1               // horizontal radius that counts as "hit Ewall"
const GRAVITY = 9.81

export interface MeteorShowerSystem {
  root: THREE.Object3D
  /** Call once per render frame. Returns `true` while the shower is still
   *  emitting rocks / the big meteor is airborne. */
  update: (dt: number, playerPos: THREE.Vector3) => boolean
  /** Current big-meteor world position — used by MoonScene to steer the
   *  cinematic camera without reaching into the Three.js objects. */
  getBigMeteorPos: () => THREE.Vector3
  /** How many small rocks have connected with either Ewall or the ground.
   *  MoonScene checks this to decide when to hand camera control back. */
  getImpactCount: () => number
  /** `true` if a rock hit Ewall directly this frame. Reset after read. */
  didHitEwall: () => boolean
  dispose: () => void
}

type SmallRock = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  alive: boolean
  delay: number
}

const playRandomImpact = () => {
  const { userSoundVolume } = useUser()
  const n = 1 + Math.floor(Math.random() * 4)
  const src = prependBaseUrl(`audio/sfx/meteor-impact-${n}.ogg`)
  const cached = resourceCache.audio.get(src)
  const audio = cached
    ? cached.cloneNode(false) as HTMLAudioElement
    : new Audio(src)
  audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * 0.85))
  audio.play().catch(() => {/* gesture requirement */
  })
}

const playFlyby = () => {
  const { userSoundVolume } = useUser()
  const src = prependBaseUrl('audio/sfx/meteor-flyby.ogg')
  const cached = resourceCache.audio.get(src)
  const audio = cached
    ? cached.cloneNode(false) as HTMLAudioElement
    : new Audio(src)
  audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * 0.95))
  audio.play().catch(() => {/* gesture requirement */
  })
}

/** Spawn a fresh meteor shower centred on `ewallPos` (XZ origin) with the
 *  player currently facing `ewallYaw` (used to place the big meteor at
 *  roughly 10 o'clock so the cinematic camera pan reads as up-and-left).
 *  `heightAt` samples terrain Y so ground impacts detect correctly. */
export const buildMeteorShower = (
  ewallPos: THREE.Vector3,
  ewallYaw: number,
  heightAt: (x: number, z: number) => number
): MeteorShowerSystem => {
  const root = new THREE.Group()

  // --- Big meteor (miss trajectory) ---------------------------------------
  // Place it ~120 m up and 80 m to Ewall's upper-left; launch it on a
  // shallow arc that passes a comfortable 35 m to Ewall's side and carries
  // on for a further 160 m before impact. Mass + dynamic body could be
  // done with Rapier, but for a 4 s cinematic a scripted ballistic is
  // cheaper and gives us deterministic camera framing.
  const bigGeo = new THREE.IcosahedronGeometry(BIG_METEOR_RADIUS, 1)
  const bigMat = new THREE.MeshStandardMaterial({
    color: 0x22201c, roughness: 0.95, flatShading: true,
    emissive: 0xff5a1a, emissiveIntensity: 0.85
  })
  const bigMesh = new THREE.Mesh(bigGeo, bigMat)
  // Forward unit vector from Ewall's yaw. Screen-left = camera's -X when
  // looking along -forward, so offset = -right for "to the left".
  const forward = new THREE.Vector3(-Math.sin(ewallYaw), 0, -Math.cos(ewallYaw))
  const right = new THREE.Vector3(Math.cos(ewallYaw), 0, -Math.sin(ewallYaw))
  const startOffset = new THREE.Vector3()
    .addScaledVector(right, -60)   // 60 m to Ewall's left
    .addScaledVector(forward, 80) // 80 m ahead (so it streaks past in view)
  startOffset.y = 120
  const bigStart = ewallPos.clone().add(startOffset)
  bigMesh.position.copy(bigStart)
  root.add(bigMesh)

  // Trail: a stretched additive sprite-ish trail made from a flat elongated
  // cylinder pointing along the velocity. Cheap, reads as "fireball streak".
  const trailGeo = new THREE.CylinderGeometry(0.6, 2.4, 14, 10, 1, true)
  trailGeo.translate(0, -7, 0)
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffb060,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  })
  const trail = new THREE.Mesh(trailGeo, trailMat)
  bigMesh.add(trail)

  // Aim at a ground point 160 m past Ewall (miss distance ~35 m to the side)
  const bigLandingSide = new THREE.Vector3()
    .addScaledVector(right, 35)
    .addScaledVector(forward, 100)
  const bigLanding = ewallPos.clone().add(bigLandingSide)
  bigLanding.y = heightAt(bigLanding.x, bigLanding.z)

  // Solve: travel time to reach landing point under constant gravity.
  const BIG_TIME = 4.2  // seconds for the flyby (cinematic duration)
  const dxBig = bigLanding.x - bigStart.x
  const dzBig = bigLanding.z - bigStart.z
  const dyBig = bigLanding.y - bigStart.y
  const bigVel = new THREE.Vector3(
    dxBig / BIG_TIME,
    dyBig / BIG_TIME + 0.5 * GRAVITY * BIG_TIME,
    dzBig / BIG_TIME
  )
  let bigAlive = true
  let bigT = 0

  // --- Small rocks pool ---------------------------------------------------
  const rockGeo = new THREE.IcosahedronGeometry(SMALL_ROCK_RADIUS, 0)
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x2a2824, roughness: 0.95, flatShading: true,
    emissive: 0xff5a1a, emissiveIntensity: 0.45
  })
  const rocks: SmallRock[] = []
  for (let i = 0; i < SMALL_ROCK_COUNT; i++) {
    const m = new THREE.Mesh(rockGeo, rockMat)
    // Scatter start positions in a sky-dome above Ewall: radius 25 m
    // (horizontal) at altitude 80..110 m. Aiming at ground positions
    // clustered around Ewall gives the "targeting you specifically" feel.
    const angle = Math.random() * Math.PI * 2
    const horizR = 14 + Math.random() * 18
    const sx = ewallPos.x + Math.cos(angle) * horizR
    const sz = ewallPos.z + Math.sin(angle) * horizR
    const sy = 80 + Math.random() * 40
    m.position.set(sx, sy, sz)
    root.add(m)
    // Pick a ground target near (or on) Ewall so some connect.
    const targetRadius = Math.random() < 0.45 ? Math.random() * 0.9 : 2 + Math.random() * 5
    const targetAngle = Math.random() * Math.PI * 2
    const tx = ewallPos.x + Math.cos(targetAngle) * targetRadius
    const tz = ewallPos.z + Math.sin(targetAngle) * targetRadius
    const ty = heightAt(tx, tz)
    const fallTime = 1.6 + Math.random() * 1.4
    const vx = (tx - sx) / fallTime
    const vz = (tz - sz) / fallTime
    const vy = (ty - sy) / fallTime + 0.5 * GRAVITY * fallTime
    rocks.push({
      mesh: m,
      vel: new THREE.Vector3(vx, vy, vz),
      alive: true,
      // Stagger spawns across the cinematic so rocks don't all hit together.
      // The flyby lasts ~4 s; rocks start dropping at 1.2 s and trail off
      // over a further ~2.5 s.
      delay: 1.2 + Math.random() * 2.5
    })
    m.visible = false
  }

  playFlyby()

  let impactCount = 0
  let hitEwallThisFrame = false

  const update = (dt: number, playerPos: THREE.Vector3): boolean => {
    hitEwallThisFrame = false
    // Big meteor integration.
    if (bigAlive) {
      bigT += dt
      bigVel.y -= GRAVITY * dt
      bigMesh.position.addScaledVector(bigVel, dt)
      // Orient trail along velocity (cylinder local-Y is up; rotate to align
      // with velocity direction).
      const up = bigVel.clone().normalize()
      const axis = new THREE.Vector3(0, 1, 0).cross(up)
      const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(new THREE.Vector3(0, 1, 0)))))
      if (axis.lengthSq() > 1e-6) {
        trail.quaternion.setFromAxisAngle(axis.normalize(), angle)
      }
      if (bigT > BIG_TIME + 0.5 || bigMesh.position.y < heightAt(bigMesh.position.x, bigMesh.position.z)) {
        bigAlive = false
        bigMesh.visible = false
        // Fired once when the big one craters — loudest impact in the bank.
        playRandomImpact()
      }
    }

    // Small rocks integration.
    let anyAlive = false
    for (const r of rocks) {
      if (!r.alive) continue
      if (r.delay > 0) {
        r.delay -= dt
        anyAlive = true
        continue
      }
      if (!r.mesh.visible) r.mesh.visible = true
      r.vel.y -= GRAVITY * dt
      r.mesh.position.addScaledVector(r.vel, dt)
      const ground = heightAt(r.mesh.position.x, r.mesh.position.z)
      // Ewall-hit check: within HIT_RADIUS horizontally, at Ewall's torso Y.
      const dxp = r.mesh.position.x - playerPos.x
      const dzp = r.mesh.position.z - playerPos.z
      const horizDist = Math.hypot(dxp, dzp)
      const hitEwall = horizDist < HIT_RADIUS
        && r.mesh.position.y < playerPos.y + 2.0
        && r.mesh.position.y > playerPos.y - 0.2
      if (hitEwall) {
        r.alive = false
        r.mesh.visible = false
        impactCount++
        hitEwallThisFrame = true
        playRandomImpact()
        continue
      }
      if (r.mesh.position.y <= ground) {
        r.alive = false
        r.mesh.visible = false
        impactCount++
        playRandomImpact()
        continue
      }
      anyAlive = true
    }
    return bigAlive || anyAlive
  }

  const dispose = () => {
    bigGeo.dispose()
    bigMat.dispose()
    trailGeo.dispose()
    trailMat.dispose()
    rockGeo.dispose()
    rockMat.dispose()
    root.parent?.remove(root)
  }

  return {
    root,
    update,
    getBigMeteorPos: () => bigMesh.position,
    getImpactCount: () => impactCount,
    didHitEwall: () => {
      const v = hitEwallThisFrame
      hitEwallThisFrame = false
      return v
    },
    dispose
  }
}
