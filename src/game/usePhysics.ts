import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Rapier3d physics wrapper — hosts the kinematic character controller that
 * `PlayerController` drives.
 *
 * Design follows the same playbook as Unity's CharacterController / Unreal's
 * CharacterMovementComponent. Autostep is enabled with conservative limits
 * (max-height 0.5 m, min-width 0.2 m) so curb-height ledges like the landing
 * pad rim lift the capsule, while larger obstacles (boulders, walls) still
 * block. PlayerController runs a damped-spring ramp-climb + fall state
 * machine on top of Rapier's collide-and-slide + autostep output, so the
 * resulting vertical teleport smooths over a handful of frames instead of
 * reading as a single yank.
 *
 *   - Kinematic capsule (no solver-driven dynamics) — the gameplay code owns
 *     position; Rapier only answers "given a desired translation, what's the
 *     collision-aware translation?"
 *   - Iterative collide-and-slide: `computeColliderMovement` projects the
 *     desired motion along contact planes, so walking into a wall slides along
 *     it instead of stopping dead. This is what makes diagonal ramps climb
 *     smoothly: forward motion gets projected onto the ramp surface.
 *   - Snap-to-ground (0.6 m) keeps the capsule glued to gentle descents; any
 *     larger drop returns `grounded = false` and the gameplay layer takes
 *     over with a gravity integration.
 *   - Max-climb/min-slide angles separate walkable slopes from walls.
 */

// Capsule dimensions chosen so Ewall's silhouette (~1.8m tall) fits with a
// little breathing room but the capsule still slips cleanly past rift walls
// and heightfield triangles. Total height = halfHeight*2 + radius*2.
const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.4
const CAPSULE_TOTAL_HEIGHT = CAPSULE_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2  // 1.9 m

type Collider =
  | { kind: 'box'; key?: string; x: number; y: number; z: number; w: number; h: number; d: number; ry?: number }
  | { kind: 'ball'; key?: string; x: number; y: number; z: number; r: number }
  | { kind: 'cylinder'; key?: string; x: number; y: number; z: number; r: number; h: number }
  | { kind: 'convexHull'; key?: string; x: number; y: number; z: number; points: Float32Array }
  | {
  kind: 'heightfield';
  key?: string;
  nrows: number;
  ncols: number;
  heights: Float32Array;
  scaleX: number;
  scaleZ: number
}

export interface CollideResult {
  position: THREE.Vector3
  grounded: boolean
}

export interface PhysicsHandle {
  world: RAPIER.World
  playerBody: RAPIER.RigidBody
  playerCollider: RAPIER.Collider
  controller: RAPIER.KinematicCharacterController
  collideMove: (from: THREE.Vector3, to: THREE.Vector3) => CollideResult
  step: (dt: number) => void
  dispose: () => void
  /** Latest line-soup from Rapier's debug render pipeline; one call per frame. */
  debugSnapshot: () => { vertices: Float32Array; colors: Float32Array }
  /** Ray probe — returns hit distance along `dir` in [0..maxDist], or `null`
   *  if the ray missed. Ignores the player's own collider. Used by the
   *  gameplay layer for "is there an obstacle in front of me?" checks. */
  probe: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) => number | null
  /** Remove a static body that was registered with a `key`. Used to drop
   *  quarry stones out of the world once the player has smelted them. */
  removeBodyByKey: (key: string) => void
}

let rapierReady: Promise<void> | null = null
const ensureRapier = () => {
  if (!rapierReady) {
    // `@dimforge/rapier3d-compat@0.19.3`'s own `init()` calls its internal
    // wasm-bindgen shim with the decoded WASM bytes in the deprecated
    // positional form instead of `{ module_or_path: bytes }`, so it prints
    // one "using deprecated parameters…" warning on every page load. We
    // can't fix it from the outside — the call is inside the bundled
    // package — so scrub that one message while init() is running, then
    // restore the original console.warn.
    const realWarn = console.warn
    console.warn = (...args: unknown[]) => {
      const first = args[0]
      if (typeof first === 'string'
        && first.includes('using deprecated parameters for the initialization function')) return
      realWarn.apply(console, args as [])
    }
    rapierReady = RAPIER.init().finally(() => {
      console.warn = realWarn
    })
  }
  return rapierReady
}

