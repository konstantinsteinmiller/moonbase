// Injected via page.addInitScript — runs in every page before any app code.
// Collects rAF deltas into window.__perfSamples. Playwright reads the array
// out after the scenario finishes. Keep this lean and free of any hooks into
// game code so the same probe works identically on before/after branches.
(() => {
  window.__perfSamples = []
  let lastT = 0
  const tick = (now) => {
    if (lastT) window.__perfSamples.push(now - lastT)
    lastT = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  // Reset call — invoked right before the measurement window opens so we
  // discard warm-up / load / first-launch frames.
  window.__perfReset = () => {
    window.__perfSamples = []
    lastT = 0
  }
})()
