<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { mountThreeScene } from '@/game/useThreeScene'
import { createPhysics, type PhysicsHandle } from '@/game/usePhysics'
import { createGameLoop } from '@/game/useGameLoop'
import { buildMoonWorld, WORLD_BOUNDARY, type QuarryStone, type WorldLandmark } from '@/game/MoonWorld'
import { buildEwall } from '@/game/EwallRobot'
import { buildFlamethrower } from '@/game/Flamethrower'
import { buildMeteorShower, type MeteorShowerSystem } from '@/game/MeteorShower'
import type { MissionPhase } from '@/game/dialog'
import {
  createPlayerState,
  stepPlayer,
  type PlayerState
} from '@/game/PlayerController'
import useInputMap from '@/use/useInputMap'
import useUser from '@/use/useUser'
import useMission from '@/use/useMission'
import { skipDialog, advanceLine, pickChoice as pickDialogChoice, startDialog as startDialogDirect, currentLine as currentDialogLine } from '@/use/useDialog'
import { MISSION_OBJECTIVES } from '@/game/dialog'
import useInventory from '@/use/useInventory'
import usePerf from '@/use/usePerf'
import { useMusic } from '@/use/useSound'
import useSounds from '@/use/useSound'
import { prependBaseUrl } from '@/utils/function'
import useCheats, { cheatSignals } from '@/use/useCheats'
import { clamp, damp } from '@/utils/function'
import MissionHUD from '@/components/molecules/MissionHUD.vue'
import DialogBanner from '@/components/molecules/DialogBanner.vue'
import CraftingMenu from '@/components/organisms/CraftingMenu.vue'
import PauseMenu from '@/components/organisms/PauseMenu.vue'
import RetroRadar from '@/components/molecules/RetroRadar.vue'
import TuskPortrait from '@/components/molecules/TuskPortrait.vue'
import GameOverScreen from '@/components/organisms/GameOverScreen.vue'
import { currentLine } from '@/use/useDialog'

useCheats()
const { startAmbient, stopAmbient } = useMusic()
const { playSound } = useSounds()
const { pressed } = useInputMap()
const { userMouseSensitivity, userInvertY, userSoundVolume, isPauseMenuOpen } = useUser()
const {
  phase,
  setPhase,
  setPhaseUnsafe,
  startDialog,
  showMissionBanner,
  isDialogOpen,
  isMonologue,
  isAwaitingChoice,
  preloadAllVoiceLines,
  tickReminders,
  hasSalvaged,
  markSalvaged,
  snapshotSalvaged,
  restoreSalvaged,
  salvagedCount
} = useMission()
const {
  fuel,
  ore,
  metal,
  parts,
  hasFlagSeen,
  energy,
  isSolarCellBroken,
  isCommsBroken,
  setFlagSeen,
  addOre,
  consumeOre,
  addMetal,
  addParts,
  drainFuel,
  refillFuel,
  hasFuel,
  tickEnergy,
  breakSolarCell,
  breakComms,
  repairComms,
  snapshotInventory,
  restoreInventory
} = useInventory()
const { tick: tickPerf } = usePerf()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isCraftingOpen = ref(false)
const canCraft = ref(false)
const interactPrompt = ref<string | null>(null)

// Audio state — per-system throttles so loops don't spam new HTMLAudioElements.
const sfx = {
  // Flamethrower: a fresh 1/2 clip every 0.7s while F is held.
  flameNext: 0,
  flameToggle: 0,
  // Wheel-moving loop (looped HTMLAudioElement, volume modulated at runtime).
  wheelAudio: null as HTMLAudioElement | null,
  wheelTargetVol: 0,
  // Drilling crossfade (random 1..3 while cutting quarry stone).
  drillNext: 0
}

// Out-of-bounds nag state — `armed` flips false once Tusk has complained,
// and only re-arms after the player returns well inside the world (the
// hysteresis band is applied in the fixed-step check below).
const oob = { armed: true }

// Arm-tuck state. When the forward ray probe hits an obstacle within
// TUCK_PROBE_DIST, `target` ramps up to 1 and Ewall folds his forearms up
// and inward so they don't clip the obstacle. `prevTarget` is used to
// detect the 0→1 onset so we play the robot-arm-move clip exactly once
// when the tuck begins.
const TUCK_PROBE_DIST = 1.5
const armTuck = { target: 0, prevTarget: 0 }

// Collision debug (wireframe overlay of every Rapier collider) — gated by
// dev-build + localStorage flag so production builds never ship the lines.
const isDebug = import.meta.env.DEV
const isCollisionDebug = (() => {
  try { return isDebug && localStorage.getItem('collision') === 'true' }
  catch { return false }
})()
let collisionLines: THREE.LineSegments | null = null
// Toggleable via G (rebindable): hides every HUD layer for clean in-engine
// screenshots. The game keeps running normally underneath — only visibility
// changes, not simulation.
const isScreenshotMode = ref(false)
watch(() => pressed.screenshot, (v, prev) => {
  if (v && !prev) isScreenshotMode.value = !isScreenshotMode.value
})
const markerScreen = ref<{ x: number; y: number; visible: boolean; distance: number } | null>(null)
const radarState = ref<{ dx: number | null; dz: number | null; yaw: number; distance: number }>({
  dx: null, dz: null, yaw: 0, distance: 0
})
const radarLabel = computed(() => {
  const d = radarState.value.distance
  return d > 0 ? `${Math.round(d)} m` : ''
})

// Dispose-on-unmount handles.
let sceneHandle: ReturnType<typeof mountThreeScene> | null = null
let physics: PhysicsHandle | null = null
let loop: ReturnType<typeof createGameLoop> | null = null
let pointerLockCleanup: (() => void) | null = null
let fpsResizeCleanup: (() => void) | null = null

// -- Pointer lock + mouse delta accumulator ---------------------------------
const mouse = { dx: 0, dy: 0, locked: false, leftDown: false, rightDown: false }
const consumeMouse = () => {
  const d = { dx: mouse.dx, dy: mouse.dy }
  mouse.dx = 0
  mouse.dy = 0
  return d
}

// Whether mouse-button arm actions should drive the robot this frame. We gate
// on an actual pointer lock so clicks that *open* the lock (first click after
// ESC, e.g.) don't accidentally trigger a phantom arm reach.
const canInteract = () =>
  mouse.locked
  && !isDialogOpen.value
  && !isPauseMenuOpen.value
  && !isCraftingOpen.value

const setupPointerLock = (canvas: HTMLCanvasElement) => {
  const onMouseMove = (e: MouseEvent) => {
    if (!mouse.locked) return
    mouse.dx += e.movementX
    mouse.dy += e.movementY
  }
  const onPointerLockChange = () => {
    mouse.locked = document.pointerLockElement === canvas
    if (!mouse.locked) { mouse.leftDown = false; mouse.rightDown = false }
  }
  const onClick = () => {
    if (isPauseMenuOpen.value || isCraftingOpen.value || isDialogOpen.value) return
    if (!mouse.locked) canvas.requestPointerLock?.()
  }
  const onMouseDown = (e: MouseEvent) => {
    if (!canInteract()) return
    if (e.button === 0) {
      mouse.leftDown = true
      playSound('robot-arm-move', 0.55)
    } else if (e.button === 2) {
      mouse.rightDown = true
      playSound('robot-arm-move', 0.55)
    }
  }
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouse.leftDown = false
    else if (e.button === 2) mouse.rightDown = false
  }
  // Suppress the browser context menu so RMB is usable as an in-game input.
  const onContextMenu = (e: MouseEvent) => { e.preventDefault() }
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  pointerLockCleanup = () => {
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('pointerlockchange', onPointerLockChange)
  }
}

// -- Fire control ------------------------------------------------------------
const fire = {
  firing: false,
  flameSystem: null as ReturnType<typeof buildFlamethrower> | null,
  muzzle: null as THREE.Object3D | null
}

