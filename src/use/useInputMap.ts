import { onMounted, onUnmounted, reactive, ref, readonly } from 'vue'
import { GAME_USER_KEYBINDINGS } from '@/utils/constants'

/**
 * Actions the game listens to. Keys are the canonical action names; values
 * are KeyboardEvent.code strings (layout-independent: WASD always works even
 * on AZERTY).
 */
export type GameAction =
  | 'forward'
  | 'backward'
  | 'strafeLeft'
  | 'strafeRight'
  | 'interact'
  | 'flamethrower'
  | 'craft'
  | 'pause'
  | 'sprint'
  | 'screenshot'

export const DEFAULT_BINDINGS: Record<GameAction, string> = {
  forward: 'KeyW',
  backward: 'KeyS',
  strafeLeft: 'KeyA',
  strafeRight: 'KeyD',
  interact: 'KeyE',
  flamethrower: 'KeyF',
  craft: 'KeyC',
  pause: 'Escape',
  sprint: 'ShiftLeft',
  screenshot: 'KeyG'
}

const loadBindings = (): Record<GameAction, string> => {
  try {
    const raw = localStorage.getItem(GAME_USER_KEYBINDINGS)
    if (!raw) return { ...DEFAULT_BINDINGS }
    const parsed = JSON.parse(raw)
    const merged: Record<GameAction, string> = { ...DEFAULT_BINDINGS }
    for (const key of Object.keys(DEFAULT_BINDINGS) as GameAction[]) {
      if (typeof parsed[key] === 'string') merged[key] = parsed[key]
    }
    return merged
  } catch {
    return { ...DEFAULT_BINDINGS }
  }
}

const bindings = reactive<Record<GameAction, string>>(loadBindings())
const pressed = reactive<Record<GameAction, boolean>>({
  forward: false,
  backward: false,
  strafeLeft: false,
  strafeRight: false,
  interact: false,
  flamethrower: false,
  craft: false,
  pause: false,
  sprint: false,
  screenshot: false
})

/** Canonical friendly label for a KeyboardEvent.code. */
export const prettyKey = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Arrow')) return code.slice(5)
  const map: Record<string, string> = {
    Space: 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Tab: 'Tab',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\'
  }
  return map[code] ?? code
}

const persist = () => {
  try {
    localStorage.setItem(GAME_USER_KEYBINDINGS, JSON.stringify(bindings))
  } catch {
  }
}

let captureHandler: ((code: string) => void) | null = null

/** Start listening for the next key press; callback fires once and clears. */
export const captureNextKey = (cb: (code: string) => void) => {
  captureHandler = cb
}

export const cancelCapture = () => {
  captureHandler = null
}

const isCapturing = () => captureHandler !== null

const useInputMap = () => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (isCapturing() && e.code !== 'Escape') {
      e.preventDefault()
      const h = captureHandler
      captureHandler = null
      h?.(e.code)
      return
    }
    for (const action of Object.keys(bindings) as GameAction[]) {
      if (bindings[action] === e.code) {
        pressed[action] = true
        // Let ESC for pause propagate since the app handles it distinctively
        if (action !== 'pause') e.preventDefault()
      }
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    for (const action of Object.keys(bindings) as GameAction[]) {
      if (bindings[action] === e.code) pressed[action] = false
    }
  }

  const handleBlur = () => {
    for (const a of Object.keys(pressed) as GameAction[]) pressed[a] = false
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

  const rebind = (action: GameAction, code: string) => {
    // If any other action uses this code, swap it to the action's old code to
    // keep every action covered.
    for (const other of Object.keys(bindings) as GameAction[]) {
      if (other !== action && bindings[other] === code) {
        bindings[other] = bindings[action]
      }
    }
    bindings[action] = code
    persist()
  }

  const resetBindings = () => {
    for (const key of Object.keys(DEFAULT_BINDINGS) as GameAction[]) {
      bindings[key] = DEFAULT_BINDINGS[key]
    }
    persist()
  }

  return {
    bindings: readonly(bindings),
    pressed: readonly(pressed),
    rebind,
    resetBindings,
    prettyKey
  }
}

export default useInputMap
