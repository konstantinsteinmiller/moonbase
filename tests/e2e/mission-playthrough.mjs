// End-to-end mission playthrough.
//
// Drives Ewall through every implemented mission phase in order and asserts
// that (a) the mission `phase` transitions correctly, (b) the objective
// banner + persistent objective text match `MISSION_OBJECTIVES[phase]`,
// (c) the yellow HUD marker points at the correct world landmark, and
// (d) each gameplay mechanic required to finish a phase actually works.
//
// Uses the extended `__moonbase` dev handle to read state + drive dialog
// advancement and mission-critical actions. The harness teleports between
// phase triggers rather than walking with real WASD input — the goal is
// to exercise *state machine transitions + gameplay hooks*, not the
// traversal system (which has its own `traversal.mjs` test).
//
// Requires `pnpm dev` running on http://localhost:5173. Usage:
//
//   node tests/e2e/mission-playthrough.mjs
//   HEADED=1 node tests/e2e/mission-playthrough.mjs
//   STOP_ON_FAIL=1 node tests/e2e/mission-playthrough.mjs

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out/playthrough')
const URL = process.env.MOONBASE_URL || 'http://localhost:5173/'
const HEADED = process.env.HEADED === '1'
const STOP_ON_FAIL = process.env.STOP_ON_FAIL === '1'

await mkdir(OUT_DIR, { recursive: true })

/** Expected objective text per phase — mirrors MISSION_OBJECTIVES so a text
 *  drift in either file surfaces as a mismatch here. */
const EXPECTED_OBJECTIVES = {
  boot: 'Step outside.',
  flag_walk: 'Find the 1969 American flag.',
  flag_found: 'Smelt a piece of rock at the quarry.',
  quarry_walk: 'Reach the quarry, west of the base.',
  quarry_extract: 'Cut a stone with the flamethrower (hold F).',
  quarry_done: 'Carry the ore back to the base.',
  return_to_base: 'Return to the dome.',
  craft: 'Smelt ore into metal in the crafting menu.',
  complete: 'Mission complete. Await further orders.',
  explorer_walk: 'Explore the valleys — find a lost predecessor.',
  meteor_impact: 'Brace. Camera locked.',
  post_meteor: 'Communications down. Collect yourself.',
  salvage_walk: 'Salvage electronics from all 3 broken Ewalls.',
  repair_walk: 'Return to base — repair the solar cell.',
  ewall9_meeting: 'Listen to Ewall-9.',
  ending_followed_ewall9: 'Follow Ewall-9 to the caves.',
  ending_comms_repaired: 'Repair the communication module.'
}

const results = []
const log = (tag, msg, extra) => {
  const pad = tag.padEnd(4)
  const line = extra ? `[${pad}] ${msg}  ${JSON.stringify(extra)}` : `[${pad}] ${msg}`
  console.log(line)
  results.push({ tag, msg, extra })
}
const pass = (msg, extra) => log('PASS', msg, extra)
const fail = (msg, extra) => {
  log('FAIL', msg, extra)
  if (STOP_ON_FAIL) throw new Error(`stop-on-fail: ${msg}`)
}
const info = (msg, extra) => log('INFO', msg, extra)

const browser = await chromium.launch({ headless: !HEADED })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()

page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error') console.log(`[console.error] ${msg.text()}`)
})

await page.addInitScript(() => {
  HTMLElement.prototype.requestPointerLock = function() {
  }
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false })
  Object.defineProperty(document, 'hidden', { value: false, writable: false })
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('canvas')

// First click = user gesture for audio autoplay; also opens pointer-lock
// but our init-script stubbed that out.
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

await page.waitForFunction(() => !!window.__moonbase && !!window.__moonbase.physics, null, { timeout: 30000 })
info('handshake: __moonbase ready')

// -- Helpers ---------------------------------------------------------------

const mb = (fn) => page.evaluate(fn)
const mbArg = (fn, arg) => page.evaluate(fn, arg)
const sleep = (ms) => page.waitForTimeout(ms)