// -- Quarry stone smelting ---------------------------------------------------
// Each cut stone tracks an HP fraction in [0..1]. The flamethrower cone picks
// one stone per frame (the most-aligned one within range) and bleeds its HP;
// reaching 0 drops the mesh + collider and grants one ore to the inventory.
// The HUD renders a small bar per stone that's within DAMAGE_COLOR_RANGE
// horizontal metres of the player.
const STONE_BURN_SECONDS = 2.6      // time to fully smelt at point-blank
const STONE_HIT_RANGE = 9.0         // max muzzle→stone distance the cone bites
// Wide forgiving cone — the cut stones are ankle-height in front of the
// robot's chassis, so a tight crosshair-style cone would require the
// player to aim downward past their own arms. 35° half-angle (~70° full)
// treats any stone the player could plausibly be pointing at as a hit.
const STONE_CONE_COS = Math.cos(35 * Math.PI / 180)
// Per-stone bounding radius padding for the hit test — stones are ~0.8 m
// boxes and we want to count "brushed the edge with the cone" as a hit.
const STONE_HIT_PADDING = 0.75
const STONE_BAR_RANGE = 1.5         // distance the HP bar becomes visible
interface LiveStone extends QuarryStone { hp: number; alive: boolean }
let stones: LiveStone[] = []
// Cached base colour per stone for the damage tint lerp. Set at scene init.
const stoneBaseColor = new THREE.Color(0xa8a29a)
const stoneHotColor = new THREE.Color(0xff5a1a)
// Reactive list the HUD reads — one entry per visible HP bar.
const stoneBars = ref<{ id: string; x: number; y: number; hp: number }[]>([])

// -- Meteor strike + cinematic ----------------------------------------------
// The moment the player enters the exploration target radius, the game
// takes camera control, spawns the meteor shower, and drives a scripted
// 4-ish second flyby. `cinematic` gates both the forced camera look-at and
// the input blackout; `meteor` owns the falling-rock system that outlives
// the cinematic by a beat while the final stragglers connect.
const CINEMATIC_TRACK_SECONDS = 4.2
const METEOR_TRIGGER_RADIUS = 50
let meteor: MeteorShowerSystem | null = null
const cinematic = { active: false, elapsed: 0, ended: false }
// Ewall-9 — the rebel predecessor who approaches after solar is repaired.
// Reuses the `buildEwall` factory with a colour-shifted material so the
// silhouette is instantly recognisable. Spawned 9 m to the player's right
// on a heading that turns him toward the player over the first beat of
// the conversation.
let ewall9: ReturnType<typeof buildEwall> | null = null
const ewall9Anim = { walkT: 0, targetYaw: 0, startPos: new THREE.Vector3(), endPos: new THREE.Vector3() }

// Cached explorer-target landmark position; resolved at world build.
let explorerTarget: THREE.Vector3 | null = null

// -- Airlock (pressure chamber) --------------------------------------------
// Two-door vestibule: the outer "space gate" and the inner "dome gate"
// never open at the same time. State is driven entirely from player
// position — approaching from outside opens the outer door, entering the
// chamber closes it, and once the outer is sealed the inner starts to
// cycle up (and vice versa for the return trip). The 0..1 open fractions
// drive each door mesh's local Y between `doorClosedY` and `doorOpenY`.
let airlockOuterDoor: THREE.Mesh | null = null
let airlockInnerDoor: THREE.Mesh | null = null
let airlockWorldPos: THREE.Vector3 | null = null
const airlock = {
  outerOpen: 0,
  innerOpen: 0,
  closedY: 0,
  openY: 0,
  outerDoorZ: 0,   // world Z of outer door
  innerDoorZ: 0,   // world Z of inner door
  halfDepth: 0
}
const AIRLOCK_DOOR_RADIUS = 5    // metres a door reacts to

// Salvage interact prompt — surfaced when the player is near one of the
// three broken Ewalls AND hasn't yet salvaged that particular chassis.
interface NearbySalvage { kind: 'valley' | 'rift' | 'quarry'; landmark: WorldLandmark['kind'] }
let nearestSalvage: NearbySalvage | null = null

// -- Game over + checkpoint --------------------------------------------------
// Snapshot of restoreable state taken the instant the meteor shower ends.
// "Continue from last checkpoint" rewinds the run here so energy death or
// any other wipe never costs the player the whole campaign.
interface Checkpoint {
  inventory: ReturnType<typeof snapshotInventory>
  phase: MissionPhase
  playerX: number
  playerZ: number
  playerY: number
  yaw: number
  salvaged: ReturnType<typeof snapshotSalvaged>
}
let checkpoint: Checkpoint | null = null
// Mirror of `checkpoint !== null` so the GameOverScreen template binding
// reactively toggles Continue once the meteor-strike handshake saves.
const hasCheckpoint = ref(false)
const gameOverOpen = ref(false)
const gameOverReason = ref<string | null>(null)

const saveCheckpoint = () => {
  if (!player) return
  checkpoint = {
    inventory: snapshotInventory(),
    phase: phase.value as MissionPhase,
    playerX: player.position.x,
    playerZ: player.position.z,
    playerY: player.position.y,
    yaw: player.yaw,
    salvaged: snapshotSalvaged()
  }
  hasCheckpoint.value = true
}

const restoreCheckpoint = () => {
  if (!checkpoint || !player) return
  restoreInventory(checkpoint.inventory)
  restoreSalvaged(checkpoint.salvaged)
  setPhaseUnsafe(checkpoint.phase)
  player.position.set(checkpoint.playerX, checkpoint.playerY, checkpoint.playerZ)
  player.yaw = checkpoint.yaw
  player.pitch = 0
  player.forwardVel = 0
  player.strafeVel = 0
  player.verticalVel = 0
  gameOverOpen.value = false
  gameOverReason.value = null
  // Un-pause the loop if it's still flagged paused from the Game Over.
  loop?.setPaused(false)
}

const showGameOver = (reason: string) => {
  gameOverOpen.value = true
  gameOverReason.value = reason
  loop?.setPaused(true)
}

const onQuitToMenu = () => {
  // For now "quit" just resets the overlay and lets the pause menu handle
  // the actual navigation. A dedicated title screen is future work.
  gameOverOpen.value = false
  gameOverReason.value = null
  isPauseMenuOpen.value = true
  loop?.setPaused(true)
}

/** Fire the meteor strike cinematic: phase flip, camera lock, start dialog,
 *  spawn the shower system. The shower's flyby SFX kicks off synchronously
 *  inside `buildMeteorShower` so there's no perceptual gap between the
 *  "look up" moment and the audio. */
const triggerMeteorStrike = () => {
  if (!player || !sceneHandle) return
  setPhaseUnsafe('meteor_impact')
  startDialog('mission_meteor_impact')
  cinematic.active = true
  cinematic.elapsed = 0
  cinematic.ended = false
  meteor = buildMeteorShower(
    player.position.clone(),
    player.yaw,
    heightAtCached
  )
  sceneHandle.scene.add(meteor.root)
}

// Cached heightAt reference — buildMeteorShower needs it but the closure
// captured inside the async onMounted block isn't visible here. We
// populate `heightAtCached` at world-build time and route meteor queries
// through it so the spawn call above works out-of-line.
let heightAtCached: (x: number, z: number) => number = () => 0

/** End the cinematic: hand camera back, mark modules broken, save a
 *  checkpoint so the player can retry without redoing the first mission.
 *  The dialog chain's onDone carries us from `mission_meteor_impact` →
 *  `mission_post_meteor`; phase advancement is handled by the dialog
 *  close watcher. */
const endMeteorCinematic = () => {
  if (cinematic.ended) return
  cinematic.ended = true
  cinematic.active = false
  setPhaseUnsafe('post_meteor')
  breakSolarCell()
  breakComms()
  showMissionBanner('Communications offline · Solar cell damaged.', 5500)
  // Snapshot AFTER module damage is applied so the restore state reflects
  // the start of the recovery arc, not the pre-strike explorer leg.
  saveCheckpoint()
}

/** Spawn the Ewall-9 chassis off-screen to the player's right, facing
 *  inward — we animate a short drive-in at the start of his dialog so the
 *  player sees him arrive rather than materialise. `ewall9Anim` drives the
 *  tween from startPos → endPos and a yaw rotation toward the player. */
const spawnEwall9 = () => {
  if (ewall9 || !player || !sceneHandle) return
  ewall9 = buildEwall()
  // Colour the chassis chalk-white-over-dust so it reads "weathered
  // survivor" at a glance and not "duplicate of the player".
  ewall9.chassis.traverse((o: any) => {
    if (o.isMesh && o.material?.color) {
      const mat = (o.material = o.material.clone())
      mat.color.offsetHSL(0, -0.25, 0.08)
    }
  })
  // Place 9 m to the player's right, offset forward slightly so the drive-
  // in carries him into the player's screen from the side.
  const right = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw))
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw))
  const start = player.position.clone()
    .addScaledVector(right, 14)
    .addScaledVector(forward, 3)
  start.y = heightAtCached(start.x, start.z)
  const end = player.position.clone()
    .addScaledVector(right, 5)
    .addScaledVector(forward, 0.5)
  end.y = heightAtCached(end.x, end.z)
  ewall9.root.position.copy(start)
  // Face forward along the approach direction initially; the tween turns
  // him toward the player as he arrives.
  const approachDir = end.clone().sub(start).normalize()
  ewall9.chassis.rotation.y = Math.atan2(-approachDir.x, -approachDir.z)
  ewall9Anim.walkT = 0
  ewall9Anim.startPos.copy(start)
  ewall9Anim.endPos.copy(end)
  // Final yaw: face the player. Use the direction from end → player.
  const toPlayer = player.position.clone().sub(end).normalize()
  ewall9Anim.targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z)
  sceneHandle!.scene.add(ewall9.root)
}

