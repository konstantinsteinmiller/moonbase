import * as THREE from 'three'
import { damp } from '@/utils/function'
import type { GameAction } from '@/use/useInputMap'

/**
 * First-person exploration-robot controller.
 *
 * Horizontal motion is tank-like: forward/back along chassis heading, A/D rotate
 * rather than strafe, slow damped yaw so the chassis has weight.
 *
 * Vertical motion is a two-state machine — GROUNDED / FALLING — that trusts
 * Rapier's character controller for the resolved position and only adds the
 * fall-detection layer on top:
 *
 *   GROUNDED
 *     - Horizontal motion is fed to Rapier's iterative collide-and-slide,
 *       which projects forward motion onto ramp surfaces; autostep lifts
 *       the capsule over small ledges; snap-to-ground glues it to gentle
 *       descents. Whatever resolved position Rapier returns is committed
 *       DIRECTLY, without any post-solve Y damping — because lagged Y made
 *       the capsule penetrate the terrain during climbs, which confused
 *       contact detection (the "sliding along triangles" bug: the nearest
 *       surface becomes the triangle *above* the embedded capsule, and
 *       forward motion gets projected along its near-vertical face).
 *     - A tiny downward probe keeps the solver reporting ground contact.
 *     - If Rapier reports no ground contact AND the heightfield is more
 *       than `FALL_TRIGGER_DY` below the capsule, we drop into FALLING.
 *
 *   FALLING
 *     - Gravity accumulates into `verticalVel`, applied per-frame.
 *     - Horizontal motion continues to slide against walls.
 *     - On first frame Rapier reports grounded again, we latch back to
 *       GROUNDED and zero the vertical velocity.
 *
 * The visual smoothing that used to live here (damped-spring on Y) has been
 * moved to the render layer (MoonScene smooths Ewall's drawn Y), so big
 * autostep hops still read as glides rather than teleports WITHOUT creating
 * a physics vs. render mismatch inside the solver.
 */

// -- Horizontal tuning --------------------------------------------------------

const MOVE_SPEED = 4.2
const SPRINT_MULT = 1.6          // Shift-held speed multiplier
const ROT_RATE_DEG = 70          // max chassis yaw deg/sec
const ROT_ACCEL = 3.6            // how aggressively the chassis spins up toward the target rate
const PITCH_LIMIT = Math.PI * 0.4
const MOVE_ACCEL = 6             // ramp-up of linear velocity
const MOVE_DRAG = 7              // deceleration when input released

// -- Vertical tuning ----------------------------------------------------------

// Moon gravity is ~1.62 m/s² but that feels floaty for a tank-like bot on
// small ledges; we use a noticeably stronger pull so walking off the landing
// pad reads as a firm drop rather than a hover.
const GRAVITY = 6.0
const TERMINAL_VEL = 30

/** How far the ground can drop between frames before we break glue and fall.
 *  Below this, we interpret the discontinuity as a small step down or a
 *  ramp and stay glued. Above, we enter FALLING and gravity takes over.
 *  Tuned just over knee-height so a bot walking off a quarry stone drops
 *  naturally but a bot walking down a rift ramp stays glued. */
const FALL_TRIGGER_DY = 0.45

/** Small downward bias added to the desired motion while grounded so the
 *  solver keeps reporting contact on gentle descents. Too small and we go
 *  airborne mid-ramp; too large and we teleport downward each frame. */
const GROUND_PROBE = 0.12

export interface PlayerState {
  /** World-space chassis position (feet roughly at y = 0). */
  position: THREE.Vector3
  /** Chassis yaw, radians, CCW positive. */
  yaw: number
  /** Head pitch (camera vertical), radians, clamped. */
  pitch: number
  /** Current chassis forward velocity (world units / s). */
  forwardVel: number
  /** Current strafe velocity (world units / s). */
  strafeVel: number
  /** Current yaw rate (rad / s). */
  yawRate: number
  /** Current vertical velocity (world units / s) — integrates gravity while FALLING. */
  verticalVel: number
  /** True while the character is actively moving. */
  isMoving: boolean
  /** True while the chassis is rotating (used for stopping dialogues). */
  isRotating: boolean
  /** True while feet are on a walkable surface (i.e. in GROUNDED mode). */
  isGrounded: boolean
  /** NoClip cheat flag — when true, collisions & ground are ignored. */
  noClip: boolean
}

export const createPlayerState = (position: THREE.Vector3, yaw = 0): PlayerState => ({
  position: position.clone(),
  yaw,
  pitch: 0,
  forwardVel: 0,
  strafeVel: 0,
  yawRate: 0,
  verticalVel: 0,
  isMoving: false,
  isRotating: false,
  isGrounded: true,
  noClip: false
})

export interface ControllerInput {
  /** Pressed state of each game action (read-only reactive from useInputMap). */
  pressed: Readonly<Record<GameAction, boolean>>
  /** Mouse delta this frame, from pointer lock. */
  mouseDX: number
  mouseDY: number
  /** User sensitivity multiplier. */
  sensitivity: number
  /** Invert Y axis. */
  invertY: boolean
}

export interface CollideMoveResult {
  position: THREE.Vector3
  grounded: boolean
}

