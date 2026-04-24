// Follow-ending E2E test.
//
// Validates that the Ewall-9 Follow ending is actually completable:
//
//   1. Jumps the game state straight to `ending_followed_ewall9` via the
//      dev handle (skipping the 4+ minutes of mission 1 + post-meteor
//      salvage that the playthrough test already covers).
//   2. Teleports the player to outside the cave entrance. Verifies the
//      HUD objective text + the yellow marker both point at the cave.
//   3. Steps the player forward in small hops so we catch the moment the
//      interact prompt appears (ensuring the door's [E] UI actually
//      surfaces inside the 5 m interact radius).
//   4. Fires the cave entry (triggers the stone door open, the closing
//      dialog, and the arrival banner). Confirms `caveDoorOpen` animates
//      toward 1, the arrival dialog line fires, and the HUD marker
//      drops.
//   5. Walks the player through the arch into the chamber and takes a
//      screenshot of the interior — the three Ewall-mate silhouettes at
//      the back of the cave are the visual pay-off.
//
// Requires `pnpm dev` running on http://localhost:5173. Usage:
//
//   node tests/e2e/follow-ending.mjs
//   HEADED=1 node tests/e2e/follow-ending.mjs
//   STOP_ON_FAIL=1 node tests/e2e/follow-ending.mjs

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out/follow-ending')
const URL = process.env.MOONBASE_URL || 'http://localhost:5173/'
const HEADED = process.env.HEADED === '1'
const STOP_ON_FAIL = process.env.STOP_ON_FAIL === '1'

await mkdir(OUT_DIR, { recursive: true })

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

const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

await page.waitForFunction(() => !!window.__moonbase && !!window.__moonbase.physics, null, { timeout: 30000 })
info('handshake: __moonbase ready')

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
    currentLineId: m.currentLineId,
    markerTarget: m.markerTarget,
    caveEntrancePos: m.caveEntrancePos,
    caveDoorOpen: m.caveDoorOpen,
    caveArrivalReached: m.caveArrivalReached,
    interactPromptText: m.interactPromptText,
    pos
  }
})

const waitFor = async (predicate, timeoutMs = 15000, label = 'condition') => {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    last = await getState()
    if (predicate(last)) return last
    await sleep(120)
  }
  throw Object.assign(new Error(`timeout waiting for ${label}`), { state: last })
}

const screenshot = async (name) => {
  const out = resolve(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: out, fullPage: false })
  info(`screenshot: ${name}.png`)
}

/** Compute the direction from (x, z) toward `target` and face the player
 *  that way before stepping forward. Mirrors the base→cave bearing the
 *  Follow ending expects the player to walk along. */
const teleportFacing = async (x, z, target) => {
  const yaw = Math.atan2(-(target.x - x), -(target.z - z))
  await mbArg(([tx, tz, ty]) => {
    window.__moonbase.teleport(tx, tz, ty)
  }, [x, z, yaw])
}