const destroyStone = (s: LiveStone) => {
  if (!s.alive) return
  s.alive = false
  s.hp = 0
  // Pull the mesh out of the quarry group; dispose its cloned material so
  // the per-stone tint state doesn't leak once the block is gone.
  s.mesh.parent?.remove(s.mesh)
  ;(s.mesh.material as THREE.Material)?.dispose()
  physics?.removeBodyByKey(s.key)
  addOre(1)
  playSound('meteor-impact-2', 0.55)
  // Mission progression mirrors the old proximity flow.
  if (ore.value >= 3 && (phase.value as string) !== 'quarry_done') {
    setPhase('quarry_done')
    startDialog('mission_quarry_done')
  } else {
    showMissionBanner(`Stone +1 · total ${ore.value}`, 2400)
  }
}

// -- Landmarks cache for proximity checks ------------------------------------
let landmarks: WorldLandmark[] = []
const L = new Map<WorldLandmark['kind'], THREE.Vector3>()
const distanceTo = (kind: WorldLandmark['kind'], pos: THREE.Vector3) => {
  const p = L.get(kind)
  return p ? p.distanceTo(pos) : Infinity
}

// -- Robot + player state ----------------------------------------------------
let player: PlayerState | null = null
let ewall: ReturnType<typeof buildEwall> | null = null
// Stores the raw input speed modifier so dialog monologue slows the robot.
let speedMod = 1
// Camera smoothing helper — the camera lags the chassis a touch for weight.
const camBob = { t: 0 }
// Visual-Y lag for Ewall. Physics commits full resolved Y each frame (no
// post-solve damping — that's what caused the "sliding along triangles" bug
// by putting the capsule below ground). To still absorb autostep's 0.4–1.0 m
// hops, we smooth the DRAWN Ewall Y here. X/Z/rotation remain authoritative
// from physics so collision stays in lockstep with the render.
const visual = { y: 0, primed: false }
const VISUAL_Y_RATE_UP = 14      // gentle climb-in
const VISUAL_Y_RATE_DOWN = 22    // snappier settling on descents
const VISUAL_Y_SNAP = 2.0        // re-sync on teleport / fall / cheat warp

// -- Handle pause: watch isPauseMenuOpen & drive the loop --------------------
watch(isPauseMenuOpen, (v) => {
  loop?.setPaused(v)
  if (v && document.pointerLockElement) document.exitPointerLock?.()
})

// Advance the mission phase when a dialog chain fully drains. Many of the
// new scripts rely on `onDone` auto-chaining (e.g. complete →
// explorer_briefing, post_meteor → salvage_intro), and on the closing
// edge of the whole chain we bump the phase so the HUD + reminder system
// catch up. Dialog choices that hard-pick an ending set the phase inside
// the choice-line watcher below; this watcher handles the linear
// fall-through cases only.
watch(isDialogOpen, (now, was) => {
  if (was && !now) {
    // `flag_found` is a transient phase that only exists while the
    // flag-arrive + quarry-briefing dialog chain plays. When the chain
    // drains we hand off to `quarry_walk` so the proximity trigger at
    // the quarry can fire and the HUD marker re-targets the quarry.
    if (phase.value === 'flag_found') setPhase('quarry_walk')
    else if (phase.value === 'complete') setPhase('explorer_walk')
    else if (phase.value === 'meteor_impact') {
      // Player skipped mid-cinematic — push straight into post_meteor so
      // the reminder + repair loop still kicks in.
      if (cinematic.active) endMeteorCinematic()
      setPhase('salvage_walk')
    }
    else if (phase.value === 'post_meteor') setPhase('salvage_walk')
  }
})

// Salvage bookkeeping: when all three broken Ewalls have been stripped,
// push the phase forward to `repair_walk` and show a banner pointing the
// player back to base. We don't auto-start a dialog here — the salvage
// quarry monologue (`mission_salvage_quarry`) already telegraphs the
// return instruction.
watch(salvagedCount, (n) => {
  if (n >= 3 && phase.value === 'salvage_walk') {
    setPhaseUnsafe('repair_walk')
    showMissionBanner('Salvage complete — head back to base.', 5000)
  }
})

// Solar-cell repair flips the phase to `ewall9_meeting` (done inside the
// crafting menu). React to the resulting dialog so Ewall-9 physically
// spawns and drives in while the script opens. We also keep the comms
// inventory flag in sync with the narrative endings — if the player
// picks "repair" in Ewall-9's final choice, the dialog asserts that
// comms are back online so we flip the state flag to match.
watch(() => phase.value, (p) => {
  if (p === 'ewall9_meeting') spawnEwall9()
  if (p === 'ending_comms_repaired' && isCommsBroken.value) repairComms()
})

// Ending flips — the dialog choice inside `mission_ewall9_approach` uses
// `nextDialog` to branch into the matching ending script. We watch for
// the first line id of each ending and set the terminal phase so the HUD
// objective updates immediately.
watch(() => currentLine.value?.id, (id) => {
  if (!id) return
  if (id === 'end_followed_1') setPhaseUnsafe('ending_followed_ewall9')
  else if (id === 'end_repair_1') setPhaseUnsafe('ending_comms_repaired')
})

// -- Release the cursor whenever a dialog takes over the UI, and re-lock
//    onto the canvas the moment it closes so the player drops back into
//    first-person look without having to click. Crafting menu and pause
//    menu are handled separately; we skip the re-lock if either is open.
watch(isDialogOpen, (open) => {
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock?.()
    return
  }
  if (isPauseMenuOpen.value || isCraftingOpen.value) return
  // Browsers throttle back-to-back lock requests; defer one frame.
  requestAnimationFrame(() => {
    if (!canvasRef.value) return
    if (isPauseMenuOpen.value || isCraftingOpen.value || isDialogOpen.value) return
    canvasRef.value.requestPointerLock?.()
  })
})

// -- Cheat signal handlers ---------------------------------------------------
watch(cheatSignals.teleportToFlag, () => {
  if (!player) return
  const p = L.get('flagpost'); if (p) { player.position.copy(p); player.position.y += 0.6 }
})
watch(cheatSignals.teleportToQuarry, () => {
  if (!player) return
  const p = L.get('quarry'); if (p) { player.position.copy(p); player.position.y += 0.6 }
})
watch(cheatSignals.teleportToBase, () => {
  if (!player) return
  const p = L.get('moonbase'); if (p) { player.position.copy(p); player.position.y += 0.6 }
})
watch(cheatSignals.refillFuel, () => refillFuel())
watch(cheatSignals.toggleNoClip, () => { if (player) player.noClip = !player.noClip })
watch(cheatSignals.advanceMission, () => {
  const order: typeof phase.value[] = ['boot', 'flag_walk', 'flag_found', 'quarry_walk', 'quarry_extract', 'quarry_done', 'return_to_base', 'craft', 'complete']
  const i = order.indexOf(phase.value)
  const next = order[i + 1]
  if (i >= 0 && next) setPhase(next)
})

// -- Mission-checkpoint cheats -----------------------------------------------
// Jump the whole game state to a named post-mission checkpoint: cancels any
// in-flight dialog, zeroes player velocity, teleports to a sensible spot for
// the next objective, and pre-fills inventory so the target phase can run
// without blockers from the prior one. All proximity auto-triggers in the
// fixed-step loop are gated by `phase.value === ...`, so setting the phase
// AFTER the teleport prevents old voice (flag-arrive, quarry-arrive,
// quarry-done) from firing as we warp through their landmarks.
const warpToLandmark = (kind: WorldLandmark['kind'], offset = new THREE.Vector3(0, 0.6, 0)) => {
  if (!player) return
  const p = L.get(kind)
  if (!p) return
  player.position.copy(p).add(offset)
  player.forwardVel = 0
  player.strafeVel = 0
  player.verticalVel = 0
  player.yawRate = 0
  player.isGrounded = true
  // Re-prime the visual-Y lag so the model doesn't slide up from the old y.
  visual.primed = false
}

