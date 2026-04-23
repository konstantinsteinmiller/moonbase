import { ref, computed, readonly, watch, effectScope } from 'vue'
import type { Ref } from 'vue'
import { MISSION_OBJECTIVES, type MissionPhase } from '@/game/dialog'
import useDialog, { isDialogOpen, startDialog, isInDialogGrace } from '@/use/useDialog'
import useInventory from '@/use/useInventory'

/**
 * Mission orchestrator.
 *
 * Owns mission phase + HUD banner. Dialog playback is delegated to
 * `useDialog` — this composable re-exports those refs/functions so existing
 * call sites can keep consuming a single hook.
 *
 * Also owns the "reminder" system: if the player idles in a mission phase for
 * too long, Ekon Tusk calls back (impatient, condescending) with a reminder
 * script. Each phase has a rotating list of variants so repeated reminders
 * don't say the same thing. A separate low-fuel watcher triggers the refuel
 * reminder once when fuel drops past a threshold (rearmed after refilling).
 */

const phase: Ref<MissionPhase> = ref('boot')
const objective = computed(() => MISSION_OBJECTIVES[phase.value])

// Which broken Ewalls the player has already salvaged. Used to gate the
// "all three visited → return and repair" transition and to prevent
// re-triggering a robot's forensic monologue when the player wanders back.
export type BrokenEwallKind = 'valley' | 'rift' | 'quarry'
const salvagedSet = ref<Set<BrokenEwallKind>>(new Set())
const salvagedCount = computed(() => salvagedSet.value.size)
const hasSalvaged = (k: BrokenEwallKind) => salvagedSet.value.has(k)
const markSalvaged = (k: BrokenEwallKind) => {
  // Trigger Vue reactivity by replacing the Set rather than mutating it in
  // place — a plain `add` on a ref<Set> does not register as a change.
  if (salvagedSet.value.has(k)) return
  const next = new Set(salvagedSet.value)
  next.add(k)
  salvagedSet.value = next
}
const resetSalvaged = () => {
  salvagedSet.value = new Set()
}
const snapshotSalvaged = (): BrokenEwallKind[] => Array.from(salvagedSet.value)
const restoreSalvaged = (list: BrokenEwallKind[]) => {
  salvagedSet.value = new Set(list)
}
const setPhaseUnsafe = (p: MissionPhase) => {
  phase.value = p
}

const missionBanner = ref<string | null>(null)
const missionBannerTimeout = ref<any | null>(null)

const showMissionBanner = (text: string, ms = 4200) => {
  missionBanner.value = text
  if (missionBannerTimeout.value) clearTimeout(missionBannerTimeout.value)
  missionBannerTimeout.value = setTimeout(() => {
    missionBanner.value = null
  }, ms)
}

const setPhase = (next: MissionPhase, opts: { announce?: boolean } = {}) => {
  if (phase.value === next) return
  phase.value = next
  if (opts.announce !== false) showMissionBanner(MISSION_OBJECTIVES[next])
}

// -- Reminder system ----------------------------------------------------------

/** Phases that actively nag the player when they idle. Phases not listed are
 *  treated as transitional / safe (boot, flag_found, complete). Variant lists
 *  cycle round-robin so the player hears every flavor before repeats. */
const phaseReminders: Partial<Record<MissionPhase, string[]>> = {
  flag_walk: ['reminder_flag_walk_1', 'reminder_flag_walk_2', 'reminder_flag_walk_3'],
  quarry_walk: ['reminder_quarry_walk_1', 'reminder_quarry_walk_2'],
  quarry_extract: ['reminder_quarry_extract_1', 'reminder_quarry_extract_2'],
  quarry_done: ['reminder_return_to_base_1', 'reminder_return_to_base_2'],
  return_to_base: ['reminder_return_to_base_1', 'reminder_return_to_base_2'],
  craft: ['reminder_craft_1', 'reminder_craft_2'],
  // Post-"complete" act — comms still live, so Tusk drives the reminders.
  explorer_walk: ['reminder_explorer_walk_1', 'reminder_explorer_walk_2'],
  // Post-meteor acts — comms dead. Monologue-only reminders (speaker=ewall).
  salvage_walk: ['reminder_salvage_walk_1', 'reminder_salvage_walk_2'],
  repair_walk: ['reminder_repair_walk_1']
}

