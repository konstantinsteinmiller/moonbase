// Traversal regression test — drives the bot through a crater and a rift,
// asserts it makes it out the other side within a time budget.
//
// Guards against the "sliding along triangles" bug: the old PlayerController
// damped the capsule's Y below the solver-resolved ground, leaving it
// embedded in terrain. Forward motion then projected onto the triangle above
// the capsule (near-vertical face) and the player drifted sideways instead
// of climbing. Any regression of that bug shows up here as a stall or a
// sideways-drift failure.
//
// Requires `pnpm dev` running on http://localhost:5173 (mirrors the perf
// harness convention — no re-bundle between runs).
//
// Scenarios:
//   crater-escape   drop at crater bottom, drive outward, must clear the rim
//   rift-cross      start 10m before a rift, drive across it
//   crater-cross    drop on +X rim of a big crater, drive through to -X rim
//
// Usage:
//   node tests/e2e/traversal.mjs               — all scenarios, headed
//   node tests/e2e/traversal.mjs crater-escape — single scenario
//   HEADLESS=1 node tests/e2e/traversal.mjs    — headless (slow; see comment)

import { chromium } from 'playwright'

const URL = process.env.MOONBASE_URL || 'http://localhost:5173/'
const SCENARIO = process.argv[2] || 'all'
// Default to headed — Chrome headless aggressively throttles rAF on pages
// without real window surface area, which drops the fixed-step physics to
// ~17% speed and makes every scenario time out. Set HEADLESS=1 only if you've
// budgeted generous timeouts for that slowdown.
const HEADED = process.env.HEADLESS !== '1'

const scenarios = {
  'crater-escape': {
    desc: 'escape crater at (60, -40) r=22 depth=3.5 — drop at bottom, walk out +Z',
    // Start at bottom, face +Z (yaw = 0 → forward = -sin(0), -cos(0) = (0, 0, -1) = -Z).
    // We want to walk +Z, so yaw = Math.PI.
    start: { x: 60, z: -40, yaw: Math.PI },
    pass: (p) => p.z > -18 && Math.abs(p.x - 60) < 8,
    timeBudgetMs: 12000
  },
  'rift-cross': {
    desc: 'cross rift from (40, -75) to (85, -25) — start 10m before a, drive toward b',
    // Rift runs from (40, -75) to (85, -25). Direction ≈ (45, 50) normalized.
    // Start at a minus direction*15 ≈ (30, -86), head toward b.
    // yaw where forward = (dir.x, dir.z) where dir = (0.67, 0.74).
    // forward = (-sin(yaw), -cos(yaw)) = (0.67, 0.74)
    // → sin(yaw) = -0.67, cos(yaw) = -0.74 → yaw ≈ π + atan2(0.67, 0.74) ≈ π + 0.735 ≈ 3.876
    start: { x: 30, z: -86, yaw: Math.atan2(-0.67, -0.74) + Math.PI * 2 },
    pass: (p) => {
      // Pass when past the rift far end — project onto (a → b) direction, require t > 0.6.
      const ax = 40, az = -75, bx = 85, bz = -25
      const dx = bx - ax, dz = bz - az
      const lenSq = dx * dx + dz * dz
      const t = ((p.x - ax) * dx + (p.z - az) * dz) / lenSq
      return t > 0.6
    },
    timeBudgetMs: 15000
  },
  'crater-cross': {
    desc: 'traverse big crater at (-80, 40) r=30 depth=4.5 — drop on +X rim, walk to -X rim',
    // Start at +X rim (-50, 40), walk in -X direction (yaw = Math.PI/2 for forward=-X).
    // forward = (-sin(yaw), -cos(yaw)) — want (-1, 0) → sin=1, cos=0 → yaw = π/2.
    start: { x: -52, z: 40, yaw: Math.PI / 2 },
    pass: (p) => p.x < -100 && Math.abs(p.z - 40) < 10,
    timeBudgetMs: 18000
  }
}