watch(cheatSignals.jumpCheckpoint, () => {
  if (!player) return
  const cp = cheatSignals.checkpoint.value
  if (!cp) return
  // Always clear dialog first — any running voice line, prelude, or chained
  // onDone script would otherwise land on top of the new phase.
  skipDialog()
  // Every checkpoint past flag-posing implies the flag has been seen.
  setFlagSeen(true)
  refillFuel()
  if (cp === 'flag_done') {
    // Standing at the flag, mission_flag_arrive just wrapped. Next objective
    // is the quarry, so we hop straight to quarry_walk (flag_found is a
    // transient state with no proximity triggers of its own).
    warpToLandmark('flagpost')
    while (ore.value > 0) consumeOre(1)
    setPhase('quarry_walk')
    showMissionBanner('CHEAT · flag done — walk west to the quarry.', 3000)
  } else if (cp === 'quarry_done') {
    // Ore cut, ready to head back. Put the bot on the quarry rim with 3 ore
    // in `quarry_done` — that's the phase the base-proximity trigger gates
    // on (line "phase.value === 'quarry_done' && distanceTo('moonbase') < 6")
    // to auto-flip into `craft`. Using `return_to_base` here would leave the
    // flow stranded since nothing else transitions out of it.
    warpToLandmark('quarry')
    while (ore.value < 3) addOre(1)
    setPhase('quarry_done')
    showMissionBanner('CHEAT · quarry done — haul ore back to base.', 3000)
  } else if (cp === 'craft_ready') {
    // Back at the dome with ore; crafting menu is ready to smelt.
    warpToLandmark('moonbase', new THREE.Vector3(2, 0.6, 0))
    while (ore.value < 3) addOre(1)
    setPhase('craft')
    showMissionBanner('CHEAT · at base — press C to smelt ore.', 3000)
  } else if (cp === 'mission_done') {
    // Game wrapped: drop ore, grant metal, park at base.
    warpToLandmark('moonbase', new THREE.Vector3(2, 0.6, 0))
    while (ore.value > 0) consumeOre(1)
    if (metal.value < 1) addMetal(1)
    setPhase('complete')
    showMissionBanner('CHEAT · mission complete.', 3000)
  }
  cheatSignals.checkpoint.value = ''
})

// ---------------------------------------------------------------------------
// Main scene setup
// ---------------------------------------------------------------------------

