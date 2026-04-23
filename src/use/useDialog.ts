import { ref, computed, readonly } from 'vue'
import {
  DIALOGS,
  voiceLinePath,
  type DialogLine,
  type DialogScript
} from '@/game/dialog'
import useAssets from '@/use/useAssets'
import { prependBaseUrl } from '@/utils/function'
import { resourceCache } from '@/use/useAssets'
import useUser from '@/use/useUser'
import useSounds from '@/use/useSound'

/**
 * Dialog orchestrator.
 *
 * Handles all moment-to-moment dialog playback: rolling through scripts,
 * advancing on voice-line end, handling choice nodes, and sequencing SFX
 * preludes (the "incoming transmission" chime that plays whenever Ekon Tusk
 * takes the mic).
 *
 * State is module-scope — only one dialog runs at a time globally, and every
 * consumer of `useDialog()` gets the same refs. Mission orchestration lives
 * in `useMission`; this module knows nothing about mission phase.
 */

// -- State (singleton) --------------------------------------------------------

const currentScript = ref<DialogScript | null>(null)
const currentLineIdx = ref(0)
const currentLine = computed<DialogLine | null>(() =>
  currentScript.value
    ? currentScript.value.lines[currentLineIdx.value] ?? null
    : null
)
const isDialogOpen = computed(() => !!currentLine.value)
const isAwaitingChoice = computed(() => !!currentLine.value?.choices?.length)
/** True while a line is playing AND no choice prompt is up. */
const isMonologue = computed(() => isDialogOpen.value && !isAwaitingChoice.value)

// -- Audio handles ------------------------------------------------------------

let currentAudio: HTMLAudioElement | null = null
let currentPrelude: HTMLAudioElement | null = null
let lineTimer: any = null
/** Monotonic run id — bumps on every stop/skip so a delayed prelude callback
 *  can tell whether its dialog is still active. */
let runId = 0

/** Silence window enforced after every real dialog close. Any fresh
 *  `startDialog` call (reminder tick, phase trigger, etc.) landing inside
 *  this window is deferred until the grace expires, so Ewall gets a beat
 *  to actually move between chains instead of being heckled on-close.
 *  onDone / nextDialog auto-chains bypass the gate via the `isChain`
 *  flag because they're continuations of the same dialog event, not a
 *  fresh start. */
const DIALOG_GRACE_MS = 1500
let lastDialogCloseAt = 0
export const isInDialogGrace = () =>
  (Date.now() - lastDialogCloseAt) < DIALOG_GRACE_MS
const markDialogClosed = () => {
  lastDialogCloseAt = Date.now()
}

const stopCurrentVoice = () => {
  runId++
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
    }
    currentAudio = null
  }
  if (currentPrelude) {
    try {
      currentPrelude.pause()
    } catch {
    }
    currentPrelude = null
  }
  if (lineTimer) {
    clearTimeout(lineTimer)
    lineTimer = null
  }
}

// -- Low-level playback -------------------------------------------------------

/** Play a one-shot SFX clip and resolve when it ends. Falls back on a safety
 *  timeout so a missing/blocked file can't stall the dialog forever. */
const playPrelude = (src: string, volume: number, fallbackMs: number): Promise<void> =>
  new Promise(resolve => {
    const fullSrc = prependBaseUrl(src)
    const cached = resourceCache.audio.get(fullSrc)
    const audio = cached
      ? cached.cloneNode(false) as HTMLAudioElement
      : new Audio(fullSrc)
    audio.volume = volume
    currentPrelude = audio
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (currentPrelude === audio) currentPrelude = null
      clearTimeout(fallback)
      resolve()
    }
    const fallback = setTimeout(finish, fallbackMs)
    audio.addEventListener('ended', finish, { once: true })
    audio.addEventListener('error', finish, { once: true })
    audio.play().catch(() => {/* fallback timer covers this */
    })
  })