const runScenario = async (page, name, sc) => {
  console.log(`\n--- ${name}: ${sc.desc}`)

  // Reset to a known state before each scenario — release any held keys and
  // close the intro dialog so input isn't gated to zero.
  await page.keyboard.up('w').catch(() => {
  })
  await page.keyboard.up('Shift').catch(() => {
  })
  await page.evaluate(() => {
    const mb = window.__moonbase
    if (!mb) throw new Error('__moonbase handle not ready')
    mb.forceEndDialog()
  })

  await page.evaluate(({ x, z, yaw }) => {
    window.__moonbase.teleport(x, z, yaw)
  }, sc.start)

  // Let physics settle the capsule onto ground, then drive via real key events
  // (exercises the full input path: window keyboard listener → pressed → stepPlayer).
  await page.waitForTimeout(400)
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')

  const startT = Date.now()
  let last = { x: sc.start.x, z: sc.start.z, y: 0 }
  let stallTicks = 0
  let minYSeen = Infinity, maxYSeen = -Infinity
  let passed = false
  let lastLog = 0

  while (Date.now() - startT < sc.timeBudgetMs) {
    await page.waitForTimeout(250)
    const p = await page.evaluate(() => {
      const s = window.__moonbase.player
      return s ? {
        x: s.position.x, y: s.position.y, z: s.position.z,
        grounded: s.isGrounded,
        forwardVel: s.forwardVel,
        yaw: s.yaw,
        yawRate: s.yawRate,
        blocked: window.__moonbase.isBlocked,
        vis: document.visibilityState
      } : null
    })
    if (!p) continue
    minYSeen = Math.min(minYSeen, p.y)
    maxYSeen = Math.max(maxYSeen, p.y)

    if (Date.now() - lastLog > 1000) {
      console.log(`  t=${((Date.now() - startT) / 1000).toFixed(1)}s  pos=(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})  yaw=${p.yaw.toFixed(2)} yawRate=${p.yawRate.toFixed(2)}  fwdVel=${p.forwardVel.toFixed(2)}  blocked=${p.blocked}`)
      lastLog = Date.now()
    }
    // Kill any reminder/mission voice that fire mid-run — test drives a
    // teleport-warped bot so mission-progress triggers make no sense.
    if (p.blocked) await page.evaluate(() => window.__moonbase.forceEndDialog())

    if (sc.pass(p)) {
      passed = true
      break
    }

    // Stall detection — if the horizontal position barely changes for 2.5s,
    // the bot is stuck on a triangle edge.
    const horiz = Math.hypot(p.x - last.x, p.z - last.z)
    if (horiz < 0.05) stallTicks++
    else stallTicks = 0
    last = p
    if (stallTicks > 10) {
      console.log(`  STALL at pos=(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`)
      break
    }
  }

  await page.keyboard.up('w').catch(() => {
  })
  await page.keyboard.up('Shift').catch(() => {
  })

  const final = await page.evaluate(() => {
    const s = window.__moonbase.player
    return s ? { x: s.position.x, y: s.position.y, z: s.position.z } : null
  })
  const elapsed = ((Date.now() - startT) / 1000).toFixed(1)
  const result = {
    scenario: name, passed,
    elapsedSec: +elapsed,
    final, minYSeen: +minYSeen.toFixed(2), maxYSeen: +maxYSeen.toFixed(2)
  }
  console.log(`  RESULT: ${passed ? 'PASS' : 'FAIL'} in ${elapsed}s  final=(${final?.x.toFixed(1)}, ${final?.y.toFixed(2)}, ${final?.z.toFixed(1)})`)
  return result
}

const run = async () => {
  // Headless Chrome throttles rAF on unfocused windows, which drags the
  // in-game physics step to ~10–20% realtime. Disable the backgrounding
  // heuristics so the scene runs at full rate even without a visible window.
  const browser = await chromium.launch({ headless: !HEADED })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') console.log(`[console.${type}]`, msg.text())
  })

  // Disable pointer-lock acquisition BEFORE navigation so the scene's onClick
  // can't capture the mouse — Playwright's own scroll/hover events would
  // otherwise accumulate as movementX deltas and rotate the bot mid-test.
  // Also force document.visibilityState='visible' so createGameLoop doesn't
  // pause itself in headless (where windows default to hidden).
  await page.addInitScript(() => {
    HTMLElement.prototype.requestPointerLock = function() {
    }
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false })
    Object.defineProperty(document, 'hidden', { value: false, writable: false })
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas')

  // Gesture so audio-init / visibility code paths unlock.
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  // Wait for __moonbase handle (physics async init completes first).
  await page.waitForFunction(() => !!window.__moonbase && !!window.__moonbase.physics, null, { timeout: 20000 })
  console.log('[handshake] __moonbase ready')

  // Initial intro dialog on mount — cancel so movement isn't zeroed.
  await page.evaluate(() => window.__moonbase.forceEndDialog())

  const toRun = SCENARIO === 'all' ? Object.keys(scenarios) : [SCENARIO]
  const results = []
  for (const name of toRun) {
    if (!scenarios[name]) {
      console.error(`unknown scenario: ${name}`)
      continue
    }
    results.push(await runScenario(page, name, scenarios[name]))
  }

  console.log('\n=== SUMMARY ===')
  let anyFail = false
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.scenario.padEnd(16)} ${r.elapsedSec}s`)
    if (!r.passed) anyFail = true
  }

  await browser.close()
  process.exit(anyFail ? 1 : 0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
