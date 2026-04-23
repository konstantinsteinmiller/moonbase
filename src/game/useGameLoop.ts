/**
 * Fixed-step simulation + capped-rate render loop.
 *
 * Design goals:
 *   • Deterministic physics/AI — `onFixedStep(dt)` runs on a precise 1/60 s
 *     accumulator regardless of how fast rAF fires.
 *   • Smooth rendering — `onRender(dt, alpha)` receives an interpolation
 *     factor in [0, 1] representing the fractional progress through the
 *     next fixed step, so visual state can lerp between the last two sim
 *     states and avoid juddering at non-multiple framerates.
 *   • Frame pacing — on a 120/144 Hz display we still only render at the
 *     target `renderHz` (default 60) to keep GPU/CPU strain low and motion
 *     consistent across machines. High-refresh users can raise it.
 *   • Spiral-of-death guard — if the tab was backgrounded, we clamp the
 *     incoming dt and cap substeps per rAF tick.
 *   • Auto-pause on tab hidden — browsers throttle rAF to 1 Hz in hidden
 *     tabs, which pools large dt into the accumulator; we pause outright so
 *     nothing fires until the user returns.
 */

export interface GameLoopOptions {
  onFixedStep: (dt: number) => void
  onRender: (dt: number, alpha: number) => void
  fixedStep?: number          // seconds per sim step; default 1/60
  renderHz?: number           // cap render rate; 0 = uncapped (every rAF)
  maxSubsteps?: number        // max sim steps per rAF tick
}

export const createGameLoop = ({
                                 onFixedStep,
                                 onRender,
                                 fixedStep = 1 / 60,
                                 renderHz = 60,
                                 maxSubsteps = 5
                               }: GameLoopOptions) => {
  let raf = 0
  let running = false
  let paused = false
  let lastRafMs = 0
  let simAccumulator = 0
  let renderAccumulator = 0
  const renderInterval = renderHz > 0 ? 1 / renderHz : 0
  // Guard against long dt after long pauses/tab-switches.
  const MAX_DT = 0.25

  const tick = (nowMs: number) => {
    raf = requestAnimationFrame(tick)
    if (!running) return
    // First tick after start/resume seeds the timestamp so we don't replay
    // a huge dt accumulated during setup.
    if (lastRafMs === 0) {
      lastRafMs = nowMs
      return
    }

    let dt = (nowMs - lastRafMs) / 1000
    lastRafMs = nowMs
    if (paused) return

    if (dt > MAX_DT) dt = MAX_DT

    // ── Fixed-step simulation ─────────────────────────────────────────────
    simAccumulator += dt
    let steps = 0
    while (simAccumulator >= fixedStep && steps < maxSubsteps) {
      onFixedStep(fixedStep)
      simAccumulator -= fixedStep
      steps++
    }
    if (steps >= maxSubsteps) {
      // Drop leftover time if we saturated — prevents compounding lag.
      simAccumulator = 0
    }

    // ── Capped-rate render ────────────────────────────────────────────────
    // alpha = fraction through the next pending sim step, for visual lerp.
    const alpha = fixedStep > 0 ? Math.min(1, simAccumulator / fixedStep) : 0
    if (renderInterval === 0) {
      onRender(dt, alpha)
    } else {
      renderAccumulator += dt
      if (renderAccumulator >= renderInterval) {
        // Single render per tick — even if we fell behind, skip the extras.
        // A backlog of renders would just drop frames anyway.
        onRender(Math.min(renderAccumulator, MAX_DT), alpha)
        renderAccumulator = 0
      }
    }
  }

  const start = () => {
    if (running) return
    running = true
    paused = false
    lastRafMs = 0
    simAccumulator = 0
    renderAccumulator = 0
    raf = requestAnimationFrame(tick)
  }

  const stop = () => {
    running = false
    cancelAnimationFrame(raf)
  }

  const setPaused = (p: boolean) => {
    if (p === paused) return
    paused = p
    // Reseed the timestamp on resume so the gap doesn't produce a huge dt.
    if (!p) lastRafMs = 0
  }

  // ── Page visibility integration ────────────────────────────────────────
  // When the tab is hidden, browsers throttle rAF to ~1 Hz. That produces
  // pathological dt values on return. We pause proactively and rely on the
  // consumer to treat their own `isPauseMenuOpen` state independently.
  let wasPausedByVisibility = false
  const onVisibility = () => {
    if (document.hidden) {
      if (!paused) {
        wasPausedByVisibility = true
        setPaused(true)
      }
    } else if (wasPausedByVisibility) {
      wasPausedByVisibility = false
      setPaused(false)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const dispose = () => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { start, stop, setPaused, dispose }
}