const playVoiceLine = (line: DialogLine, onEnd: () => void) => {
  const { userSoundVolume } = useUser()
  const src = prependBaseUrl(voiceLinePath(line.id))
  const cached = resourceCache.audio.get(src)
  const audio = cached
    ? cached.cloneNode(false) as HTMLAudioElement
    : new Audio(src)
  audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * 0.85))
  currentAudio = audio
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    if (lineTimer) {
      clearTimeout(lineTimer)
      lineTimer = null
    }
    if (currentAudio === audio) currentAudio = null
    onEnd()
  }
  // Only arm a text-only read-time fallback when audio can't actually play
  // (file missing / decode error / autoplay blocked). While the clip is
  // loading or playing we wait for `ended` — the line must stay on screen
  // until the VO finishes, the player presses SPACE, or ESC aborts the
  // dialog. No auto-advance while audio is in flight.
  const armReadBudget = () => {
    if (ended || lineTimer) return
    const readMs = Math.max(3200, line.seconds * 1200 + 600)
    lineTimer = setTimeout(finish, readMs)
  }
  audio.addEventListener('ended', finish, { once: true })
  audio.addEventListener('error', armReadBudget, { once: true })
  audio.play().catch(armReadBudget)
}

// -- Prelude logic ------------------------------------------------------------

/** The "incoming transmission" chime is a dialog-opening cue, not a
 *  per-line effect: it fires once when a brand-new script starts with Tusk
 *  on the mic (prev === null). Mid-dialog Tusk interjections after an
 *  Ewall line don't re-trigger it — playing the chime on every role swap
 *  was "annoying" per user feedback. */
const shouldPlayIncomingTransmission = (
  line: DialogLine,
  prev: DialogLine | null
) => prev === null && line.speaker === 'tusk'

/** Runs one line with any required prelude. The `id` argument is the current
 *  run-id at the call site; if it mismatches by the time the prelude finishes
 *  (player skipped the dialog, started another), we bail silently. */
const runLine = async (
  line: DialogLine,
  prev: DialogLine | null,
  id: number,
  onEnd: () => void
) => {
  // Choice nodes don't auto-play — the UI waits for input.
  if (line.choices?.length) return
  if (shouldPlayIncomingTransmission(line, prev)) {
    const { userSoundVolume } = useUser()
    const vol = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * 0.9))
    await playPrelude('audio/sfx/incoming-transmission.ogg', vol, 2600)
    if (id !== runId) return
  }
  playVoiceLine(line, onEnd)
}

// -- Transitions --------------------------------------------------------------

const advanceLine = () => {
  if (!currentScript.value || !currentLine.value) return
  if (isAwaitingChoice.value) return
  const prev = currentScript.value.lines[currentLineIdx.value] ?? null
  stopCurrentVoice()
  currentLineIdx.value++
  const next = currentScript.value.lines[currentLineIdx.value]
  if (!next) {
    const onDone = currentScript.value.onDone
    currentScript.value = null
    currentLineIdx.value = 0
    // onDone is an auto-chain — this script's last line rolling into the
    // next script's first line is a single dialog event, so it bypasses
    // the grace period. A dialog that ends without onDone is a real
    // close: record the timestamp so anything that wants to talk next
    // has to wait DIALOG_GRACE_MS.
    if (onDone && DIALOGS[onDone]) startDialog(onDone, true)
    else markDialogClosed()
    return
  }
  runLine(next, prev, runId, advanceLine)
}

/** Ewall voicing his own choice. The file is keyed as
 *  `<choiceLineId>_<choiceId>.ogg` (e.g. `flag_brief_choice_silent.ogg`).
 *  If the file is missing or blocked we swallow the error silently and
 *  rely on the whistle reaction to cue the pick instead — keeping the
 *  feature opt-in per choice: add a matching VO file and the line plays,
 *  otherwise the existing behaviour is preserved. Returns a promise that
 *  resolves either when audio ends or on a safety timeout. */
const playChoiceVoice = (lineId: string, choiceId: string, fallbackMs = 1200): Promise<boolean> =>
  new Promise(resolve => {
    const { userSoundVolume } = useUser()
    const fullSrc = prependBaseUrl(`audio/voice/${lineId}_${choiceId}.ogg`)
    const cached = resourceCache.audio.get(fullSrc)
    const audio = cached
      ? cached.cloneNode(false) as HTMLAudioElement
      : new Audio(fullSrc)
    audio.volume = Math.max(0, Math.min(1, (userSoundVolume.value ?? 0.7) * 0.85))
    currentAudio = audio
    let done = false
    const finish = (played: boolean) => {
      if (done) return
      done = true
      if (currentAudio === audio) currentAudio = null
      clearTimeout(safety)
      resolve(played)
    }
    const safety = setTimeout(() => finish(false), fallbackMs)
    audio.addEventListener('ended', () => finish(true), { once: true })
    audio.addEventListener('error', () => finish(false), { once: true })
    audio.play().catch(() => finish(false))
  })