try {
  // -- Setup: jump straight to the Follow ending ---------------------------
  info('— Setup: skip mission 1 + salvage, land on Follow ending')
  // Close any intro dialog first so jumpToFollowEnding doesn't run under
  // the grace-period interlock.
  await sleep(1500)
  await mb(() => window.__moonbase.forceEndDialog())
  await mb(() => window.__moonbase.jumpToFollowEnding())
  const s0 = await waitFor(s => s.phase === 'ending_followed_ewall9', 8000, 'ending_followed_ewall9 entered')
  pass('phase = ending_followed_ewall9')
  if (s0.caveEntrancePos) {
    pass('cave-entrance landmark exposed', {
      x: s0.caveEntrancePos.x.toFixed(1),
      z: s0.caveEntrancePos.z.toFixed(1)
    })
  } else {
    fail('cave-entrance landmark missing from handle')
  }
  if (s0.markerTarget.hasTarget) {
    const dx = s0.markerTarget.x - (s0.caveEntrancePos?.x ?? 0)
    const dz = s0.markerTarget.z - (s0.caveEntrancePos?.z ?? 0)
    if (Math.hypot(dx, dz) < 1) pass('HUD marker points at cave-entrance')
    else fail('HUD marker drift', {
      expected: s0.caveEntrancePos, actual: s0.markerTarget
    })
  } else {
    fail('HUD marker has no target during Follow ending')
  }

  // -- Approach: teleport to 12 m out, then step inward. ------------------
  info('— Approach the cave')
  const cave = s0.caveEntrancePos
  // Bearing FROM cave TO base (unit vector) — we place the player along
  // this line so the arch is directly in front of them.
  const toBaseX = -cave.x, toBaseZ = -cave.z
  const baseLen = Math.hypot(toBaseX, toBaseZ)
  const ux = toBaseX / baseLen, uz = toBaseZ / baseLen

  const approachPoint = (offset) => ({
    x: cave.x + ux * offset,
    z: cave.z + uz * offset
  })

  const far = approachPoint(14)
  await teleportFacing(far.x, far.z, cave)
  await sleep(200)
  await screenshot('01-approach-14m')

  const mid = approachPoint(8)
  await teleportFacing(mid.x, mid.z, cave)
  await sleep(300)
  const sMid = await getState()
  info('8 m out', {
    prompt: sMid.interactPromptText,
    doorOpen: sMid.caveDoorOpen.toFixed(2)
  })
  await screenshot('02-approach-8m')

  // -- Within interact radius (5 m): prompt should surface. ----------------
  const close = approachPoint(4)
  await teleportFacing(close.x, close.z, cave)
  // Give the fixed-step loop a beat to update interactPrompt.
  const sClose = await waitFor(
    s => s.interactPromptText === '[E] enter the cave',
    3000,
    '[E] enter the cave prompt'
  )
  pass('interact prompt surfaced inside the cave radius', {
    prompt: sClose.interactPromptText,
    distance: Math.hypot(sClose.pos.x - cave.x, sClose.pos.z - cave.z).toFixed(2)
  })
  await screenshot('03-interact-prompt')

  // -- Trigger cave entry via the dev handle. Mirrors what pressing [E] at
  //    this position does — opens the door, fires the closing dialog,
  //    drops the HUD marker. --------------------------------------------
  info('— Open the door')
  const opened = await mb(() => window.__moonbase.triggerCaveEntry())
  if (opened) pass('triggerCaveEntry returned true')
  else fail('triggerCaveEntry refused — phase or latch state wrong', sClose)

  // Door should animate open (damp 0 → 1). Poll for >=0.4 within 3 s.
  const sDoorOpening = await waitFor(
    s => s.caveDoorOpen > 0.4,
    3000,
    'cave door opens past 40%'
  )
  pass('door animated open', { openFrac: sDoorOpening.caveDoorOpen.toFixed(2) })
  // Wait for the slab to finish sliding. Damp rate 4 approaches target
  // asymptotically — give it a generous 3 s and require >= 0.85.
  const sDoorFull = await waitFor(
    s => s.caveDoorOpen > 0.85,
    3000,
    'cave door reaches 85% open'
  )
  pass('door fully open', { openFrac: sDoorFull.caveDoorOpen.toFixed(2) })
  await screenshot('04-door-open')

  // Arrival dialog should be running — cave_arrival_1 (Ewall-9) then
  // cave_arrival_2 (Ewall).
  const sDialog = await waitFor(
    s => s.currentLineId === 'cave_arrival_1',
    4000,
    'cave_arrival_1 dialog line'
  )
  pass('arrival dialog fired', { line: sDialog.currentLineId })

  // Arrival latch should flip; HUD marker drops to null.
  if (sDialog.caveArrivalReached) pass('caveArrivalReached = true')
  else fail('caveArrivalReached did not latch', sDialog)
  if (!sDialog.markerTarget.hasTarget) pass('HUD marker dropped after arrival')
  else fail('HUD marker still points at cave after arrival', sDialog.markerTarget)

  // -- Walk through the arch under real keyboard input. Teleport would
  //    skip collider checks; pressing W verifies the player's capsule can
  //    physically fit through the opening without being wall-blocked.
  //    Drain the arrival dialog first so speedMod is back to 1.0 and the
  //    walk isn't throttled to 40% monologue speed. -------------------
  info('— Walk through the arch under W input')
  await mb(() => window.__moonbase.forceEndDialog())
  await waitFor(s => !s.isDialogOpen, 4000, 'dialog closed before walk test')
  const startWalk = approachPoint(3)  // 3 m outside the arch
  await teleportFacing(startWalk.x, startWalk.z, cave)
  await sleep(200)
  const sBeforeWalk = await getState()
  info('walk start', {
    pos: { x: sBeforeWalk.pos.x.toFixed(1), z: sBeforeWalk.pos.z.toFixed(1) }
  })

  // Signed progress along the approach bearing — positive = deeper into
  // the cave (past the arch). The arch is at cave, so any value > 0
  // means the player is physically inside the chamber.
  const progressAlongBearing = (pos) =>
    -((pos.x - cave.x) * ux + (pos.z - cave.z) * uz)

  const progressStart = progressAlongBearing(sBeforeWalk.pos)
  const heights = await mb(() => window.__moonbase.caveAreaHeights())
  info('terrain heights around arch', heights)

  await page.keyboard.down('w')
  // Walk forward for 3.5 s — chamber is 6 m deep, walking speed is 4.2 m/s,
  // so that covers the 3 m approach + the short plinth step + solid interior
  // travel. Poll motion state every 500 ms so a failure shows WHERE we
  // stalled.
  for (let t = 0; t < 7; t++) {
    await sleep(500)
    const s = await getState()
    const motion = await mb(() => window.__moonbase.motion)
    info(`t=${(t + 1) * 0.5}s`, {
      pos: { x: s.pos.x.toFixed(2), z: s.pos.z.toFixed(2) },
      fwdVel: motion.forwardVel.toFixed(2),
      speedMod: motion.speedMod.toFixed(2),
      pressedFwd: motion.pressedForward,
      yaw: motion.yaw.toFixed(2)
    })
  }
  await page.keyboard.up('w')
  await sleep(200)

  const sAfterWalk = await getState()
  const progressEnd = progressAlongBearing(sAfterWalk.pos)
  const advanced = progressEnd - progressStart
  info('walk end', {
    pos: { x: sAfterWalk.pos.x.toFixed(1), z: sAfterWalk.pos.z.toFixed(1) },
    advancedMetres: advanced.toFixed(2)
  })
  // Test: the player must have crossed the arch (progress >= ~4 m from
  // the 3 m-out starting point means they walked past the threshold and
  // into the chamber). 4 m covers the 3 m approach + 1 m into the cave.
  if (advanced > 4) pass('player walked through the open arch (> 4 m advance)')
  else fail('player blocked by something at the arch', {
    advancedMetres: advanced, finalPos: sAfterWalk.pos
  })
  await screenshot('05-walked-inside')

  // Walk deeper — a second W-burst takes us toward the back wall where
  // the three mates + campfire sit. We want to visibly confirm they're
  // reachable without clipping or hitting hidden geometry.
  await page.keyboard.down('w')
  await sleep(1800)
  await page.keyboard.up('w')
  await sleep(300)
  const sDeep = await getState()
  const deepProgress = progressAlongBearing(sDeep.pos)
  info('deep inside', {
    pos: { x: sDeep.pos.x.toFixed(1), z: sDeep.pos.z.toFixed(1) },
    advanced: deepProgress.toFixed(2)
  })
  // Chamber is 6 m deep; 4 m of progress puts Ewall two-thirds of the way
  // in, near the campfire and the mate silhouettes lined up at the back.
  if (deepProgress > 4) pass('player reached the back of the chamber', {
    advanced: deepProgress.toFixed(2)
  })
  else fail('player stalled before the back', {
    advancedMetres: deepProgress,
    finalPos: sDeep.pos
  })
  await screenshot('06-back-of-chamber')

  // Position the camera just inside the arch, facing the back of the
  // chamber so the mates + campfire are framed head-on. This is the
  // "visual verification that Ewall reached his brothers" the user asked
  // for — everything lines up in a single shot.
  const frontInside = approachPoint(-1)
  await teleportFacing(frontInside.x, frontInside.z, {
    x: cave.x + ux * -6,
    z: cave.z + uz * -6
  })
  await sleep(400)
  await screenshot('07-mates-framed')

  // Drain the arrival dialog so the test ends clean.
  await mb(() => window.__moonbase.drainDialog())
  await waitFor(s => !s.isDialogOpen, 8000, 'arrival dialog drain')
  await screenshot('08-dialog-drained')
  pass('arrival dialog drained — mission ending reached')

  info('— Follow ending complete')
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
