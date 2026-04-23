import * as THREE from 'three'

/**
 * Ewall — a low-poly first-person exploration robot.
 *
 * The returned group is positioned so (0,0,0) sits at the chassis centre,
 * standing on the ground means `position.y = 0.6` (half of chassis height).
 *
 * Because the camera is parented to a `headAnchor` inside the chassis, any
 * chassis rotation actually moves the camera — exactly the "turn the whole
 * chassis to look around" behaviour spec'd for Ewall.
 */

const matBody = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, metalness: 0.55, roughness: 0.45, ...opts })

const COLORS = {
  chassis: 0xe0e4ea,
  chassisDark: 0x535862,
  accent: 0xf7a000,
  visor: 0x5fd7ff,
  joint: 0x2b2f38,
  rubber: 0x222326,
  hot: 0xd84b2a,
  solar: 0x1d3a7a,         // deep PV-blue
  solarCell: 0x2a5fb8,     // cell face
  solarFrame: 0xaeb6c2,    // silvery alloy frame
  storage: 0x8a7e6b        // scuffed cargo tan
}

export interface EwallModel {
  root: THREE.Group
  chassis: THREE.Group
  headAnchor: THREE.Object3D
  leftArm: { root: THREE.Group; upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }
  rightArm: { root: THREE.Group; upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D }
  flamethrower: THREE.Group
  flamethrowerMuzzle: THREE.Object3D
  /** Solar cell panel on the rear — Ewall's power source. A broken panel
   *  (see buildBrokenEwall) flips its material to cracked/darkened so the
   *  gameplay layer can visually mark a busted unit. */
  solarCell: THREE.Mesh
  /** Storage container on the rear — cosmetic for now; intended to show
   *  fill-level based on ore/material counts in a later iteration. */
  storage: THREE.Group
  /** Call once per frame to update subtle idle sway. */
  update: (
    dt: number,
    moving: boolean,
    firing: boolean,
    leftReach?: boolean,
    rightReach?: boolean,
    tuck?: number
  ) => void
}

const buildArm = (side: 'left' | 'right'): EwallModel['leftArm'] => {
  const root = new THREE.Group()
  const upper = new THREE.Group()
  // Shoulder ball.
  const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), matBody(COLORS.joint))
  upper.add(shoulder)
  // Upper arm segment.
  const upperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 0.16), matBody(COLORS.chassis))
  upperMesh.position.y = -0.26
  upper.add(upperMesh)
  // Accent stripe.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.17), matBody(COLORS.accent))
  stripe.position.y = -0.1
  upper.add(stripe)
  root.add(upper)

  // Elbow + lower arm.
  const lower = new THREE.Group()
  lower.position.y = -0.55
  const elbow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), matBody(COLORS.joint))
  lower.add(elbow)
  const lowerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), matBody(COLORS.chassisDark))
  lowerMesh.position.y = -0.24
  lower.add(lowerMesh)
  upper.add(lower)

  // Hand — palm + 3 fingers + thumb.
  const hand = new THREE.Group()
  hand.position.y = -0.5
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), matBody(COLORS.chassis))
  hand.add(palm)
  const fingerMat = matBody(COLORS.chassisDark)
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), fingerMat)
    f.position.set(-0.07 + i * 0.07, -0.11, 0.03)
    hand.add(f)
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), fingerMat)
  thumb.position.set(side === 'left' ? 0.13 : -0.13, -0.06, 0.03)
  thumb.rotation.z = side === 'left' ? -0.4 : 0.4
  hand.add(thumb)
  lower.add(hand)

  return { root, upper, lower, hand }
}

