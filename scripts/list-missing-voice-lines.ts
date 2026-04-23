import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIALOGS, type DialogScript } from '../src/game/dialog'

/**
 * List the voice-over `.ogg` files that are missing from
 * `public/audio/voice/` for a fully synchronised build.
 *
 * Output order:
 *   1. Mission scripts, in the order they are declared in DIALOGS.
 *      Reminder scripts are filtered out here by their `reminder_` prefix.
 *   2. Reminder scripts, in declaration order.
 *
 * Within each script we list each line's expected VO file. Any choice
 * options attached to a line are emitted right after their parent line
 * with an `(optional)` suffix — the dialog system falls back to a
 * short whistle SFX when a choice clip is absent, so these are
 * nice-to-have rather than required.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const VOICE_DIR = resolve(__dirname, '../public/audio/voice')

type ScriptEntry = [string, DialogScript]

interface Expected {
  file: string
  script: string
  text: string
  optional: boolean
}

/** Collapse newlines and trailing whitespace so the text fits on a single
 *  output row. The fully formatted file name + script context already
 *  spans ~60 chars, so keep text under a reasonable cap to avoid terminal
 *  wrapping on narrow shells. */
const squashText = (t: string, max = 90) => {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

const collect = (scripts: ScriptEntry[]): Expected[] => {
  const out: Expected[] = []
  for (const [scriptId, script] of scripts) {
    for (const line of script.lines) {
      out.push({
        file: `${line.id}.ogg`,
        script: scriptId,
        text: squashText(line.text),
        optional: false
      })
      if (line.choices) {
        for (const c of line.choices) {
          out.push({
            file: `${line.id}_${c.id}.ogg`,
            script: scriptId,
            text: squashText(c.text),
            optional: true
          })
        }
      }
    }
  }
  return out
}

const entries = Object.entries(DIALOGS) as ScriptEntry[]
const missionScripts = entries.filter(([id]) => !id.startsWith('reminder_'))
const reminderScripts = entries.filter(([id]) => id.startsWith('reminder_'))

const missing = (list: Expected[]) =>
  list.filter(e => !existsSync(resolve(VOICE_DIR, e.file)))

const missionMissing = missing(collect(missionScripts))
const reminderMissing = missing(collect(reminderScripts))

// Column-aligned output: filename+optional tag, script id in brackets,
// then the dialog line (or choice label) text. File widths are padded to
// the longest filename per section so the columns line up visually.
const buildRows = (list: Expected[]) => list.map(e => ({
  file: `${e.file}${e.optional ? ' (optional)' : ''}`,
  script: `[${e.script}]`,
  text: `"${e.text}"`
}))

const printRows = (rows: { file: string; script: string; text: string }[]) => {
  if (rows.length === 0) {
    console.log('  (all present)')
    return
  }
  const fileW = Math.max(...rows.map(r => r.file.length))
  const scriptW = Math.max(...rows.map(r => r.script.length))
  for (const r of rows) {
    console.log(`  ${r.file.padEnd(fileW)}  ${r.script.padEnd(scriptW)}  ${r.text}`)
  }
}

console.log('Missing voice files (public/audio/voice/)')
console.log('='.repeat(48))
console.log()
console.log('Mission lines:')
printRows(buildRows(missionMissing))
console.log()
console.log('Reminder lines:')
printRows(buildRows(reminderMissing))
console.log()
console.log(
  `Summary: ${missionMissing.length} mission missing, `
  + `${reminderMissing.length} reminder missing.`
)

// Exit non-zero if required (non-optional) files are missing, so this can
// double as a lint step in CI if you ever want to enforce full coverage.
const requiredMissing = [...missionMissing, ...reminderMissing]
  .filter(e => !e.optional)
process.exit(requiredMissing.length > 0 ? 1 : 0)
