// Perf harness. Boots a dev server against whatever source tree is on disk,
// launches one browser (Brave or Playwright Firefox), drives the arena UI,
// and prints frame-time stats. Called with: node perf/run.mjs <label> <brave|firefox>
//
// Expects pnpm dev to be already running on http://localhost:5173 — this
// script does NOT boot vite itself so we don't re-bundle between runs.

import { chromium, firefox } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const probe = readFileSync(join(__dirname, 'probe.js'), 'utf8')

const [label, browserArg] = process.argv.slice(2)
if (!label || !browserArg) {
  console.error('usage: node perf/run.mjs <label> <brave|firefox>')
  process.exit(1)
}

const BRAVE_PATH = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
const URL = process.env.PERF_URL || 'http://localhost:5173/'
const WARMUP_MS = 6000      // page load + meteor intro + first turn decision
const SAMPLE_MS = 20000     // measurement window
const LAUNCH_EVERY_MS = 2500 // how often we kick a blade

// Summary stats. Expose p50, p95, p99 frame-time, FPS, and the long-frame
// tail — jank events matter more than averages for "feel".
const stats = (samples) => {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const longFrames = samples.filter(s => s > 33.4).length // missed a 30fps budget
  return {
    count: samples.length,
    meanMs: +mean.toFixed(2),
    p50Ms: +pct(0.5).toFixed(2),
    p95Ms: +pct(0.95).toFixed(2),
    p99Ms: +pct(0.99).toFixed(2),
    maxMs: +sorted[sorted.length - 1].toFixed(2),
    fpsFromMean: +(1000 / mean).toFixed(1),
    longFramePct: +((longFrames / samples.length) * 100).toFixed(2)
  }
}

async function run() {
  const browser = browserArg === 'brave'
    ? await chromium.launch({ executablePath: BRAVE_PATH, headless: false })
    : await firefox.launch({ headless: false })

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.addInitScript(probe)
  const page = await context.newPage()

  page.on('pageerror', (e) => console.error('[pageerror]', e.message))

  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  const pageUrl = page.url()
  const pageTitle = await page.title()
  console.error(`[target] url=${pageUrl} title=${pageTitle}`)
  await page.waitForSelector('canvas')

  // Generous warm-up: asset preload, FLogoProgress boot screen, initial
  // SpinnerArena mount, first meteor-intro sequence.
  await page.waitForTimeout(WARMUP_MS)

  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // First click: exits tap_to_start or kicks off any gated intro state.
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(1500)

  // Kick off the first launch via drag-from-blade. Player blades sit at
  // game y ≈ +80 which is ~20% of half-canvas height below centre.
  async function launchBlade() {
    const offset = box.height * 0.2
    const startX = cx + (Math.random() - 0.5) * 40
    const startY = cy + offset + (Math.random() - 0.5) * 20
    const dx = (Math.random() - 0.5) * 200
    const dy = -100 - Math.random() * 80
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dx, startY + dy, { steps: 8 })
    await page.mouse.up()
  }

  await launchBlade()
  await page.waitForTimeout(1200)

  // Open the measurement window. Reset samples so warm-up is excluded.
  await page.evaluate(() => window.__perfReset && window.__perfReset())

  const deadline = Date.now() + SAMPLE_MS
  while (Date.now() < deadline) {
    await page.waitForTimeout(LAUNCH_EVERY_MS)
    if (Date.now() >= deadline) break
    await launchBlade().catch(() => {
    }) // launches may silently fail between turns
  }

  const samples = await page.evaluate(() => window.__perfSamples)
  const s = stats(samples)

  // Snapshot the final visible state so we can verify the arena was
  // actually in a running match (not stuck on menu / loading).
  const shotPath = join(__dirname, `shot-${label}-${browserArg}.png`)
  await page.screenshot({ path: shotPath })

  console.log(JSON.stringify({ label, browser: browserArg, shot: shotPath, ...s }, null, 2))

  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