export const buildEwall = (): EwallModel => {
  const root = new THREE.Group()
  root.name = 'ewall'

  const chassis = new THREE.Group()
  chassis.name = 'ewall-chassis'
  root.add(chassis)

  // Core torso box — rounded via bevel geometry substitute (simple flat box to
  // keep the poly budget at ~350).
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), matBody(COLORS.chassis))
  torso.position.y = 0
  chassis.add(torso)

  // Front accent plate. Sits on chassis-local +Z — NOT visible in first-
  // person: the camera looks toward chassis-local -Z (after the yaw
  // convention), so the plate/visor render only for third-person or mirror
  // cameras. Keeping them on +Z is what stops them blocking the view.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.04), matBody(COLORS.accent, {
    emissive: 0x332200,
    emissiveIntensity: 0.3
  }))
  plate.position.set(0, 0.1, 0.32)
  chassis.add(plate)

  // Head — compact dome with a visor strip.
  const head = new THREE.Group()
  head.position.y = 0.75
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.5), matBody(COLORS.chassis))
  head.add(headBox)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.06),
    new THREE.MeshStandardMaterial({
      color: COLORS.visor,
      emissive: 0x1e7aa8,
      emissiveIntensity: 0.9,
      metalness: 0.3,
      roughness: 0.25,
      flatShading: true
    })
  )
  visor.position.set(0, 0.05, 0.26)
  head.add(visor)
  // Antenna.
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), matBody(COLORS.joint))
  antenna.position.set(0.2, 0.3, 0)
  head.add(antenna)
  const antennaTip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), matBody(COLORS.hot, {
    emissive: 0x552200,
    emissiveIntensity: 0.8
  }))
  antennaTip.position.set(0.2, 0.42, 0)
  head.add(antennaTip)
  chassis.add(head)

  // Head anchor — the actual camera mount. Kept on chassis-local +Z so the
  // camera lives inside the head looking back out through the +Z wall
  // (back-face-culled). Arms on the -Z side end up roughly 0.34 m in front
  // of the camera — visible, clear of the 0.1 m near plane.
  const headAnchor = new THREE.Object3D()
  headAnchor.position.set(0, 0.85, 0.12)
  chassis.add(headAnchor)

  // Tank-tread lower half — big chunky base so Ewall feels lunar-grade.
  const baseSkirt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.85), matBody(COLORS.chassisDark))
  baseSkirt.position.y = -0.7
  chassis.add(baseSkirt)
  // Treads left/right.
  for (const sx of [-0.55, 0.55]) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, 0.95), matBody(COLORS.rubber))
    tread.position.set(sx, -0.68, 0)
    chassis.add(tread)
    // Wheel accents.
    for (const sz of [-0.35, 0, 0.35]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 10), matBody(COLORS.chassis))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(sx, -0.68, sz)
      chassis.add(wheel)
    }
  }

  // Storage container — a scuffed cargo box bolted to the rear (chassis-local
  // +Z). Sits low on the backpack plane so the solar panel has room above.
  // Intended as a visual cue for ore/materials carried; the mesh is static
  // for now but the `storage` handle is exposed on the model so a later
  // iteration can show a fill indicator.
  const storage = new THREE.Group()
  storage.name = 'ewall-storage'
  const storageBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.42, 0.26),
    matBody(COLORS.storage, { metalness: 0.35, roughness: 0.6 })
  )
  storage.add(storageBox)
  // Lid seam — a thin darker strip near the top.
  const storageLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.04, 0.27),
    matBody(COLORS.joint)
  )
  storageLid.position.y = 0.16
  storage.add(storageLid)
  // Two latches for character.
  for (const sx of [-0.22, 0.22]) {
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), matBody(COLORS.accent))
    latch.position.set(sx, 0.16, 0.14)
    storage.add(latch)
  }
  storage.position.set(0, -0.25, 0.4)
  chassis.add(storage)

  // Solar cell — big flat panel mounted on the rear, tilted backward so it
  // catches the sun without occluding the storage box below it. This is
  // Ewall's power source: the gameplay layer treats it as "undamaged →
  // energy stays full; damaged → energy drains". Swap the material out
  // (via `solarCell.material = ...`) to visualise a broken state.
  const SOLAR_W = 1.05, SOLAR_H = 0.75
  const solarGroup = new THREE.Group()
  solarGroup.name = 'ewall-solar'
  // Frame behind the glass, slightly larger so it reads as a mounting plate.
  const solarFrame = new THREE.Mesh(
    new THREE.BoxGeometry(SOLAR_W + 0.08, SOLAR_H + 0.08, 0.04),
    matBody(COLORS.solarFrame, { metalness: 0.7, roughness: 0.4 })
  )
  solarFrame.position.z = -0.02
  solarGroup.add(solarFrame)
  // Main PV face — emissive kept subtle so the panel reads "dark glossy" in
  // day light but still glints when the sun catches it.
  const solarCell = new THREE.Mesh(
    new THREE.BoxGeometry(SOLAR_W, SOLAR_H, 0.03),
    new THREE.MeshStandardMaterial({
      color: COLORS.solarCell,
      emissive: 0x0a1a40,
      emissiveIntensity: 0.25,
      metalness: 0.45,
      roughness: 0.3,
      flatShading: true
    })
  )
  solarCell.name = 'ewall-solar-cell'
  solarGroup.add(solarCell)
  // Cell-grid lines — 4×3 subdivisions drawn as thin frame overlays. Cheap
  // way to sell "photovoltaic cells" without adding a texture.
  const cellGridMat = matBody(COLORS.solarFrame, { metalness: 0.6, roughness: 0.5 })
  for (let i = 1; i < 4; i++) {
    const x = -SOLAR_W / 2 + (i * SOLAR_W) / 4
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.015, SOLAR_H, 0.035), cellGridMat)
    line.position.set(x, 0, 0.001)
    solarGroup.add(line)
  }
  for (let j = 1; j < 3; j++) {
    const y = -SOLAR_H / 2 + (j * SOLAR_H) / 3
    const line = new THREE.Mesh(new THREE.BoxGeometry(SOLAR_W, 0.015, 0.035), cellGridMat)
    line.position.set(0, y, 0.001)
    solarGroup.add(line)
  }
  // Mount arm connecting the panel to the chassis — a short strut so the
  // panel doesn't look glued to the torso.
  const solarStrut = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.4, 0.08),
    matBody(COLORS.chassisDark)
  )
  solarStrut.position.set(0, -SOLAR_H / 2 - 0.18, -0.05)
  solarGroup.add(solarStrut)
  // Position + tilt: mounted above the storage box, angled ~15° backward so
  // its face points up-and-back (toward the sun which is high + behind the
  // player spawn orientation).
  solarGroup.position.set(0, 0.3, 0.45)
  solarGroup.rotation.x = -0.26
  chassis.add(solarGroup)

  // Arms — shoulder mounts pulled in and sat higher than the old 0.45 perch
  // so the hands drop into the FPS viewmodel band (lower-centre of frustum).
  // Shoulders live on the camera-forward side (chassis-local -Z) and the
  // upper-arm swings *toward* -Z with a positive X rotation.
  const SHOULDER_Y = 0.58
  const SHOULDER_Z = -0.22
  const SHOULDER_X = 0.38

  const leftArm = buildArm('left')
  leftArm.root.position.set(-SHOULDER_X, SHOULDER_Y, SHOULDER_Z)
  leftArm.upper.rotation.x = 1.05       // swing forward along camera-forward
  leftArm.upper.rotation.z = 0.18       // splay slightly outward
  leftArm.lower.rotation.x = 0.75       // forearm bent forward so hand leads
  chassis.add(leftArm.root)

  const rightArm = buildArm('right')
  rightArm.root.position.set(SHOULDER_X, SHOULDER_Y, SHOULDER_Z)
  rightArm.upper.rotation.x = 1.05
  rightArm.upper.rotation.z = -0.18
  rightArm.lower.rotation.x = 0.75
  chassis.add(rightArm.root)

  // Flamethrower — attached to right hand, muzzle points forward.
  const flamethrower = new THREE.Group()
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 10), matBody(COLORS.hot))
  tank.rotation.z = Math.PI / 2
  flamethrower.add(tank)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8), matBody(COLORS.chassisDark, {
    metalness: 0.8,
    roughness: 0.3
  }))
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0.28, 0, 0)
  flamethrower.add(barrel)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.05), matBody(COLORS.joint))
  grip.position.set(0.05, -0.18, 0)
  flamethrower.add(grip)

  const flamethrowerMuzzle = new THREE.Object3D()
  flamethrowerMuzzle.position.set(0.52, 0, 0)
  flamethrower.add(flamethrowerMuzzle)

  // Attach flamethrower to right hand and orient so the muzzle points forward
  // (negative Z in the chassis frame) regardless of the hand's local rotation.
  rightArm.hand.add(flamethrower)
  flamethrower.rotation.set(Math.PI / 2, Math.PI / 2, 0)
  flamethrower.position.set(0, -0.05, 0.08)

  const clock = { t: 0 }
  // Smoothed [0..1] reach amount per arm. Mouse-button input is a hard
  // toggle; damping here gives the punch/grab motion some inertia.
  const reachAmt = { left: 0, right: 0 }
  // Smoothed [0..1] tuck amount. 1 = arms pulled up and inward so a ramp or
  // boulder face the bot is driving into doesn't clip the forearms/hands.
  // Input target is the physics probe result; damping prevents the pose
  // snapping when the ray flickers on/off at the limit of its reach.
  let tuckAmt = 0
  const update = (
    dt: number,
    moving: boolean,
    firing: boolean,
    leftReach = false,
    rightReach = false,
    tuck = 0
  ) => {
    clock.t += dt
    // Idle hover: subtle Y bob of arms.
    const bobAmp = moving ? 0.03 : 0.012
    const bobFreq = moving ? 8 : 2.2
    const b = Math.sin(clock.t * bobFreq) * bobAmp
    leftArm.root.position.y = SHOULDER_Y + b
    rightArm.root.position.y = SHOULDER_Y - b

    // Smooth reach state toward target (0 released, 1 pressed).
    const k = Math.min(1, dt * 12)
    reachAmt.left += ((leftReach ? 1 : 0) - reachAmt.left) * k
    reachAmt.right += ((rightReach ? 1 : 0) - reachAmt.right) * k
    // Tuck follows its own slower lambda — big postural change, not a punch.
    const kTuck = Math.min(1, dt * 8)
    tuckAmt += (Math.max(0, Math.min(1, tuck)) - tuckAmt) * kTuck
    // Small wrist wobble at the apex sells it as an active "grab".
    const wobble = Math.sin(clock.t * 9) * 0.06

    // Tuck deltas: pull upper-arm up (reduce forward swing) and bring elbow in
    // toward chest (reduce splay); fold forearm up so the hand sits in front
    // of the visor. Additive on top of rest pose + reach/recoil.
    const upperTuck = -0.85 * tuckAmt   // 1.05 → 0.20 (arm near-horizontal, hands high)
    const splayTuck = -0.12 * tuckAmt   // shoulder rolls inward
    const lowerTuck = 0.55 * tuckAmt   // forearm folds up toward visor

    // Left arm: push forward + straighten elbow when held.
    leftArm.upper.rotation.x = 1.05 + upperTuck + reachAmt.left * (0.55 + wobble * reachAmt.left)
    leftArm.upper.rotation.z = 0.18 + splayTuck
    leftArm.lower.rotation.x = 0.75 + lowerTuck - reachAmt.left * 0.42

    // Right arm: firing recoil dominates (flamethrower). When not firing,
    // RMB drives a reach identical to the left arm.
    const recoil = firing ? (Math.sin(clock.t * 32) * 0.05 + 0.08) : 0
    const rReach = firing ? 0 : reachAmt.right
    rightArm.upper.rotation.x = 1.05 + upperTuck - recoil * 0.35 + rReach * (0.55 + wobble * rReach)
    rightArm.upper.rotation.z = -0.18 - splayTuck
    rightArm.lower.rotation.x = 0.75 + lowerTuck - recoil * 0.55 - rReach * 0.42

    // Visor flicker when firing.
    const visorMat = visor.material as THREE.MeshStandardMaterial
    visorMat.emissiveIntensity = firing ? 1.4 + Math.sin(clock.t * 42) * 0.2 : 0.9
  }

  return {
    root,
    chassis,
    headAnchor,
    leftArm,
    rightArm,
    flamethrower,
    flamethrowerMuzzle,
    solarCell,
    storage,
    update
  }
}