onMounted(async () => {
  if (!canvasRef.value) return
  const canvas = canvasRef.value

  // Size to viewport.
  const getSize = () => ({ w: canvas.clientWidth, h: canvas.clientHeight })
  const { w, h } = getSize()
  const handle = mountThreeScene(canvas, w, h)
  sceneHandle = handle
  const { scene, camera, sunLight } = handle

  // World.
  const world = buildMoonWorld()
  scene.add(world.root)
  landmarks = world.landmarks
  for (const l of world.landmarks) L.set(l.kind, l.position)
  stones = world.quarryStones.map(s => ({ ...s, hp: 1, alive: true }))
  explorerTarget = L.get('explorer-target') ?? null
  heightAtCached = world.heightAt
  airlockOuterDoor = world.airlock.outerDoor
  airlockInnerDoor = world.airlock.innerDoor
  airlockWorldPos = world.airlockPos
  airlock.closedY = world.airlock.doorClosedY
  airlock.openY = world.airlock.doorOpenY
  airlock.halfDepth = world.airlock.depth / 2
  airlock.outerDoorZ = world.airlockPos.z + world.airlock.outerDoorZLocal
  airlock.innerDoorZ = world.airlockPos.z + world.airlock.innerDoorZLocal
  airlock.outerOpen = 0
  airlock.innerOpen = 0

  // Sun position overrides directional light target.
  const sun = (world.root as any).userData.sun as THREE.Object3D | undefined
  if (sun) {
    sunLight.position.copy(sun.position)
    sunLight.intensity = 1.35
  }

  // Robot.
  ewall = buildEwall()
  scene.add(ewall.root)

  // Parent a camera anchor to the head anchor.
  ewall.headAnchor.add(camera)
  camera.position.set(0, 0, 0)

  // Flamethrower VFX.
  fire.flameSystem = buildFlamethrower()
  scene.add(fire.flameSystem.points)
  fire.muzzle = ewall.flamethrowerMuzzle

  // Player starts in front of the airlock outer door. The new 24 m dome
  // + 9 m airlock push the outer face to roughly z = 33; spawn 7 m in
  // front of it so the opening animation is visible on boot.
  const start = new THREE.Vector3(0, 0, 40)
  start.y = world.heightAt(start.x, start.z)
  player = createPlayerState(start, Math.PI) // face the dome
  if (ewall) {
    ewall.root.position.copy(player.position)
    ewall.chassis.rotation.y = player.yaw
  }

  // Paint one initial frame synchronously so the moon world is visible
  // immediately — even before physics wasm finishes loading.
  handle.render()

  // Kick off the ambient music on first interaction (click opens pointer lock
  // too, which gives us the required user gesture).
  const playOnce = () => { startAmbient(); window.removeEventListener('click', playOnce) }
  window.addEventListener('click', playOnce, { once: true })

  // Resize observer.
  const onResize = () => {
    const { w, h } = getSize()
    handle.resize(w, h)
  }
  window.addEventListener('resize', onResize)
  fpsResizeCleanup = () => window.removeEventListener('resize', onResize)

  // Pointer lock.
  setupPointerLock(canvas)

  // Preload voice lines in background.
  preloadAllVoiceLines()

  // Fallback collider until rapier's wasm init finishes — just pass through
  // and report grounded so gravity doesn't accumulate before physics starts.
  const fallbackCollide = (_from: THREE.Vector3, to: THREE.Vector3) => ({
    position: to.clone(),
    grounded: true
  })

  // -- Loop ---------------------------------------------------------------
  loop = createGameLoop({
    onFixedStep: (dt) => {
      if (!player) return

      // Slow the robot during monologue; stop hard (with ramp) on choice.
      const targetMod =
        isAwaitingChoice.value ? 0 :
        isMonologue.value ? 0.4 :
        1
      speedMod = damp(speedMod, targetMod, 5, dt)

      const m = consumeMouse()
      // Apply speedMod by scaling the movement input via a fake press mask.
      // Simpler: run the step normally but temporarily scale forward/strafe
      // velocity by speedMod after integration.
      const sensitivity = (userMouseSensitivity.value ?? 0.5) * speedMod
      const ctrlInput = {
        pressed,
        mouseDX: m.dx,
        mouseDY: m.dy,
        sensitivity: sensitivity || 0.0001,
        invertY: !!userInvertY.value
      }
      // Zero movement input while the game is fully gated (dialog choice).
      if (speedMod < 0.05 && (isAwaitingChoice.value || isPauseMenuOpen.value)) {
        (ctrlInput as any).pressed = {
          forward: false, backward: false, strafeLeft: false, strafeRight: false,
          interact: false, flamethrower: false, craft: false, pause: false,
          sprint: false
        }
      }
      // Cinematic blackout — during the 4 s meteor flyby the player loses
      // every input channel: no look (mouseDX/DY zeroed), no movement, no
      // flamethrower. Movement is throttled a second time via speedMod so
      // residual velocity damps out without an abrupt stop.
      if (cinematic.active) {
        ctrlInput.mouseDX = 0
        ctrlInput.mouseDY = 0
        ;(ctrlInput as any).pressed = {
          forward: false, backward: false, strafeLeft: false, strafeRight: false,
          interact: false, flamethrower: false, craft: false, pause: false,
          sprint: false
        }
      }

      const prevX = player.position.x
      const prevZ = player.position.z

      const collide = physics?.collideMove ?? fallbackCollide
      stepPlayer(
        player,
        ctrlInput,
        dt,
        (x, z) => world.heightAt(x, z),
        (from, to) => collide(from, to)
      )
      // Scale velocities softly using speedMod (also slows accel).
      player.forwardVel *= 0.6 + 0.4 * speedMod
      player.strafeVel *= 0.6 + 0.4 * speedMod

      // Cinematic: point chassis + head at the big meteor each frame so the
      // player visibly "loses control" and the camera tracks the flyby.
      // `-sin(yaw), -cos(yaw)` is Ewall's forward convention (see
      // PlayerController), so yaw = atan2(-dx, -dz) aligns forward with
      // the direction-to-meteor.
      if (cinematic.active && meteor) {
        const mp = meteor.getBigMeteorPos()
        const headY = player.position.y + 1.6
        const dx = mp.x - player.position.x
        const dy = mp.y - headY
        const dz = mp.z - player.position.z
        const horiz = Math.hypot(dx, dz)
        player.yaw = Math.atan2(-dx, -dz)
        player.pitch = Math.max(-1.25, Math.min(1.25, Math.atan2(dy, Math.max(0.01, horiz))))
        player.forwardVel *= 0.2   // hard-cap any residual drift at 20%
        player.strafeVel *= 0.2
      }

      // Energy drain: once the solar cell is broken, movement distance (in
      // XZ) is the primary drain. `tickEnergy` also applies a small idle
      // drain so "stand perfectly still" is not a winning strategy.
      const distMoved = Math.hypot(player.position.x - prevX, player.position.z - prevZ)
      tickEnergy(dt, distMoved)
      // Power failure: the gauge hitting zero while solar is broken ends
      // the run. The pause-loop toggle is handled inside showGameOver.
      if (energy.value <= 0 && isSolarCellBroken.value && !gameOverOpen.value) {
        showGameOver('Solar cell drained. Ewall is immobile on the regolith.')
      }

      physics?.step(dt)

      // Update chassis transform to match player. X/Z/yaw are copied
      // authoritatively; Y is smoothed so autostep hops read as a glide.
      if (ewall) {
        if (!visual.primed) { visual.y = player.position.y; visual.primed = true }
        // On big jumps (fall, teleport, cheat warp) snap immediately so the
        // camera doesn't sink through the world chasing a lagged Y.
        if (Math.abs(player.position.y - visual.y) > VISUAL_Y_SNAP) {
          visual.y = player.position.y
        } else {
          const rate = player.position.y > visual.y ? VISUAL_Y_RATE_UP : VISUAL_Y_RATE_DOWN
          visual.y = damp(visual.y, player.position.y, rate, dt)
        }
        ewall.root.position.set(player.position.x, visual.y, player.position.z)
        ewall.chassis.rotation.y = player.yaw
        ewall.headAnchor.rotation.x = player.pitch
      }

      // Flamethrower firing: requires fuel + F key.
      const wantFire = pressed.flamethrower && hasFuel() && !isDialogOpen.value && !isPauseMenuOpen.value
      fire.firing = wantFire
      if (wantFire && fire.flameSystem && fire.muzzle) {
        const muzzleWorld = new THREE.Vector3()
        fire.muzzle.getWorldPosition(muzzleWorld)
        const forwardWorld = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
        fire.flameSystem.spawn(muzzleWorld, forwardWorld)
        drainFuel(dt)
        // Flamethrower audio — alternate 1/2 clips every 0.7s while held so
        // the loop has subtle variation instead of a single stuttering tail.
        sfx.flameNext -= dt
        if (sfx.flameNext <= 0) {
          const clip = (sfx.flameToggle++ % 2) === 0 ? 'flamethrower-1' : 'flamethrower-2'
          playSound(clip, 0.7)
          sfx.flameNext = 0.7
        }
        // Per-stone smelting: find the live stone most aligned with the
        // flame cone from the muzzle and bleed its HP. Only the single
        // best-aligned stone gets damaged per frame so the player can
        // actually aim between blocks instead of the whole pile ticking
        // down at once.
        const fwd = forwardWorld.clone().normalize()
        let bestStone: LiveStone | null = null
        // Score each candidate by "how close is the cone to the stone",
        // not strictly the dot-product of the centre. A stone close to
        // the muzzle can register a hit even if the forward direction
        // grazes its edge rather than its centroid (STONE_HIT_PADDING).
        let bestScore = STONE_CONE_COS
        const delta = new THREE.Vector3()
        for (const stone of stones) {
          if (!stone.alive) continue
          delta.subVectors(stone.worldPos, muzzleWorld)
          const dist = delta.length()
          if (dist > STONE_HIT_RANGE || dist < 0.05) continue
          const dot = delta.multiplyScalar(1 / dist).dot(fwd)
          // Effective cone tolerance grows for closer stones — a half-metre
          // stone 2 m away covers ~14° of sky, while the same stone 8 m
          // away covers ~5°. Aim should bite the near one generously.
          const angularSlack = Math.atan2(STONE_HIT_PADDING, Math.max(0.1, dist))
          const effectiveMin = Math.cos(Math.acos(STONE_CONE_COS) + angularSlack)
          if (dot > Math.max(effectiveMin, bestScore)) {
            bestScore = dot
            bestStone = stone
          }
        }
        if (bestStone) {
          // Kick the phase forward the moment the player actually starts
          // cutting, so the reminder system stops nagging them to walk here.
          if ((phase.value as string) === 'quarry_walk') setPhase('quarry_extract')
          // Random drilling-1..3 clip while actively cutting; cycles faster
          // than the full burn so feedback doesn't drop out mid-stone.
          sfx.drillNext -= dt
          if (sfx.drillNext <= 0) {
            const n = 1 + Math.floor(Math.random() * 3)
            playSound(`drilling-${n}`, 0.6)
            sfx.drillNext = 0.9 + Math.random() * 0.5
          }
          bestStone.hp = Math.max(0, bestStone.hp - dt / STONE_BURN_SECONDS)
          // Colour + emissive tint: cool grey → orange-hot red as HP drops.
          // `1 - hp` is the burn progress, so a fresh stone stays at its
          // base grey and the last bite before destruction glows lava.
          const burn = 1 - bestStone.hp
          const mat = bestStone.mesh.material as THREE.MeshStandardMaterial
          mat.color.copy(stoneBaseColor).lerp(stoneHotColor, burn)
          if (!mat.emissive) mat.emissive = new THREE.Color()
          mat.emissive.setRGB(burn * 0.9, burn * 0.25, 0)
          mat.emissiveIntensity = 1
          if (bestStone.hp <= 0) destroyStone(bestStone)
        }
      } else {
        // Reset flame pacer so next trigger starts immediately.
        sfx.flameNext = 0
        sfx.drillNext = 0
      }
      if (fire.flameSystem) fire.flameSystem.update(dt)

      // Wheel-moving loop — only while the robot is actually translating.
      // Volume scales with `speedMod` (spec: reduce by 70% during dialog)
      // and with `userSoundVolume` so the master mute toggle / FX slider
      // actually silence it. The raw HTMLAudioElement otherwise bypasses
      // the sound pipeline entirely.
      const wantWheel = (pressed.forward || pressed.backward) && !isPauseMenuOpen.value
      const wheelBaseVol = speedMod < 0.95 ? 0.09 : 0.3
      const userVol = Math.max(0, Math.min(1, userSoundVolume.value ?? 0.7))
      sfx.wheelTargetVol = wantWheel ? wheelBaseVol * userVol : 0
      if (wantWheel && userVol > 0 && !sfx.wheelAudio) {
        const audio = new Audio(prependBaseUrl('audio/sfx/wheel-moving.ogg'))
        audio.loop = true
        audio.volume = 0
        audio.play().catch(() => {/* needs user gesture; retried next loop */})
        sfx.wheelAudio = audio
      }
      if (sfx.wheelAudio) {
        sfx.wheelAudio.volume = damp(sfx.wheelAudio.volume, sfx.wheelTargetVol, 6, dt)
        if (sfx.wheelTargetVol === 0 && sfx.wheelAudio.volume < 0.01) {
          sfx.wheelAudio.pause()
          sfx.wheelAudio = null
        }
      }

      // Mission trigger: approach flag.
      if (phase.value === 'flag_walk' && distanceTo('flagpost', player.position) < 6) {
        setFlagSeen(true)
        setPhase('flag_found')
        startDialog('mission_flag_arrive')
      }

      // Mission trigger: approach quarry.
      if (phase.value === 'quarry_walk' && distanceTo('quarry', player.position) < 12) {
        setPhase('quarry_extract')
        startDialog('mission_quarry_arrive')
      }

      // Mission trigger: return-to-base with ore.
      if (phase.value === 'quarry_done' && distanceTo('moonbase', player.position) < 6 && ore.value > 0) {
        setPhase('craft')
        showMissionBanner('Press C to smelt your ore.', 4500)
      }

      // Boot → flag_walk handoff when the intro scripts finish.
      if (phase.value === 'boot' && !isDialogOpen.value) {
        // Only flip once the intro chain has fully drained.
        setPhase('flag_walk')
      }

      // Meteor strike trigger: explorer phase + within 50 m of the target.
      // Fires once — the cinematic flips the phase to `meteor_impact` which
      // no longer matches this guard. `explorerTarget` is cached at world
      // build to avoid the Map lookup on every fixed step.
      if (
        phase.value === 'explorer_walk'
        && explorerTarget
        && player.position.distanceTo(explorerTarget) < METEOR_TRIGGER_RADIUS
      ) {
        triggerMeteorStrike()
      }

      // Cinematic timer + handover: once the flyby duration elapses AND a
      // few impacts have landed (or we time out generously), hand camera
      // control back and transition to post_meteor + break the modules.
      if (cinematic.active) {
        cinematic.elapsed += dt
        const enoughHits = (meteor?.getImpactCount() ?? 0) >= 3
        const past = cinematic.elapsed > CINEMATIC_TRACK_SECONDS
        if ((past && enoughHits) || cinematic.elapsed > CINEMATIC_TRACK_SECONDS + 2.0) {
          endMeteorCinematic()
        }
      }

      // Salvage proximity: during the salvage_walk phase, surface a one-key
      // interact prompt whenever Ewall is within 3 m of a broken chassis he
      // hasn't yet stripped. `nearestSalvage` is consumed by the E handler.
      if (phase.value === 'salvage_walk') {
        nearestSalvage = null
        for (const entry of [
          { kind: 'valley' as const, landmark: 'broken-ewall-valley' as const },
          { kind: 'rift'   as const, landmark: 'broken-ewall-rift' as const   },
          { kind: 'quarry' as const, landmark: 'broken-ewall-quarry' as const }
        ]) {
          if (hasSalvaged(entry.kind)) continue
          const p = L.get(entry.landmark)
          if (p && player.position.distanceTo(p) < 3) { nearestSalvage = entry; break }
        }
      } else {
        nearestSalvage = null
      }

      // Mission reminder tick — Ekon Tusk nags if the player idles too long
      // in any phase that has a reminder list. The loop is already paused by
      // the pause-menu watcher, so this only advances during active play.
      tickReminders(dt)

      // Energy drain is now driven from the movement distance captured just
      // after stepPlayer (see above) so the HUD gauge reflects each metre
      // walked while the solar cell is broken.

      // Arm-tuck: cast a short ray forward from the player's chest along
      // their facing direction. If it finds an obstacle within
      // TUCK_PROBE_DIST, mark tuck=1 so Ewall folds his forearms up; the
      // EwallRobot model damps the actual pose smoothly. Play the
      // robot-arm-move clip once per rising edge so the audio feedback
      // matches the pose change instead of spamming on every frame.
      if (physics && !isDialogOpen.value && !isPauseMenuOpen.value) {
        const fx = -Math.sin(player.yaw)
        const fz = -Math.cos(player.yaw)
        const origin = new THREE.Vector3(
          player.position.x, player.position.y + 1.2, player.position.z
        )
        const dir = new THREE.Vector3(fx, 0, fz)
        const hit = physics.probe(origin, dir, TUCK_PROBE_DIST)
        armTuck.target = hit !== null ? 1 : 0
        if (armTuck.target > 0.5 && armTuck.prevTarget <= 0.5) {
          playSound('robot-arm-move', 0.55)
        }
        armTuck.prevTarget = armTuck.target
      } else {
        armTuck.target = 0
        armTuck.prevTarget = 0
      }

      // Out-of-bounds nag — Tusk complains the moment the player crosses the
      // inner world border into the outer wasteland. One-shot, rearms only
      // once the player has come comfortably back inside (hysteresis band so
      // pacing back and forth at the edge doesn't re-trigger). Skipped during
      // dialog so it doesn't stack on top of a reminder or intro line.
      const absX = Math.abs(player.position.x)
      const absZ = Math.abs(player.position.z)
      const outside = absX > WORLD_BOUNDARY || absZ > WORLD_BOUNDARY
      const wellInside = absX < WORLD_BOUNDARY * 0.85 && absZ < WORLD_BOUNDARY * 0.85
      if (outside && oob.armed && !isDialogOpen.value) {
        oob.armed = false
        startDialog('reminder_out_of_bounds')
      } else if (wellInside) {
        oob.armed = true
      }

      // Can-craft proximity.
      canCraft.value = distanceTo('moonbase', player.position) < 8

      // Airlock pressure-transfer state machine.
      //
      // Outer "space gate" opens only when Ewall is near the outer door
      // AND not past the inner door (otherwise he's inside the dome and
      // the outer should stay sealed). Inner "dome gate" opens only when
      // Ewall is near the inner door AND the outer is mostly closed, so
      // the two are never open simultaneously — matches the one-in,
      // one-out airlock flow the user described.
      if (airlockOuterDoor && airlockInnerDoor && airlockWorldPos) {
        const px = player.position.x
        const pz = player.position.z
        const pastInner = pz < airlock.innerDoorZ - 0.2   // inside dome interior
        const outsideOuter = pz > airlock.outerDoorZ + 0.2 // in front of the airlock
        const insideChamber = !pastInner && !outsideOuter  // in the chamber itself

        // Outer target: open when the player is in range of the outer
        // door from outside OR sitting near the outer door from inside
        // the chamber. Stays closed once they've crossed past the inner
        // door into the dome.
        const dOuter = Math.hypot(
          px - airlockWorldPos.x,
          pz - airlock.outerDoorZ
        )
        const outerWants =
          pastInner ? 0
          : (outsideOuter && dOuter < AIRLOCK_DOOR_RADIUS) ? 1
          : (insideChamber && pz > airlock.innerDoorZ + 2) ? 1
          : 0

        // Inner target: open when the player is at the back half of the
        // chamber AND the outer door has sealed. Once they're inside the
        // dome, keep it open until they walk well past; otherwise close.
        const dInner = Math.hypot(
          px - airlockWorldPos.x,
          pz - airlock.innerDoorZ
        )
        const innerWants =
          (pastInner && dInner < AIRLOCK_DOOR_RADIUS + 2) ? 1
          : (insideChamber && pz < airlock.innerDoorZ + 2 && airlock.outerOpen < 0.2) ? 1
          : 0

        airlock.outerOpen = damp(airlock.outerOpen, outerWants, 5, dt)
        airlock.innerOpen = damp(airlock.innerOpen, innerWants, 5, dt)
        const travel = airlock.openY - airlock.closedY
        airlockOuterDoor.position.y = airlock.closedY + travel * airlock.outerOpen
        airlockInnerDoor.position.y = airlock.closedY + travel * airlock.innerOpen
      }

      // Contextual interact prompt. Multiple sources compose into the same
      // HUD slot — refuel while at the tank, salvage while next to a
      // broken Ewall. Salvage takes precedence because both prompts can
      // theoretically coincide near the quarry chassis.
      const refuelPos = L.get('refuel-tank')
      if (
        nearestSalvage
        && !isDialogOpen.value
        && !isPauseMenuOpen.value
        && !isCraftingOpen.value
      ) {
        interactPrompt.value = '[E] to salvage parts'
      } else if (refuelPos
        && refuelPos.distanceTo(player.position) < 4
        && fuel.value < 0.999
        && !isDialogOpen.value
        && !isPauseMenuOpen.value
        && !isCraftingOpen.value) {
        interactPrompt.value = '[E] to refuel'
      } else {
        interactPrompt.value = null
      }
    },
    onRender: (dt, _alpha) => {
      if (!ewall) return
      camBob.t += dt
      // Only surface mouse-button arm actions while the player is actually in
      // exploration mode; otherwise pass false so the arms rest.
      const interacting = canInteract()
      ewall.update(
        dt,
        !!(pressed.forward || pressed.backward),
        fire.firing,
        interacting && mouse.leftDown,
        interacting && mouse.rightDown,
        armTuck.target
      )

      // Objective marker world→screen.
      const target = targetForPhase(phase.value)
      if (target && canvasRef.value && player) {
        const v = target.clone().project(camera)
        const onScreen = v.z < 1 && v.z > -1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1
        const x = ((v.x + 1) / 2) * canvasRef.value.clientWidth
        const y = ((-v.y + 1) / 2) * canvasRef.value.clientHeight
        markerScreen.value = {
          x, y, visible: onScreen,
          distance: target.distanceTo(player.position)
        }
        // Radar: world-XZ offset from player to target, plus player yaw so
        // the radar rotates with the chassis (up = where you're facing).
        radarState.value = {
          dx: target.x - player.position.x,
          dz: target.z - player.position.z,
          yaw: player.yaw,
          distance: target.distanceTo(player.position)
        }
      } else {
        markerScreen.value = null
        radarState.value = { dx: null, dz: null, yaw: 0, distance: 0 }
      }

      // Meteor shower: integrate active meteors every render frame. The
      // update call returns false once the big one and every small rock
      // have landed — at that point we can dispose the system and free
      // the meshes.
      if (meteor && player) {
        const stillAlive = meteor.update(dt, player.position)
        if (!stillAlive && !cinematic.active) {
          meteor.dispose()
          meteor = null
        }
      }

      // Ewall-9 drive-in: linear interpolate along start→end while he
      // rotates to face the player. Only runs once, then freezes him at
      // the approach endpoint for the rest of the conversation.
      if (ewall9 && ewall9Anim.walkT < 1) {
        ewall9Anim.walkT = Math.min(1, ewall9Anim.walkT + dt / 2.8)
        const t = ewall9Anim.walkT
        ewall9.root.position.lerpVectors(ewall9Anim.startPos, ewall9Anim.endPos, t)
        // Turn toward the player only during the last third of the
        // approach — before that he's still driving forward.
        if (t > 0.6) {
          const blend = (t - 0.6) / 0.4
          const currentYaw = ewall9.chassis.rotation.y
          ewall9.chassis.rotation.y = currentYaw + (ewall9Anim.targetYaw - currentYaw) * blend * 0.2
        }
      }

      // Quarry stone HP bars: project any live stone within STONE_BAR_RANGE
      // (horizontal) of the player to screen-space for the HUD overlay.
      // Uses XZ distance so the bar pops up reliably regardless of the
      // small terrain-Y offset between player feet and stone centre.
      if (canvasRef.value && player && stones.length > 0) {
        const next: { id: string; x: number; y: number; hp: number }[] = []
        const tmp = new THREE.Vector3()
        for (const s of stones) {
          if (!s.alive) continue
          const dx = s.worldPos.x - player.position.x
          const dz = s.worldPos.z - player.position.z
          if (Math.hypot(dx, dz) > STONE_BAR_RANGE) continue
          tmp.set(s.worldPos.x, s.worldPos.y + s.halfH + 0.35, s.worldPos.z)
          tmp.project(camera)
          if (tmp.z < -1 || tmp.z > 1) continue
          const x = ((tmp.x + 1) / 2) * canvasRef.value.clientWidth
          const y = ((-tmp.y + 1) / 2) * canvasRef.value.clientHeight
          next.push({ id: s.key, x, y, hp: s.hp })
        }
        stoneBars.value = next
      } else if (stoneBars.value.length > 0) {
        stoneBars.value = []
      }

      // Collision debug: replace line buffers with Rapier's latest snapshot.
      // `debugRender()` returns `{ vertices, colors }` where each pair of verts
      // is an edge; LineSegments consumes it as-is.
      if (collisionLines && physics) {
        const snap = physics.debugSnapshot()
        const geo = collisionLines.geometry
        geo.setAttribute('position', new THREE.BufferAttribute(snap.vertices, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(snap.colors, 4))
        geo.getAttribute('position').needsUpdate = true
        geo.getAttribute('color').needsUpdate = true
        geo.computeBoundingSphere()
      }

      handle.render()
      tickPerf(dt, handle.renderer)
    }
  })
  loop.start()

  // Kick off the intro dialog after a beat.
  setTimeout(() => { startDialog('intro') }, 1200)

  // Initialize physics asynchronously — the render loop is already running
  // with the pass-through collider, so the world is interactive (minus wall
  // collisions) while Rapier's wasm finishes loading.
  try {
    physics = await createPhysics(world.colliders, start)
  } catch (err) {
    console.error('[MoonScene] Physics init failed:', err)
  }

  // Dev-only handle for Playwright traversal tests — lets the test read
  // player state and teleport the capsule without touching game internals.
  if (isDebug) {
    ;(window as any).__moonbase = {
      get player() { return player },
      get physics() { return physics },
      get isBlocked() { return isAwaitingChoice.value || isMonologue.value || isPauseMenuOpen.value },
      heightAt: (x: number, z: number) => world.heightAt(x, z),
      teleport: (x: number, z: number, yaw?: number) => {
        if (!player) return
        player.position.set(x, world.heightAt(x, z), z)
        if (typeof yaw === 'number') player.yaw = yaw
        player.forwardVel = 0
        player.strafeVel = 0
        player.verticalVel = 0
        player.isGrounded = true
      },
      setPressed: (key: string, down: boolean) => {
        ;(pressed as any)[key] = down
      },
      forceEndDialog: () => {
        try { skipDialog() } catch { /* ignore */ }
      },

      // -- Mission + dialog inspection ------------------------------------
      get phase() {
        return phase.value
      },
      get objective() {
        return MISSION_OBJECTIVES[phase.value]
      },
      get missionBanner() {
        // Snake-cased to match the useMission export; read-only string | null.
        const m = (useMission as any)
        void m
        return (document.querySelector('.mission-hud .banner')?.textContent ?? null) as string | null
      },
      get inventory() {
        return {
          ore: ore.value, metal: metal.value, parts: parts.value,
          fuel: fuel.value, energy: energy.value,
          solarBroken: isSolarCellBroken.value,
          commsBroken: isCommsBroken.value
        }
      },
      get isDialogOpen() {
        return isDialogOpen.value
      },
      get isAwaitingChoice() {
        return isAwaitingChoice.value
      },
      get currentLineId() {
        return currentDialogLine.value?.id ?? null
      },
      get currentLineSpeaker() {
        return currentDialogLine.value?.speaker ?? null
      },
      get currentLineText() {
        return currentDialogLine.value?.text ?? null
      },
      get currentChoices() {
        return currentDialogLine.value?.choices?.map(c => c.id) ?? null
      },
      /** World-space target the yellow objective marker currently points at.
       *  Returns { x, z, hasTarget } — `hasTarget=false` means targetForPhase
       *  returned null (e.g. during mission_complete). */
      get markerTarget() {
        const t = targetForPhase(phase.value)
        return t ? { x: t.x, z: t.z, hasTarget: true } : { x: 0, z: 0, hasTarget: false }
      },
      /** Screen-projected marker payload (same object MissionHUD renders).
       *  Tests check `visible` to assert the yellow circle is on-screen. */
      get markerScreen() {
        const m = markerScreen.value
        return m ? { ...m } : null
      },
      get salvagedCount() {
        return salvagedCount.value
      },
      /** Array snapshot of the salvaged set — diagnostic for tests. */
      get salvaged() {
        return snapshotSalvaged()
      },
      get isCinematic() {
        return cinematic.active
      },
      get isGameOver() {
        return gameOverOpen.value
      },

      // -- Dialog progression --------------------------------------------
      /** Advance the current dialog by one line (what pressing SPACE does).
       *  No-op on a choice prompt — use `pickChoice` instead. */
      advanceDialog: () => {
        try {
          advanceLine()
        } catch { /* ignore */
        }
      },
      /** Pick a choice on the current line by id (e.g. 'silent', 'sass'). */
      pickChoice: (id: string) => {
        try {
          pickDialogChoice(id)
        } catch { /* ignore */
        }
      },
      /** Drain the entire active dialog chain as fast as the engine will
       *  let us. Picks `preferredChoices[lineId]` at choice nodes, or the
       *  first option if the map has no entry. Returns after the chain
       *  fully closes (isDialogOpen goes false) or the safety cap fires.
       *
       *  `pickChoice` is inherently asynchronous (the engine plays an
       *  optional choice-voice clip before advancing), so we only call it
       *  ONCE per choice-line id and then wait for `isAwaitingChoice` to
       *  flip false on its own. Re-invoking would bump the internal runId
       *  and cancel the in-flight advance, stalling the test indefinitely. */
      drainDialog: async (preferredChoices: Record<string, string> = {}, maxIters = 800) => {
        let iters = 0
        let pickedFor: string | null = null
        while (isDialogOpen.value && iters++ < maxIters) {
          if (isAwaitingChoice.value) {
            const line = currentDialogLine.value
            const key = line?.id ?? ''
            if (key !== pickedFor) {
              const choices = line?.choices ?? []
              const picked = preferredChoices[key] ?? choices[0]?.id
              if (picked) {
                pickDialogChoice(picked)
                pickedFor = key
              }
            }
            // else: still on the same choice line — wait for the async
            // choice-voice continuation to fire advanceAfterChoice.
          } else {
            pickedFor = null
            advanceLine()
          }
          await new Promise(r => setTimeout(r, 60))
        }
      },
      /** Skip the 1.5 s post-dialog grace period for the next startDialog.
       *  Not ideal in prod but essential for deterministic tests. */
      startDialogDirect: (id: string) => {
        try {
          startDialogDirect(id, true)
        } catch { /* ignore */
        }
      },

      // -- Mission gameplay shortcuts ------------------------------------
      /** Destroy the live quarry stone closest to the player. Grants 1 ore
       *  and fires the same destruction path the flamethrower would. */
      cutNearestStone: () => {
        if (!player) return false
        let best: typeof stones[number] | null = null
        let bestD = Infinity
        for (const s of stones) {
          if (!s.alive) continue
          const d = player.position.distanceTo(s.worldPos)
          if (d < bestD) {
            bestD = d
            best = s
          }
        }
        if (!best) return false
        destroyStone(best)
        return true
      },
      /** One-shot smelt: consume all remaining ore, add an equal number of
       *  metal ingots, and advance the phase to `complete` so the
       *  mission_complete → explorer_briefing chain can fire. Mirrors the
       *  CraftingMenu loop without the UI. */
      smeltAllOre: () => {
        let smelted = 0
        while (ore.value > 0) {
          consumeOre(1)
          addMetal(1)
          smelted++
        }
        if (phase.value === 'craft' || phase.value === 'quarry_done') {
          setPhase('complete')
          startDialogDirect('mission_complete', true)
        }
        return smelted
      },
      /** Mirror the E-key salvage interaction without requiring a precise
       *  position — mark the chassis salvaged, grant +1 parts, fire the
       *  forensic monologue. `kind` matches the BrokenEwallKind union
       *  ('valley' | 'rift' | 'quarry'). */
      doSalvage: (kind: 'valley' | 'rift' | 'quarry') => {
        markSalvaged(kind)
        addParts(1)
        const script =
          kind === 'valley' ? 'mission_salvage_valley' :
            kind === 'rift' ? 'mission_salvage_rift' :
              'mission_salvage_quarry'
        startDialogDirect(script, true)
      },

      /** Run the same effect the Crafting Menu's "Repair Solar Cell"
       *  button produces: consume 1 metal + 2 salvage if available, flip
       *  the inventory flag, and start the Ewall-9 arc. Used by the test
       *  after the three broken Ewalls have been salvaged. */
      doRepairSolar: () => {
        const inv = useInventory()
        if (metal.value >= 1 && parts.value >= 2) {
          inv.consumeMetal(1)
          inv.consumeParts(2)
        }
        inv.repairSolarCell()
        setPhaseUnsafe('ewall9_meeting')
        startDialogDirect('mission_solar_repaired', true)
      }
    }
  }

  // Collision debug wireframe — line-soup of every Rapier collider, buffers
  // refreshed per render frame. `depthTest: false` so the overlay stays
  // visible through terrain; `renderOrder` pushes it to the end of the queue.
  if (isCollisionDebug && physics) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 4))
    collisionLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })
    )
    collisionLines.renderOrder = 999
    collisionLines.frustumCulled = false
    scene.add(collisionLines)
  }
})