export const stepPlayer = (
  state: PlayerState,
  input: ControllerInput,
  dt: number,
  groundHeightAt: (x: number, z: number) => number,
  collideMove: (from: THREE.Vector3, to: THREE.Vector3) => CollideMoveResult
) => {
  // --- Mouse look ----------------------------------------------------------
  // Sensitivity is tuned so 0.5 ≈ default CS-like feel.
  const sens = input.sensitivity * 0.0022
  state.yaw -= input.mouseDX * sens
  state.pitch -= input.mouseDY * sens * (input.invertY ? -1 : 1)
  state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, state.pitch))

  // --- Keyboard yaw (A/D rotate in addition to mouse) ---------------------
  const targetYawRate =
    (input.pressed.strafeLeft ? 1 : 0) * THREE.MathUtils.degToRad(ROT_RATE_DEG * 0.35)
    + (input.pressed.strafeRight ? -1 : 0) * THREE.MathUtils.degToRad(ROT_RATE_DEG * 0.35)
  state.yawRate = damp(state.yawRate, targetYawRate, ROT_ACCEL, dt)
  state.yaw += state.yawRate * dt

  // --- Linear velocities ---------------------------------------------------
  // Shift sprints forward; backpedal stays capped so the robot can't "retreat-sprint".
  const sprintMul = input.pressed.sprint ? SPRINT_MULT : 1
  const targetForward =
    (input.pressed.forward ? 1 : 0) * MOVE_SPEED * sprintMul
    - (input.pressed.backward ? 1 : 0) * MOVE_SPEED * 0.75
  const targetStrafe = 0 // pure strafing is intentionally disabled; A/D rotate
  state.forwardVel = damp(
    state.forwardVel, targetForward,
    targetForward === 0 ? MOVE_DRAG : MOVE_ACCEL,
    dt
  )
  state.strafeVel = damp(state.strafeVel, targetStrafe, MOVE_DRAG, dt)

  // --- NoClip cheat path ---------------------------------------------------
  if (state.noClip) {
    const fwd = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw))
    const rgt = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw))
    state.position
      .addScaledVector(fwd, state.forwardVel * dt)
      .addScaledVector(rgt, state.strafeVel * dt)
    state.isGrounded = false
    state.verticalVel = 0
    state.isMoving = Math.abs(state.forwardVel) + Math.abs(state.strafeVel) > 0.05
    state.isRotating = Math.abs(state.yawRate) > 0.08
    return
  }

  // --- Build desired motion -----------------------------------------------
  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw))
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw))
  const target = state.position.clone()
    .addScaledVector(forward, state.forwardVel * dt)
    .addScaledVector(right, state.strafeVel * dt)

  // Vertical component depends on mode. Grounded: small downward probe so
  // the solver stays in contact. Falling: integrate gravity and apply.
  if (state.isGrounded) {
    target.y -= GROUND_PROBE
  } else {
    state.verticalVel = Math.max(state.verticalVel - GRAVITY * dt, -TERMINAL_VEL)
    target.y += state.verticalVel * dt
  }

  // --- Rapier collide-and-slide -------------------------------------------
  // This is where diagonal ramp-climb happens: forward motion gets projected
  // onto the ramp's contact plane, producing an up-and-forward resolved
  // motion. Walking into a wall slides along it. Autostep (configured in
  // usePhysics) lifts the capsule over small ledges.
  const result = collideMove(state.position, target)
  const resolved = result.position
  const dy = resolved.y - state.position.y

  if (state.isGrounded) {
    // Commit the resolved position DIRECTLY — no post-solve Y damping. Any
    // lag between state.y and the solver's ground-contact Y would leave the
    // capsule embedded in terrain on the next tick, which breaks contact
    // detection (forward motion then projects against the triangle above
    // the capsule instead of the floor below). Visual smoothing happens at
    // the render layer.
    state.position.copy(resolved)

    if (!result.grounded) {
      // Rapier lost contact. Decide between glue-back (a triangle-edge
      // false-negative on an otherwise walkable slope) and free-fall (the
      // ground genuinely dropped away beyond snap-to-ground's range).
      const terrainY = groundHeightAt(state.position.x, state.position.z)
      if (state.position.y - terrainY > FALL_TRIGGER_DY) {
        state.isGrounded = false
        state.verticalVel = 0
      }
    }

    // Reset any accumulated vertical velocity while we're glued.
    if (state.isGrounded) state.verticalVel = 0

    // dy is informational only — kept for potential debug overlays. No
    // gating on STEP_UP_MAX because autostep's own maxHeight cap (set in
    // usePhysics) already filters hops we can't realistically climb.
    void dy
  } else {
    // FALLING: trust the solver for the whole resolved vector. If we landed
    // (Rapier sees contact OR we've descended through the snap-to-ground
    // range back onto terrain), latch back to GROUNDED.
    state.position.copy(resolved)
    if (result.grounded) {
      state.isGrounded = true
      state.verticalVel = 0
    } else {
      const terrainY = groundHeightAt(state.position.x, state.position.z)
      if (state.position.y <= terrainY) {
        state.position.y = terrainY
        state.isGrounded = true
        state.verticalVel = 0
      }
    }
  }

  // Safety net: deep out-of-bounds (dropped tick, NaN, cheat teleport).
  // Only engages on a large discrepancy so normal traversal can't trigger
  // spurious clamps.
  const terrainY = groundHeightAt(state.position.x, state.position.z)
  if (state.position.y < terrainY - 0.5) {
    state.position.y = terrainY
    state.isGrounded = true
    state.verticalVel = 0
  }

  state.isMoving = Math.abs(state.forwardVel) + Math.abs(state.strafeVel) > 0.05
  state.isRotating = Math.abs(state.yawRate) > 0.08
}
