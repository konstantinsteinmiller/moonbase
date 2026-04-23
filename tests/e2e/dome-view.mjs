// Dome + airlock visualisation test.
//
// Drives the bot to a handful of camera angles around and inside the
// moonbase dome, takes a screenshot of each, and writes them to
// `tests/e2e/out/dome-view/`. This is a diagnostic tool — it doesn't
// assert, it just produces evidence for geometry bugs (dome mesh
// clipping into the airlock, pressure chamber too short for Ewall to
// fit, missing inner door, etc.).
//
// Requires `pnpm dev` running on http://localhost:5173 (mirrors the
// traversal harness convention — no re-bundle between runs).
//
// Usage:
//   node tests/e2e/dome-view.mjs        — all shots, headless by default
//   HEADED=1 node tests/e2e/dome-view.mjs  — watch the bot move live
//
// The `__moonbase` dev handle is exposed in dev builds only.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, 'out/dome-view')
const URL = process.env.MOONBASE_URL || 'http://localhost:5173/'
const HEADED = process.env.HEADED === '1'

// Each shot teleports the capsule to `pos` with the given yaw and pitch.
// Pitch is applied directly to `player.pitch` (radians — positive looks
// up). Camera follows the chassis so yaw/pitch are what the player sees.
// Geometry after the 3× dome scale-up:
//   dome centre (0, 0, 0), radius 24
//   airlock centre (0, _, 28.5), depth 9  → outer at z=33, inner at z=24
//   landing pad (40, _, 30)
//   refuel tank (14, _, -30)
// Yaw convention from PlayerController: forward = (-sin(yaw), 0, -cos(yaw)).
//   yaw = 0    → forward = (0, 0, -1)   (facing -Z, i.e. toward origin from +Z)
//   yaw = π    → forward = (0, 0, +1)   (facing +Z)
//   yaw = π/2  → forward = (-1, 0, 0)   (facing -X)
//   yaw = -π/2 → forward = (+1, 0, 0)   (facing +X)
//
// Geometry after the 3× dome scale-up:
//   dome centre (0, 0, 0), radius 24
//   airlock centre (0, _, 28.5), depth 9  → outer at z=33, inner at z=24
//   landing pad (40, _, 30)
//   refuel tank (14, _, -30)
const shots = [
  {
    name: '01-front-approach',
    desc: 'Outside the airlock at z=42, looking -Z at the dome through the outer door',
    pos: { x: 0, z: 42, yaw: 0 },
    pitch: 0.12
  },
  {
    name: '02-airlock-interior',
    desc: 'Inside the pressure chamber — looking toward the inner door / dome',
    pos: { x: 0, z: 28, yaw: 0 },
    pitch: 0.0
  },
  {
    name: '03-side-profile',
    desc: 'Side view from +X looking -X across the dome + airlock silhouette',
    pos: { x: 55, z: 20, yaw: Math.PI / 2 },
    pitch: 0.08
  },
  {
    name: '04-inner-door-view',
    desc: 'Inside the chamber facing outward — should show the outer door framed ahead',
    pos: { x: 0, z: 26, yaw: Math.PI },
    pitch: 0.05
  },
  {
    name: '05-dome-outside',
    desc: 'Standing well in front of the whole base to see the dome + airlock relationship',
    pos: { x: 0, z: 60, yaw: 0 },
    pitch: 0.05
  },
  {
    name: '06-quarry-neighbour',
    desc: 'From the base area toward the quarry (NW) — check clearance with the bigger dome',
    pos: { x: 0, z: 42, yaw: Math.PI * 0.75 },
    pitch: 0.02
  }
]

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch({ headless: !HEADED })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()

page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error' || t === 'warning') console.log(`[console.${t}]`, msg.text())
})

// Same init-script guard as the traversal harness: suppress pointer lock
// (prevents the capsule from spinning under Playwright mouse deltas) and
// pin visibilityState so the fixed-step loop doesn't self-pause.
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

await page.waitForFunction(() => !!window.__moonbase && !!window.__moonbase.physics, null, { timeout: 20000 })
await page.evaluate(() => window.__moonbase.forceEndDialog())

// Hide HUD so screenshots show the world cleanly.
await page.evaluate(() => {
  for (const sel of ['.mission-hud', '.dialog-banner', '.tusk-portrait', '.retro-radar', '.crosshair', '.f-perf-meter']) {
    for (const el of document.querySelectorAll(sel)) el.style.display = 'none'
  }
})

console.log(`[out] ${OUT_DIR}`)
for (const s of shots) {
  await page.evaluate(({ pos, pitch, extraY }) => {
    const mb = window.__moonbase
    mb.teleport(pos.x, pos.z, pos.yaw)
    if (mb.player) {
      mb.player.pitch = pitch
      if (typeof extraY === 'number') mb.player.position.y += extraY
    }
    mb.forceEndDialog()
  }, s)
  // Let the render loop catch up (physics may settle Y after teleport).
  await page.waitForTimeout(450)
  const out = resolve(OUT_DIR, `${s.name}.png`)
  await page.screenshot({ path: out, fullPage: false })
  console.log(`  shot: ${s.name}  ${s.desc}`)
}

await browser.close()
console.log(`done — ${shots.length} shots written`)
