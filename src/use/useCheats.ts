import { onMounted, onUnmounted, ref } from 'vue'

const storedCheat = (() => {
  try {
    return localStorage.getItem('cheat') || 'false'
  } catch {
    return 'false'
  }
})()
const isCheat = ref<boolean>(JSON.parse(storedCheat))

/** Mission checkpoints the user can jump to. Each represents the world state
 *  *after* the named mission has completed — phase advanced, inventory set,
 *  player teleported to a sensible starting spot for the next objective, and
 *  any in-flight or preceding dialog skipped so nothing flies in mid-warp. */
export type MissionCheckpoint =
  | 'flag_done'       // flag posed; heading to quarry
  | 'quarry_done'     // ore extracted; heading back to base
  | 'craft_ready'     // back at base with ore; smelt time
  | 'mission_done'    // everything wrapped

/** Incremented whenever a cheat signal wants to force a scene to react. */
export const cheatSignals = {
  skipDialog: ref(0),
  refillFuel: ref(0),
  advanceMission: ref(0),
  teleportToFlag: ref(0),
  teleportToQuarry: ref(0),
  teleportToBase: ref(0),
  toggleNoClip: ref(0),
  /** Bumps each time a checkpoint cheat fires. Read `checkpoint` for which. */
  jumpCheckpoint: ref(0),
  checkpoint: ref<MissionCheckpoint | ''>('')
}

const useCheats = () => {
  if (!isCheat.value) return {}

  const cheatsMap: Record<string, () => void> = {
    'ctrl+shift+s': () => {
      cheatSignals.skipDialog.value++
      console.warn('[CHEAT] Skip dialog')
    },
    'ctrl+shift+f': () => {
      cheatSignals.refillFuel.value++
      console.warn('[CHEAT] Fuel refilled')
    },
    'ctrl+shift+m': () => {
      cheatSignals.advanceMission.value++
      console.warn('[CHEAT] Advance mission')
    },
    'ctrl+shift+1': () => {
      cheatSignals.teleportToFlag.value++
      console.warn('[CHEAT] Teleport to flag')
    },
    'ctrl+shift+2': () => {
      cheatSignals.teleportToQuarry.value++
      console.warn('[CHEAT] Teleport to quarry')
    },
    'ctrl+shift+3': () => {
      cheatSignals.teleportToBase.value++
      console.warn('[CHEAT] Teleport to base')
    },
    'ctrl+shift+n': () => {
      cheatSignals.toggleNoClip.value++
      console.warn('[CHEAT] Toggle noclip')
    },
    // Mission-checkpoint cheats — jump to the state AFTER the named mission
    // has finished. Each resets voice and inventory so old banter and old
    // progress from an earlier phase can't leak into the new one.
    'ctrl+shift+4': () => {
      cheatSignals.checkpoint.value = 'flag_done'
      cheatSignals.jumpCheckpoint.value++
      console.warn('[CHEAT] Checkpoint: flag posing done (→ walk to quarry)')
    },
    'ctrl+shift+5': () => {
      cheatSignals.checkpoint.value = 'quarry_done'
      cheatSignals.jumpCheckpoint.value++
      console.warn('[CHEAT] Checkpoint: quarry done (→ return to base)')
    },
    'ctrl+shift+6': () => {
      cheatSignals.checkpoint.value = 'craft_ready'
      cheatSignals.jumpCheckpoint.value++
      console.warn('[CHEAT] Checkpoint: back at base (→ smelt ore)')
    },
    'ctrl+shift+7': () => {
      cheatSignals.checkpoint.value = 'mission_done'
      cheatSignals.jumpCheckpoint.value++
      console.warn('[CHEAT] Checkpoint: mission complete')
    }
  }

  const heldKeys = new Set<string>()
  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])

  const normalizeKey = (e: KeyboardEvent): string | null => {
    const codeMatch = e.code.match(/^Digit(\d)$/)
    if (codeMatch) return codeMatch[1]!
    const k = e.key.toLowerCase()
    return MODIFIER_KEYS.has(k) ? null : k
  }

  const buildShortcut = (e: KeyboardEvent): string => {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    const sorted = [...heldKeys].sort()
    parts.push(...sorted)
    return parts.join('+')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.add(key)
    const shortcut = buildShortcut(e)
    if (cheatsMap[shortcut]) {
      e.preventDefault()
      cheatsMap[shortcut]()
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.delete(key)
  }

  const handleBlur = () => {
    heldKeys.clear()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  })

  return { isCheat }
}

export default useCheats