const targetForPhase = (p: typeof phase.value): THREE.Vector3 | null => {
  switch (p) {
    case 'boot': return L.get('moonbase') ?? null
    case 'flag_walk': return L.get('flagpost') ?? null
    case 'flag_found':
    case 'quarry_walk': return L.get('quarry') ?? null
    case 'quarry_extract': return L.get('quarry') ?? null
    // Once three stones have been cut the objective is "carry the ore back
    // to the base" — marker must re-target to the dome, not linger on the
    // quarry the player is leaving.
    case 'quarry_done':
    case 'return_to_base':
    case 'craft': return L.get('moonbase') ?? null
    // New-arc targets: explorer beacon → then the nearest un-salvaged
    // predecessor → then home for repairs.
    case 'explorer_walk': return L.get('explorer-target') ?? null
    case 'salvage_walk': {
      // Point to whichever broken-ewall the player hasn't reached yet, in
      // a stable priority order.
      if (!hasSalvaged('valley')) return L.get('broken-ewall-valley') ?? null
      if (!hasSalvaged('rift'))   return L.get('broken-ewall-rift')   ?? null
      if (!hasSalvaged('quarry')) return L.get('broken-ewall-quarry') ?? null
      return L.get('moonbase') ?? null
    }
    case 'repair_walk': return L.get('moonbase') ?? null
    default: return null
  }
}