const getState = () => mb(() => {
  const m = window.__moonbase
  const pos = m.player ? { x: m.player.position.x, y: m.player.position.y, z: m.player.position.z } : null
  return {
    phase: m.phase,
    objective: m.objective,
    isDialogOpen: m.isDialogOpen,
    isAwaitingChoice: m.isAwaitingChoice,
    isCinematic: m.isCinematic,
    currentLineId: m.currentLineId,
    inventory: m.inventory,
    markerTarget: m.markerTarget,
    markerScreen: m.markerScreen,
    salvagedCount: m.salvagedCount,
    isGameOver: m.isGameOver,
    pos
  }
})

/** Wait until `predicate(state)` returns true. Polls every 120 ms up to
 *  `timeoutMs`. Rejects with the last-observed state so failures have
 *  context. */
const waitFor = async (predicate, timeoutMs = 30000, label = 'condition') => {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    last = await getState()
    if (predicate(last)) return last
    await sleep(120)
  }
  throw Object.assign(new Error(`timeout waiting for ${label}`), { state: last })
}

const assertPhase = (state, expected) => {
  if (state.phase === expected) pass(`phase = ${expected}`)
  else fail(`phase mismatch`, { expected, actual: state.phase })
}

const assertObjective = (state) => {
  const expected = EXPECTED_OBJECTIVES[state.phase]
  if (!expected) {
    fail('no expected objective for phase', { phase: state.phase })
    return
  }
  if (state.objective === expected) pass(`objective OK for ${state.phase}`)
  else fail(`objective mismatch`, { phase: state.phase, expected, actual: state.objective })
}

const assertMarkerTarget = (state, expectedLandmarkPos) => {
  if (!state.markerTarget.hasTarget) {
    fail('marker has no target', { phase: state.phase })
    return
  }
  const dx = state.markerTarget.x - expectedLandmarkPos.x
  const dz = state.markerTarget.z - expectedLandmarkPos.z
  const dist = Math.hypot(dx, dz)
  if (dist < 1) pass(`marker target = ${expectedLandmarkPos.name}`, {
    x: state.markerTarget.x.toFixed(1),
    z: state.markerTarget.z.toFixed(1)
  })
  else fail(`marker target drift`, {
    phase: state.phase,
    expected: expectedLandmarkPos,
    actual: { x: state.markerTarget.x, z: state.markerTarget.z }
  })
}

const screenshot = async (name) => {
  const out = resolve(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: out, fullPage: false })
  info(`screenshot: ${name}.png`)
}

// Landmarks — mirror of MoonWorld positions (these are the post-scale-up
// coordinates so the test stays aligned with the current level layout).
const LM = {
  moonbase: { name: 'moonbase', x: 0, z: 0 },
  flagpost: { name: 'flagpost', x: 45, z: -35 },
  quarry: { name: 'quarry', x: -20, z: 60 },
  explorerTarget: { name: 'explorer-target', x: -70, z: -45 },
  brokenValley: { name: 'broken-ewall-valley', x: -42, z: -70 },
  brokenRift: { name: 'broken-ewall-rift', x: 62, z: -50 },
  brokenQuarry: { name: 'broken-ewall-quarry', x: -24, z: 48 }
}

const teleport = (x, z, yaw = 0) => mbArg(([tx, tz, ty]) => window.__moonbase.teleport(tx, tz, ty), [x, z, yaw])

// -- Playthrough -----------------------------------------------------------