/**
 * Scenery variant — a busted Ewall lying on the lunar dust. Used as a quest
 * landmark (valley, rift, quarry) that the player will later visit to swap
 * transmission modules. Static: no `update()` is wired, mesh pose is frozen
 * at build time.
 *
 * Visually:
 *   - Chassis tilted + rolled so the bot reads as "keeled over", not standing.
 *   - Arms slumped: forearm flopped, upper arm dropped.
 *   - Solar panel darkened + given a small rotational offset so it looks
 *     bent/popped out of its mount.
 *   - All materials tinted darker (dust + sun-bleaching) — we do this by
 *     swapping the colour on MeshStandardMaterials we own (safe because
 *     buildEwall creates fresh materials per instance).
 *
 * Returns the same EwallModel shape (convenient for colliders, future
 * interact logic) but consumers should skip calling `update`.
 */
export const buildBrokenEwall = (rollSign: 1 | -1 = 1): EwallModel => {
  const model = buildEwall()
  // Freeze arms in a slumped pose before we tilt the chassis.
  model.leftArm.upper.rotation.x = 0.2
  model.leftArm.upper.rotation.z = 0.5 * rollSign
  model.leftArm.lower.rotation.x = 1.3
  model.rightArm.upper.rotation.x = 0.15
  model.rightArm.upper.rotation.z = -0.5 * rollSign
  model.rightArm.lower.rotation.x = 1.5

  // Lay the bot on its side — roll around Z so the treads face outward, with
  // a small forward pitch so the head ends up in the dust.
  model.root.rotation.z = (Math.PI / 2 - 0.15) * rollSign
  model.root.rotation.x = 0.1

  // Darken every owned MeshStandardMaterial. We only touch materials we
  // created in buildEwall (fresh instances each call), so this doesn't leak.
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!(mesh as any).isMesh) return
    const mat = mesh.material
    if (!(mat instanceof THREE.MeshStandardMaterial)) return
    mat.color.multiplyScalar(0.55)
    // Kill glowing visor/plate/antenna accents — the bot is dead.
    if (mat.emissiveIntensity > 0) {
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
    }
    mat.roughness = Math.min(1, mat.roughness + 0.25)
  })

  // Crack the solar cell: darken further + offset its mount so it reads as
  // damaged from the outside. Keep the same mesh so collision/bounds don't
  // shift.
  const cellMat = model.solarCell.material as THREE.MeshStandardMaterial
  cellMat.color.setHex(0x1a1a20)
  cellMat.emissive.setHex(0x000000)
  cellMat.emissiveIntensity = 0
  model.solarCell.rotation.z = 0.18 * rollSign
  model.solarCell.position.x += 0.05 * rollSign

  return model
}