// -- Key handling for Esc (pause) + C (craft) + E (interact) ----------------
const onKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Escape') {
    if (isCraftingOpen.value) { isCraftingOpen.value = false; e.preventDefault(); return }
    if (isDialogOpen.value) return // dialog handles ESC internally
    isPauseMenuOpen.value = !isPauseMenuOpen.value
    e.preventDefault()
    return
  }
  if (e.code === 'KeyC' && !isDialogOpen.value && !isPauseMenuOpen.value) {
    // Open the menu anywhere; the Smelt button stays disabled if the bot
    // isn't at the base so the player sees *why* crafting is gated instead
    // of silently dismissing the keypress.
    isCraftingOpen.value = !isCraftingOpen.value
    if (isCraftingOpen.value && document.pointerLockElement) document.exitPointerLock?.()
    e.preventDefault()
  }
  if (e.code === 'KeyE' && !isDialogOpen.value && !isPauseMenuOpen.value && !isCraftingOpen.value) {
    if (!player) return
    // Salvage takes precedence — the broken-ewall near the quarry happens
    // to be within the refuel radius hardly ever, but if it did, we want
    // the player's E press to count toward the salvage objective.
    if (nearestSalvage) {
      const k = nearestSalvage.kind
      markSalvaged(k)
      addParts(1)
      const dialogId =
        k === 'valley' ? 'mission_salvage_valley' :
        k === 'rift'   ? 'mission_salvage_rift'   :
                         'mission_salvage_quarry'
      startDialog(dialogId)
      nearestSalvage = null
      e.preventDefault()
      return
    }
    // Refuel interaction — close to the tank and fuel not already full.
    const refuelPos = L.get('refuel-tank')
    if (refuelPos && refuelPos.distanceTo(player.position) < 4 && fuel.value < 0.999) {
      refillFuel()
      playSound('refuel-water', 0.9)
      showMissionBanner('Hydrazine topped off.', 2200)
      e.preventDefault()
    }
  }
}
window.addEventListener('keydown', onKeyDown)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  loop?.dispose()
  pointerLockCleanup?.()
  fpsResizeCleanup?.()
  stopAmbient()
  if (sfx.wheelAudio) {
    try { sfx.wheelAudio.pause() } catch {}
    sfx.wheelAudio = null
  }
  if (collisionLines) {
    collisionLines.geometry.dispose()
    ;(collisionLines.material as THREE.Material).dispose()
    collisionLines = null
  }
  if (meteor) { meteor.dispose(); meteor = null }
  if (ewall9) {
    ewall9.root.parent?.remove(ewall9.root)
    ewall9 = null
  }
  physics?.dispose()
  sceneHandle?.dispose()
})
</script>