try {
  // Act I: Intro → flag_walk.
  info('— Act I: intro → flag_walk')
  // Intro starts ~1.2 s after mount. Drain the whole chain (intro →
  // flag_briefing). The briefing ends on a choice — pick 'silent' to test
  // the choice-reaction path.
  await sleep(1500)
  await mb(() => window.__moonbase.drainDialog({ flag_brief_choice: 'silent' }))
  const s1 = await waitFor(s => s.phase === 'flag_walk' && !s.isDialogOpen, 15000, 'flag_walk phase')
  assertPhase(s1, 'flag_walk')
  assertObjective(s1)
  assertMarkerTarget(s1, LM.flagpost)
  await screenshot('01-flag_walk')

  // Act II: approach flag → flag_found → quarry_walk.
  info('— Act II: approach flag')
  teleport(LM.flagpost.x, LM.flagpost.z - 2, 0)
  await waitFor(s => s.phase === 'flag_found', 10000, 'flag_found trigger')
  pass('proximity trigger fired at flagpost (<6m)')
  // flag_arrive chains to quarry_briefing. Pick 'sass' (reaction whistle).
  await mb(() => window.__moonbase.drainDialog({ flag_arrive_choice: 'sass' }))
  const s2 = await waitFor(s => s.phase === 'quarry_walk' && !s.isDialogOpen, 15000, 'quarry_walk')
  assertPhase(s2, 'quarry_walk')
  assertObjective(s2)
  assertMarkerTarget(s2, LM.quarry)
  await screenshot('02-quarry_walk')

  // Act III: approach quarry → quarry_extract.
  info('— Act III: approach quarry')
  teleport(LM.quarry.x, LM.quarry.z - 5, 0)
  await waitFor(s => s.phase === 'quarry_extract', 10000, 'quarry_extract trigger')
  pass('quarry proximity trigger fired (<12m)')
  await mb(() => window.__moonbase.drainDialog())
  await waitFor(s => !s.isDialogOpen, 15000, 'quarry dialog drain')
  const s3 = await getState()
  assertObjective(s3)
  assertMarkerTarget(s3, LM.quarry)

  // Act IV: cut 3 stones → quarry_done.
  info('— Act IV: cut 3 stones')
  teleport(LM.quarry.x, LM.quarry.z, 0)
  for (let i = 0; i < 3; i++) {
    const ok = await mb(() => window.__moonbase.cutNearestStone())
    if (!ok) fail(`cutNearestStone() returned false on stone ${i + 1}`)
    else pass(`cut stone ${i + 1}`)
    await sleep(120)
  }
  const s4 = await waitFor(s => s.phase === 'quarry_done', 8000, 'quarry_done')
  assertPhase(s4, 'quarry_done')
  assertObjective(s4)
  assertMarkerTarget(s4, LM.moonbase)
  if (s4.inventory.ore === 3) pass('ore = 3 after cuts')
  else fail('unexpected ore count', { ore: s4.inventory.ore })
  await mb(() => window.__moonbase.drainDialog())
  await screenshot('04-quarry_done')

  // Act V: return to base → craft.
  info('— Act V: haul ore → craft')
  teleport(LM.moonbase.x, LM.moonbase.z + 3, 0)
  const s5 = await waitFor(s => s.phase === 'craft', 8000, 'craft phase')
  assertPhase(s5, 'craft')
  assertObjective(s5)
  assertMarkerTarget(s5, LM.moonbase)

  // Act VI: smelt → complete → explorer_walk.
  info('— Act VI: smelt → complete')
  const smelted = await mb(() => window.__moonbase.smeltAllOre())
  if (smelted === 3) pass(`smelted ${smelted} ore`)
  else fail('smelt count mismatch', { smelted })
  await sleep(300)
  await mb(() => window.__moonbase.drainDialog())
  const s6 = await waitFor(s => s.phase === 'explorer_walk' && !s.isDialogOpen, 20000, 'explorer_walk')
  assertPhase(s6, 'explorer_walk')
  assertObjective(s6)
  assertMarkerTarget(s6, LM.explorerTarget)
  if (s6.inventory.metal === 3) pass('metal = 3 after smelt')
  else fail('metal count mismatch', { metal: s6.inventory.metal })
  await screenshot('06-explorer_walk')

  // Act VII: meteor strike cinematic.
  info('— Act VII: reach explorer target → meteor strike')
  teleport(LM.explorerTarget.x, LM.explorerTarget.z + 10, 0)
  // Proximity trigger needs the fixed-step loop to run — give it a beat.
  await waitFor(s => s.phase === 'meteor_impact' || s.phase === 'post_meteor' || s.phase === 'salvage_walk', 10000, 'meteor trigger')
  pass('meteor strike triggered')
  // Let the cinematic timer expire + dialogs play out. drainDialog spins
  // through the chain (meteor_impact → post_meteor → salvage_intro).
  await sleep(500)
  await mb(() => window.__moonbase.drainDialog())
  const s7 = await waitFor(s => s.phase === 'salvage_walk' && !s.isDialogOpen, 20000, 'salvage_walk')
  assertPhase(s7, 'salvage_walk')
  assertObjective(s7)
  assertMarkerTarget(s7, LM.brokenValley)
  if (s7.inventory.solarBroken && s7.inventory.commsBroken) pass('solar + comms both broken after meteor')
  else fail('modules not broken after meteor', s7.inventory)
  await screenshot('07-salvage_walk')

  // Act VIII: salvage three broken Ewalls.
  info('— Act VIII: salvage 3 broken Ewalls')
  for (const { kind, landmark } of [
    { kind: 'valley', landmark: LM.brokenValley },
    { kind: 'rift', landmark: LM.brokenRift },
    { kind: 'quarry', landmark: LM.brokenQuarry }
  ]) {
    teleport(landmark.x, landmark.z, 0)
    await sleep(200)
    await mbArg((k) => window.__moonbase.doSalvage(k), kind)
    await sleep(300)
    await mb(() => window.__moonbase.drainDialog())
    const s = await getState()
    const salvaged = await mb(() => window.__moonbase.salvaged)
    info(`after salvage ${kind}: count=${s.salvagedCount} set=${JSON.stringify(salvaged)}`)
    if (salvaged.includes(kind)) pass(`salvaged ${kind} registered in set`)
    else fail(`salvage ${kind} did not register`, { set: salvaged })
  }
  const s8 = await waitFor(s => s.phase === 'repair_walk', 8000, 'repair_walk')
  assertPhase(s8, 'repair_walk')
  assertObjective(s8)
  assertMarkerTarget(s8, LM.moonbase)
  if (s8.inventory.parts >= 3) pass(`parts = ${s8.inventory.parts} after salvage`)
  else fail('parts count too low', { parts: s8.inventory.parts })
  await screenshot('08-repair_walk')

  // Act IX: repair solar → Ewall-9 meeting.
  info('— Act IX: repair solar → Ewall-9')
  teleport(LM.moonbase.x, LM.moonbase.z + 3, 0)
  await mb(() => window.__moonbase.doRepairSolar())
  await sleep(200)
  const s9preDrain = await getState()
  assertPhase(s9preDrain, 'ewall9_meeting')
  assertObjective(s9preDrain)
  // Drain Ewall-9's speech and pick the "repair comms" ending.
  await mb(() => window.__moonbase.drainDialog({ ewall9_approach_choice: 'repair' }))
  const s9 = await waitFor(s => s.phase === 'ending_comms_repaired' && !s.isDialogOpen, 20000, 'ending_comms_repaired')
  assertPhase(s9, 'ending_comms_repaired')
  assertObjective(s9)
  if (!s9.inventory.commsBroken) pass('comms flag cleared on repair ending')
  else fail('comms still broken at repair ending')
  if (!s9.inventory.solarBroken) pass('solar flag cleared after repair')
  else fail('solar still broken at repair ending')
  await screenshot('09-ending_comms_repaired')

  info('— Playthrough complete')
} catch (err) {
  fail(`fatal: ${err.message}`, err.state)
  console.error(err)
}

const failures = results.filter(r => r.tag === 'FAIL')
console.log('')
console.log(`--- Summary: ${results.length - failures.length - results.filter(r => r.tag === 'INFO').length} asserted, ${failures.length} failed ---`)
for (const f of failures) console.log(`  FAIL: ${f.msg}  ${f.extra ? JSON.stringify(f.extra) : ''}`)

await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