export const createPhysics = async (
  colliders: Collider[],
  playerStart: THREE.Vector3
): Promise<PhysicsHandle> => {
  await ensureRapier()

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

  // Keyed static bodies — lets us remove individual colliders later (e.g.
  // a quarry stone after the player smelts it) without rebuilding the world.
  const bodyByKey = new Map<string, RAPIER.RigidBody>()

  // Static world geometry.
  for (const c of colliders) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    const body = world.createRigidBody(bodyDesc)
    if (c.key) bodyByKey.set(c.key, body)
    let colDesc: RAPIER.ColliderDesc | null = null
    if (c.kind === 'box') {
      colDesc = RAPIER.ColliderDesc.cuboid(c.w / 2, c.h / 2, c.d / 2)
      body.setTranslation({ x: c.x, y: c.y, z: c.z }, true)
      if (c.ry) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.ry, 0))
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      }
    } else if (c.kind === 'ball') {
      colDesc = RAPIER.ColliderDesc.ball(c.r)
      body.setTranslation({ x: c.x, y: c.y, z: c.z }, true)
    } else if (c.kind === 'cylinder') {
      colDesc = RAPIER.ColliderDesc.cylinder(c.h / 2, c.r)
      body.setTranslation({ x: c.x, y: c.y, z: c.z }, true)
    } else if (c.kind === 'convexHull') {
      // convexHull may return null if Rapier rejects the input (co-linear
      // points, <4 points). Caller is responsible for supplying a valid hull.
      colDesc = RAPIER.ColliderDesc.convexHull(c.points)
      if (colDesc) body.setTranslation({ x: c.x, y: c.y, z: c.z }, true)
    } else if (c.kind === 'heightfield') {
      // scale.y = 1 because computeHeight already returns world-space Y values.
      // The heightfield centers on its body's translation — keep it at origin
      // so world-space samples line up with the visible terrain mesh.
      // FIX_INTERNAL_EDGES prevents the capsule catching on the boundaries
      // between heightfield triangles, which otherwise causes micro-hops on
      // descending slopes.
      colDesc = RAPIER.ColliderDesc.heightfield(
        c.nrows - 1, c.ncols - 1, c.heights,
        { x: c.scaleX, y: 1, z: c.scaleZ },
        RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES
      )
      body.setTranslation({ x: 0, y: 0, z: 0 }, true)
    }
    if (colDesc) {
      colDesc.setFriction(0.8)
      world.createCollider(colDesc, body)
    }
  }

  // Player body — kinematic capsule anchored one capsule-half above the
  // gameplay feet position so the capsule's lower hemisphere touches the
  // ground when `state.position.y == terrainY`.
  const feetOffset = CAPSULE_TOTAL_HEIGHT / 2  // body centre above feet
  const playerBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(playerStart.x, playerStart.y + feetOffset, playerStart.z)
  const playerBody = world.createRigidBody(playerBodyDesc)
  const playerCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS),
    playerBody
  )

  // Small skin-width so contact resolution has numerical slack before
  // considering the capsule "inside" geometry — same technique as Unreal's
  // CharacterSweepRadiusShrink.
  const controller = world.createCharacterController(0.08)
  // Autostep enabled with limits that match STEP_UP_MAX in PlayerController.
  // maxHeight 1.0 m covers the pad chamfer + any curb-height terrain break
  // the player can reasonably drive up; minWidth 0.2 m still requires a real
  // step surface underneath (so walls and boulder faces are excluded);
  // includeDynamic=false keeps physics-driven props off the climb list.
  // PlayerController's damped-spring ramp smooths the resulting vertical
  // jump over a handful of frames so the mount doesn't read as a teleport.
  controller.enableAutostep(1.0, 0.2, false)
  // Snap-to-ground at 0.6 m is wide enough to glue the capsule to a sprint
  // descent on a 30° rift ramp (≈10 cm/frame plus margin) but tight enough
  // that walking off a knee-height ledge cleanly returns `grounded = false`
  // so the gameplay layer can enter free-fall.
  controller.enableSnapToGround(0.6)
  controller.setApplyImpulsesToDynamicBodies(false)
  // Climb: surfaces up to 90° are walkable floor. Slide: surfaces above 90°
  // are walls — which is impossible, so in practice the slide path is never
  // taken and everything is treated as floor. Raised 50% from 60°/65° so
  // Ewall can climb almost anything Rapier's autostep + collide-and-slide
  // hand him; the remaining filter against walls is the collider geometry
  // itself (flat vertical faces of boulders/airlock box still block motion
  // because the capsule can't penetrate them — autostep + the 0.08 skin
  // width can't lift a capsule onto a zero-thickness ledge).
  controller.setMaxSlopeClimbAngle(Math.PI * 90 / 180)
  controller.setMinSlopeSlideAngle(Math.PI * 90 / 180)

  const collideMove = (from: THREE.Vector3, to: THREE.Vector3): CollideResult => {
    // Gameplay position is "feet" — drive the kinematic body at the capsule
    // centre, `feetOffset` above feet.
    playerBody.setNextKinematicTranslation({
      x: from.x, y: from.y + feetOffset, z: from.z
    })
    const desired = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
    // This is where the wall sliding happens. Rapier iterates up to
    // `maxCollisionsResolution` (default 8) passes, each time projecting the
    // residual motion onto the contact plane — so walking diagonally into a
    // corner slides along whichever wall is less parallel to motion.
    controller.computeColliderMovement(playerCollider, desired)
    const m = controller.computedMovement()
    return {
      position: new THREE.Vector3(from.x + m.x, from.y + m.y, from.z + m.z),
      grounded: controller.computedGrounded()
    }
  }

  const step = (dt: number) => {
    world.timestep = Math.min(dt, 1 / 30)
    world.step()
  }

  const dispose = () => {
    world.free()
  }

  const debugSnapshot = () => world.debugRender()

  // Reusable ray — keeps per-frame allocations flat for probes called every
  // tick (e.g. the arm-tuck obstacle check).
  const probeRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })
  const probe = (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number | null => {
    probeRay.origin.x = origin.x
    probeRay.origin.y = origin.y
    probeRay.origin.z = origin.z
    probeRay.dir.x = dir.x
    probeRay.dir.y = dir.y
    probeRay.dir.z = dir.z
    // solid=true so rays starting inside a collider return t=0 rather than
    // passing straight through; filter excludes the player capsule.
    const hit = world.castRay(probeRay, maxDist, true, undefined, undefined, playerCollider)
    return hit ? hit.timeOfImpact : null
  }

  const removeBodyByKey = (key: string) => {
    const body = bodyByKey.get(key)
    if (!body) return
    // `removeRigidBody` also frees any attached colliders — no need to walk
    // the collider list ourselves.
    world.removeRigidBody(body)
    bodyByKey.delete(key)
  }

  return {
    world, playerBody, playerCollider, controller,
    collideMove, step, dispose, debugSnapshot, probe, removeBodyByKey
  }
}