/** Seconds of inactivity in a phase before the first reminder fires. */
const REMINDER_GRACE = 50
/** Seconds between follow-up reminders inside the same phase. */
const REMINDER_REPEAT = 80

const phaseElapsed = ref(0)
const nextReminderAt = ref(REMINDER_GRACE)
/** Reminders already fired for each phase, across the whole session.
 *  Variants are dropped from the candidate pool permanently once played so
 *  the same nag never repeats — even if the player re-enters a phase.
 *  Keyed by phase; values are the reminder IDs that have already been
 *  consumed. */
const playedReminders = new Map<MissionPhase, Set<string>>()

// Detached scope so module-level watchers aren't tied to any one component's
// lifecycle — the mission singleton lives as long as the app does.
const missionScope = effectScope(true)
missionScope.run(() => {
  watch(phase, () => {
    phaseElapsed.value = 0
    nextReminderAt.value = REMINDER_GRACE
  })
})

/** Drive mission-side timers from the fixed-step loop. Callers are responsible
 *  for not ticking while the game is paused — we still guard dialog state and
 *  phases-without-reminders internally so spurious calls are harmless. */
const tickReminders = (dt: number) => {
  const variants = phaseReminders[phase.value]
  if (!variants || variants.length === 0) return
  // Don't stack reminders on top of any other dialog (including a previous
  // reminder still mid-playback). The grace check prevents the tick from
  // firing the instant a dialog closes — Ewall gets a beat of silence
  // first. In both cases the schedule clock still advances so the next
  // firing lands on time once the block lifts.
  if (isDialogOpen.value) return
  phaseElapsed.value += dt
  if (phaseElapsed.value < nextReminderAt.value) return
  if (isInDialogGrace()) return
  // Pool of reminders not yet played in this phase. Once exhausted, this
  // phase simply stops nagging — repeating the same script would read as
  // robotic, not nagging. The timer still bumps so we're not thrashing
  // the check every frame.
  const played = playedReminders.get(phase.value) ?? new Set<string>()
  const unplayed = variants.filter(v => !played.has(v))
  nextReminderAt.value = phaseElapsed.value + REMINDER_REPEAT
  if (unplayed.length === 0) return
  const id = unplayed[0]!
  played.add(id)
  playedReminders.set(phase.value, played)
  startDialog(id)
}

// -- Low-fuel reminder --------------------------------------------------------

/** Fires once when fuel crosses the low threshold. Rearmed only after fuel
 *  refills comfortably past the hysteresis band so a player drifting around
 *  the cutoff doesn't hear "you're wasting fuel" on loop. */
const LOW_FUEL_TRIGGER = 0.15
// Low-fuel is a ONE-SHOT reminder per session — Tusk's sarcastic pep-talk
// is funny the first time and tiresome the second. Once fired, we never
// re-arm. Refuelling behaves normally; the reminder simply never returns.
const lowFuelFiredOnce = ref(false)

let lowFuelWatcherInstalled = false
const installLowFuelWatcher = () => {
  if (lowFuelWatcherInstalled) return
  lowFuelWatcherInstalled = true
  missionScope.run(() => {
    const { fuel } = useInventory()
    watch(() => fuel.value, (v) => {
      if (v <= LOW_FUEL_TRIGGER && !lowFuelFiredOnce.value) {
        lowFuelFiredOnce.value = true
        // Let any currently-playing dialog finish before barging in.
        if (!isDialogOpen.value) startDialog('reminder_low_fuel')
        else {
          const stop = watch(isDialogOpen, (open) => {
            if (!open) {
              startDialog('reminder_low_fuel')
              stop()
            }
          })
        }
      }
    })
  })
}

const useMission = () => {
  const dialog = useDialog()
  installLowFuelWatcher()
  return {
    phase: readonly(phase),
    objective,
    missionBanner: readonly(missionBanner),
    setPhase,
    setPhaseUnsafe,
    showMissionBanner,
    tickReminders,
    salvagedCount,
    hasSalvaged,
    markSalvaged,
    resetSalvaged,
    snapshotSalvaged,
    restoreSalvaged,
    // Delegated to useDialog so callers keep a single import.
    ...dialog
  }
}

export default useMission