const pickChoice = (choiceId: string) => {
  const line = currentLine.value
  if (!line?.choices) return
  const c = line.choices.find(c => c.id === choiceId)
  if (!c) return
  const prev = line
  const pickedLineId = line.id
  stopCurrentVoice()
  // Whistle reactions still fire on the pick — they're tiny SFX colouring
  // the moment Ewall commits, and overlap fine with the voice below.
  if (c.reaction === 'snappy') {
    const variant = Math.random() < 0.5 ? 'robot-whistle-exited-1' : 'robot-whistle-exited-2'
    useSounds().playSound(variant)
  } else if (c.reaction === 'silent') {
    useSounds().playSound('robot-whistle-bored')
  }
  // Route the script advance through the voice clip (if one exists) so the
  // chosen text is spoken before the next line starts. A missing file
  // resolves immediately via the safety timer and playback continues as
  // before.
  const id = runId
  playChoiceVoice(pickedLineId, choiceId).then(() => {
    if (id !== runId) return  // player skipped / started a new dialog
    advanceAfterChoice(c, prev)
  })
}

/** Script advance helper shared by the choice-voice continuation. */
const advanceAfterChoice = (
  c: { nextDialog?: string },
  prev: DialogLine
) => {
  // Choice → nextDialog is a continuation of the same dialog event. Same
  // grace-bypass treatment as the onDone path in advanceLine.
  if (c.nextDialog) {
    const nextScript = DIALOGS[c.nextDialog]
    if (nextScript) {
      currentScript.value = nextScript
      currentLineIdx.value = 0
      const first = nextScript.lines[0]
      if (first) runLine(first, null, runId, advanceLine)
      return
    }
  }
  currentLineIdx.value++
  const next = currentScript.value?.lines[currentLineIdx.value]
  if (!next) {
    const onDone = currentScript.value?.onDone
    currentScript.value = null
    currentLineIdx.value = 0
    if (onDone && DIALOGS[onDone]) startDialog(onDone, true)
    else markDialogClosed()
    return
  }
  runLine(next, prev, runId, advanceLine)
}

const startDialog = (dialogId: string, isChain = false) => {
  const script = DIALOGS[dialogId]
  if (!script) return
  // Grace-period gate. Fresh starts (reminders, phase triggers) land here
  // and are deferred until the silence window expires; auto-chains pass
  // `isChain = true` to skip the wait so onDone / nextDialog handoffs
  // play back-to-back as intended.
  if (!isChain) {
    const graceLeft = DIALOG_GRACE_MS - (Date.now() - lastDialogCloseAt)
    if (graceLeft > 0) {
      setTimeout(() => startDialog(dialogId, false), graceLeft + 20)
      return
    }
  }
  stopCurrentVoice()
  currentScript.value = script
  currentLineIdx.value = 0
  const first = script.lines[0]
  if (first) runLine(first, null, runId, advanceLine)
}

const skipDialog = () => {
  stopCurrentVoice()
  currentScript.value = null
  currentLineIdx.value = 0
  // User-driven close — same grace semantics as a natural end.
  markDialogClosed()
}

/** Preload every VO file the scripts reference — cheap because scripts are
 *  small. Missing files are silently skipped by the asset loader. */
const preloadAllVoiceLines = async () => {
  const { preloadVoiceLines } = useAssets()
  const paths: string[] = []
  for (const s of Object.values(DIALOGS)) for (const l of s.lines) paths.push(voiceLinePath(l.id))
  await preloadVoiceLines(paths)
}

// -- Public surface -----------------------------------------------------------

const useDialog = () => ({
  currentLine,
  isDialogOpen,
  isAwaitingChoice,
  isMonologue,
  startDialog,
  advanceLine,
  pickChoice,
  skipDialog,
  preloadAllVoiceLines
})

// Also export the mutators directly so non-component modules (cheats,
// mission hooks) don't need to call the composable factory.
export {
  currentLine,
  isDialogOpen,
  isAwaitingChoice,
  isMonologue,
  startDialog,
  advanceLine,
  pickChoice,
  skipDialog,
  preloadAllVoiceLines
}

export default useDialog