<template lang="pug">
  div.moon-scene(
    class="relative h-screen w-screen overflow-hidden bg-[#05060a]"
    :class="{ 'screenshot-mode': isScreenshotMode }"
  )
    canvas.scene-canvas(
      ref="canvasRef"
      class="absolute inset-0 h-full w-full"
    )

    //- HUD layers. In screenshot mode (G) the `.screenshot-mode` class on
    //- the root hides every non-canvas child so the frame is clean; game
    //- state keeps running underneath so pressing G again restores the UI
    //- in the exact state it was in.
    MissionHUD(
      :fuel="fuel"
      :energy="energy"
      :ore-count="ore"
      :metal-count="metal"
      :parts-count="parts"
      :has-flag-seen="hasFlagSeen"
      :marker-screen="markerScreen"
      :interact-prompt="interactPrompt"
      :stone-bars="stoneBars"
    )

    RetroRadar(
      :dx="radarState.dx"
      :dz="radarState.dz"
      :yaw="radarState.yaw"
      :label="radarLabel"
    )

    TuskPortrait

    DialogBanner

    CraftingMenu(
      v-model="isCraftingOpen"
      :can-craft="canCraft"
    )

    PauseMenu(
      :is-open="isPauseMenuOpen"
      @close="isPauseMenuOpen = false"
      @quit="isPauseMenuOpen = false"
    )

    GameOverScreen(
      :is-open="gameOverOpen"
      :reason="gameOverReason"
      :can-continue="hasCheckpoint"
      @continue="restoreCheckpoint"
      @quit="onQuitToMenu"
    )

    //- Crosshair
    div.crosshair(
      class="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/40"
    )
      svg(width="20" height="20" viewBox="0 0 20 20")
        circle(cx="10" cy="10" r="1.5" fill="currentColor")
        line(x1="10" y1="2" x2="10" y2="6" stroke="currentColor" stroke-width="1.2")
        line(x1="10" y1="14" x2="10" y2="18" stroke="currentColor" stroke-width="1.2")
        line(x1="2" y1="10" x2="6" y2="10" stroke="currentColor" stroke-width="1.2")
        line(x1="14" y1="10" x2="18" y2="10" stroke="currentColor" stroke-width="1.2")
</template>

<style scoped lang="sass">
.scene-canvas
  display: block
  image-rendering: auto

// Screenshot mode: hide every non-canvas child so the frame is clean. Using a
// direct-child selector keeps this safely scoped — nested HUD elements still
// hide because their ancestor HUD root is a direct child of .moon-scene.
.moon-scene.screenshot-mode
  > :not(.scene-canvas)
    display: none !important
</style>
