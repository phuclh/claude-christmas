/**
 * Renders assets/demo.svg, the README's animated demo, from the plugin's own
 * drawing code: the garland's lights and bells and the snowbank's glints,
 * glow and sleigh come from frame.ts, every flake falls its real journey from
 * snow.ts, and the hovered bell's notes and carol name come from ring.ts.
 *
 *   npx -p typescript tsc -p scripts
 *   node .demo-build/scripts/render-demo.js > assets/demo.svg
 */
import { widthOf } from '../plugins/christmas/hooks/cells'
import { BELL, bottomRuleCells, createFrameLayout, PALETTE, sideGlyph, topRule } from '../plugins/christmas/hooks/frame'
import type { Cell, FrameLayout } from '../plugins/christmas/hooks/frame'
import { labelLeft, notesAt, RING_GLOW } from '../plugins/christmas/hooks/ring'
import { flakeAt, snowAt, snowfallSize } from '../plugins/christmas/hooks/snow'

declare const process: { stdout: { write: (text: string) => void } }

const COLUMNS = 84
const CELL_WIDTH = 8.4
const ROW_HEIGHT = 20
const FONT_SIZE = 14
const BASELINE = 15
const PADDING = 20
const TITLE_BAR = 30

const SNOW_TICK_MS = 125
const FRAME_STEP_MS = 250
/** Ticks searched for the moment the demo opens on: the snowiest sky in it. */
const OPENING_SEARCH_TICKS = 400
const SNOW_SEED = 11
/** Frame steps of the lights' chase, the glints and the trees' glow in one loop. */
const TWINKLE_STEPS = 60
/** Frame steps the sleigh has glided in when the demo opens. */
const SLEIGH_HEAD_START = 24
/** Frame steps of rising notes in one loop: a whole number of their pattern. */
const NOTE_STEPS = 24
/** The carol the hovered bell rings. */
const CAROL = 'Jingle Bells'

const INK = {
  window: '#0f1722',
  titleBar: '#172232',
  text: '#e6edf5',
  dim: '#8796a8',
  tool: '#7fc47f',
  pointer: '#ffffff',
}

type Run = { column: number; text: string; style?: 'dim' | 'bold' | 'tool' | 'prompt' }

/** The sample conversation, row by row: a short, ordinary turn. */
const CONVERSATION: Run[][] = [
  [{ column: 0, text: '❯', style: 'prompt' }, { column: 2, text: 'add a dark mode toggle to the settings page' }],
  [],
  [{ column: 0, text: '⏺' }, { column: 2, text: "I'll add a toggle under Appearance and remember the choice." }],
  [],
  [{ column: 0, text: '⏺', style: 'tool' }, { column: 2, text: 'Read', style: 'bold' }, { column: 6, text: '(src/pages/settings.tsx)' }],
  [{ column: 2, text: '⎿  Read 84 lines', style: 'dim' }],
  [],
  [{ column: 0, text: '⏺', style: 'tool' }, { column: 2, text: 'Update', style: 'bold' }, { column: 8, text: '(src/pages/settings.tsx)' }],
  [{ column: 2, text: '⎿  Updated src/pages/settings.tsx with 12 additions', style: 'dim' }],
  [],
  [{ column: 0, text: '⏺' }, { column: 2, text: 'Done. The toggle sits under Appearance and is saved to localStorage.' }],
  [],
  [{ column: 0, text: '✻ Wrapped for 14s', style: 'dim' }],
  [],
]

const SKY_ROWS = CONVERSATION.length
const TOP_RULE_ROW = SKY_ROWS
const DRAFT_ROW = SKY_ROWS + 1
const BOTTOM_RULE_ROW = SKY_ROWS + 2
const STATUS_ROW = SKY_ROWS + 3
const HINT_ROW = SKY_ROWS + 4
const ROWS = SKY_ROWS + 5

const WIDTH = PADDING * 2 + COLUMNS * CELL_WIDTH
const HEIGHT = TITLE_BAR + 12 + ROWS * ROW_HEIGHT + 16

const ARIA_LABEL =
  'Claude Code with the Christmas theme: snow falls over the conversation, the pointer rests on a bell in the garland above the prompt and it rings Jingle Bells, lights chase along the garland and a reindeer sleigh glides along the snowbank below'

/** Draws a note in color: some browsers otherwise take 🎵 and 🎶 from a plain symbol font. */
const EMOJI_FONT = ` font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"`

const SLEIGH = '🛷'
const DEER = '🦌'
const LIGHT = '●'
const GLINT = '✦'
const RULES = ['─', '━']

const css: string[] = []
const fmt = (value: number): string => String(Math.round(value * 100) / 100)
const cellX = (column: number): number => column * CELL_WIDTH
const rowY = (row: number): number => row * ROW_HEIGHT
const percent = (step: number, steps: number): string => `${fmt((step / steps) * 100)}%`

/** A repeatable random source, so the demo rolls the same scatter every run. */
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/**
 * The first layout with a good spread: four bells or more, one of them near
 * the middle to ring, a bow, and trees and presents on the snow.
 */
function showcaseLayout(): { layout: FrameLayout; bellColumn: number } {
  for (let seed = 1; ; seed++) {
    const layout = createFrameLayout(seededRandom(seed))
    const garland = topRule(layout, COLUMNS, 0)
    const top = garland.cells.map(cell => cell?.glyph)
    const bottom = bottomRuleCells(layout, COLUMNS, 0, false).map(cell => cell?.glyph)
    const count = (glyphs: (string | undefined)[], glyph: string) => glyphs.filter(each => each === glyph).length
    const middle = garland.bells.find(spot => spot.column >= 30 && spot.column <= 48)

    if (garland.bells.length >= 4 && middle && top.includes('🎀') && count(bottom, '🎄') >= 3 && count(bottom, '🎁') >= 2) {
      return { layout, bellColumn: middle.column }
    }
  }
}

function text(column: number, row: number, content: string, attributes = ''): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<text x="${fmt(cellX(column))}" y="${fmt(rowY(row) + BASELINE)}"${attributes}>${escaped}</text>`
}

function line(fromColumn: number, toColumn: number, row: number, color: string, weight: number, attributes = ''): string {
  const y = fmt(rowY(row) + ROW_HEIGHT / 2)

  return `<line x1="${fmt(cellX(fromColumn))}" y1="${y}" x2="${fmt(cellX(toColumn))}" y2="${y}" stroke="${color}" stroke-width="${weight}"${attributes}/>`
}

/** A patch of window over the cells a glyph takes, as the terminal replaces what was there. */
function patch(column: number, row: number, cells: number, inset = 0): string {
  return `<rect x="${fmt(cellX(column) - 0.5)}" y="${fmt(rowY(row) + inset)}" width="${fmt(cells * CELL_WIDTH + 1)}" height="${ROW_HEIGHT - inset * 2}" fill="${INK.window}"/>`
}

/** An emoji or glyph sitting on a rule: a patch of window cut out of the line under it. */
function propOnRule(column: number, row: number, glyph: string, attributes = ''): string {
  return patch(column, row, widthOf(glyph), 3) + text(column, row, glyph, attributes)
}

/** The rule's line and the props sitting on it; what animates is left to its own layer. */
function drawRule(cells: readonly Cell[], row: number, baseColor: string, skip: (cell: NonNullable<Cell>, column: number) => boolean): string {
  const parts = [line(0, COLUMNS, row, baseColor, 1.4)]

  cells.forEach((cell, column) => {
    if (cell === null || RULES.includes(cell.glyph) || skip(cell, column)) {
      return
    }

    parts.push(propOnRule(column, row, cell.glyph, cell.color ? ` fill="${cell.color}"` : ''))
  })

  return parts.join('')
}

/** One CSS animation stepping through `values`, a keyframe only where the value changes. */
function stepAnimation(name: string, values: readonly string[], stepMs: number, delayMs = 0): void {
  const keyframes: string[] = []
  let previous = ''

  values.forEach((value, step) => {
    if (value !== previous) {
      keyframes.push(`${percent(step, values.length)}{${value}}`)
      previous = value
    }
  })

  css.push(`@keyframes ${name}{${keyframes.join('')}}.${name}{animation:${name} ${values.length * stepMs}ms step-end ${delayMs}ms infinite}`)
}

/** Glyphs on a rule whose color steps with the frame: the garland's bulbs, the snow's glints. */
function drawTwinkles(frames: readonly (readonly Cell[])[], row: number, glyph: string, prefix: string): string {
  const parts: string[] = []
  const first = frames[0] ?? []

  first.forEach((cell, column) => {
    if (cell?.glyph !== glyph) {
      return
    }

    const name = `${prefix}${column}`
    stepAnimation(name, frames.map(cells => `fill:${cells[column]?.color ?? INK.text}`), FRAME_STEP_MS)
    parts.push(propOnRule(column, row, glyph, ` class="${name}" fill="${cell.color ?? INK.text}"`))
  })

  return parts.join('')
}

/** The trees' glow on the snowbank: every rule cell whose color changes gets a segment of its own. */
function drawGlow(frames: readonly (readonly Cell[])[]): string {
  const parts: string[] = []

  for (let column = 0; column < COLUMNS; column++) {
    const looks = frames.map(cells => {
      const cell = cells[column]
      const isGlow = cell != null && (cell.glyph === '━' || (cell.glyph === '─' && cell.color !== PALETTE.snow))

      return isGlow ? `stroke:${cell.color ?? PALETTE.snow};stroke-width:${cell.glyph === '━' ? 2.6 : 1.6}px;opacity:1` : 'opacity:0'
    })

    if (looks.every(look => look === 'opacity:0')) {
      continue
    }

    stepAnimation(`glow${column}`, looks, FRAME_STEP_MS)
    parts.push(line(column, column + 1, BOTTOM_RULE_ROW, PALETTE.gold[1], 1.6, ` class="glow${column}"`))
  }

  return parts.join('')
}

/** The reindeer sleigh gliding along the snowbank on its own period, its gold trail behind it. */
function drawSleigh(layout: FrameLayout): string {
  const leadAt = (step: number): number => {
    const sleigh = bottomRuleCells(layout, COLUMNS, step, true).findIndex(cell => cell?.glyph === SLEIGH)

    return sleigh < 0 ? -1 : sleigh - 4
  }
  let enter = 0

  while (leadAt(enter) < 0 || leadAt(enter - 1) >= 0) {
    enter++
  }

  let next = enter + 1

  while (leadAt(next) < 0 || leadAt(next - 1) >= 0) {
    next++
  }

  const looks = Array.from({ length: next - enter }, (_, step) => {
    const lead = leadAt(enter + step)

    return lead < 0 ? 'opacity:0' : `opacity:1;transform:translate(${fmt(cellX(lead))}px,0)`
  })
  stepAnimation('sleigh', looks, FRAME_STEP_MS, -SLEIGH_HEAD_START * FRAME_STEP_MS)

  const trail = PALETTE.gold.map((color, index) => patch(6 + index, BOTTOM_RULE_ROW, 1, 3) + line(6 + index, 7 + index, BOTTOM_RULE_ROW, color, 2.6)).join('')
  const team = [DEER, DEER, SLEIGH].map((glyph, index) => propOnRule(index * 2, BOTTOM_RULE_ROW, glyph)).join('')

  return `<g class="sleigh" opacity="0">${trail}${team}</g>`
}

/** The tick with the most flakes in the sky, so the demo opens on a good fall of snow. */
function snowiestTick(): number {
  let snowiest = 0
  let most = -1

  for (let tick = 0; tick < OPENING_SEARCH_TICKS; tick++) {
    const falling = snowAt(SNOW_SEED, COLUMNS, SKY_ROWS, tick).length

    if (falling > most) {
      most = falling
      snowiest = tick
    }
  }

  return snowiest
}

/**
 * Every flake of the snowfall on a loop of its own: one whole fall and the
 * rest after it, so the snow never falls the same way twice.
 */
function drawSnow(): string {
  const parts: string[] = []
  const opening = snowiestTick()

  for (let flake = 0; flake < snowfallSize(COLUMNS, SKY_ROWS); flake++) {
    const at = (tick: number) => flakeAt(SNOW_SEED, flake, COLUMNS, SKY_ROWS, tick)
    let start = 1

    while (at(start) === undefined || at(start - 1) !== undefined) {
      start++
    }

    let end = start + 1

    while (at(end) === undefined || at(end - 1) !== undefined) {
      end++
    }

    const looks = Array.from({ length: end - start }, (_, step) => {
      const spot = at(start + step)

      return spot ? `transform:translate(${fmt(cellX(spot.x))}px,${fmt(rowY(spot.y))}px)` : 'transform:translate(-40px,-40px)'
    })
    const period = end - start
    const delay = -((((opening - start) % period) + period) % period) * SNOW_TICK_MS
    stepAnimation(`flake${flake}`, looks, SNOW_TICK_MS, delay)

    const spot = at(start)
    parts.push(
      `<g class="flake${flake}" transform="translate(-40,-40)">${patch(0, 0, 1, 2)}${text(0, 0, spot?.glyph ?? '❄', ` fill="${spot?.color ?? INK.text}"`)}</g>`,
    )
  }

  return parts.join('')
}

/** The hovered bell's layers, each drawn at its own depth. */
type RingingBell = { glow: string; bell: string; name: string; notes: string; pointer: string }

/**
 * The hovered bell: it flashes, its carol's name shows beside it, notes rise
 * from it, and the pointer rests on it.
 */
function drawRingingBell(column: number): RingingBell {
  css.push(
    `@keyframes ring{0%{fill:${RING_GLOW[0]}}50%{fill:${RING_GLOW[1]}}}.ring{animation:ring ${RING_GLOW.length * FRAME_STEP_MS}ms step-end infinite}`,
  )
  const glow = `<rect class="ring" x="${fmt(cellX(column))}" y="${fmt(rowY(TOP_RULE_ROW))}" width="${fmt(2 * CELL_WIDTH)}" height="${ROW_HEIGHT}" fill="${RING_GLOW[0]}"/>`
  const bell = text(column, TOP_RULE_ROW, BELL)

  const label = `♪ ${CAROL} ♪`
  const labelColumn = labelLeft(column, label, COLUMNS)
  const name = patch(labelColumn, TOP_RULE_ROW - 1, widthOf(label)) + text(labelColumn, TOP_RULE_ROW - 1, label, ` fill="${PALETTE.gold[1]}" font-weight="700"`)

  css.push(
    `@keyframes note{0%{opacity:1}${percent(1, NOTE_STEPS)}{opacity:0}}.note{opacity:0;animation:note ${NOTE_STEPS * FRAME_STEP_MS}ms step-end infinite}`,
  )
  const notes = Array.from({ length: NOTE_STEPS }, (_, step) => {
    const drawn = notesAt(column, NOTE_STEPS * 10 + step, COLUMNS)
      .map(note => patch(note.x, TOP_RULE_ROW - note.rise, 2) + text(note.x, TOP_RULE_ROW - note.rise, note.glyph, EMOJI_FONT))
      .join('')
    const delay = -((NOTE_STEPS - step) % NOTE_STEPS) * FRAME_STEP_MS

    return `<g class="note" style="animation-delay:${delay}ms">${drawn}</g>`
  }).join('')

  const tipX = cellX(column) + CELL_WIDTH * 1.2
  const tipY = rowY(TOP_RULE_ROW) + 10
  const pointer = `<path transform="translate(${fmt(tipX)},${fmt(tipY)}) scale(0.85)" d="M0 0V17L4.2 13 7.2 20 10 18.8 7.1 12.1H12.8Z" fill="${INK.pointer}" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>`

  return { glow, bell, name, notes, pointer }
}

function drawRun(run: Run, row: number): string {
  const styles = {
    dim: ` fill="${INK.dim}"`,
    bold: ' font-weight="700"',
    tool: ` fill="${INK.tool}"`,
    prompt: ` fill="${INK.dim}"`,
  }

  return text(run.column, row, run.text, run.style ? styles[run.style] : '')
}

function render(): string {
  const { layout, bellColumn } = showcaseLayout()
  const conversation = CONVERSATION.flatMap((runs, row) => runs.map(run => drawRun(run, row))).join('')
  const snow = drawSnow()
  const ringing = drawRingingBell(bellColumn)

  const garlandFrames = Array.from({ length: TWINKLE_STEPS }, (_, step) => topRule(layout, COLUMNS, step).cells)
  const garland = drawRule(garlandFrames[0] ?? [], TOP_RULE_ROW, PALETTE.pine, (cell, column) => cell.glyph === LIGHT || column === bellColumn)
  const lights = drawTwinkles(garlandFrames, TOP_RULE_ROW, LIGHT, 'light')

  const bankFrames = Array.from({ length: TWINKLE_STEPS }, (_, step) => bottomRuleCells(layout, COLUMNS, step, false))
  const bank = drawRule(bankFrames[0] ?? [], BOTTOM_RULE_ROW, PALETTE.snow, cell => cell.glyph === GLINT)
  const glow = drawGlow(bankFrames)
  const glints = drawTwinkles(bankFrames, BOTTOM_RULE_ROW, GLINT, 'glint')
  const sleigh = drawSleigh(layout)

  const modes = '🎄 holly jolly'
  const prompt = [
    text(0, DRAFT_ROW, '❯', ` fill="${INK.dim}"`),
    text(2, DRAFT_ROW, 'make it snow'),
    text(COLUMNS - 2, DRAFT_ROW, sideGlyph(layout, 0)),
    text(2, STATUS_ROW, 'Opus 5.5 · ~/projects/app', ` fill="${INK.dim}"`),
    text(COLUMNS - widthOf(modes), STATUS_ROW, modes, ` fill="${INK.dim}"`),
    text(2, HINT_ROW, '? for shortcuts', ` fill="${INK.dim}"`),
  ].join('')
  const dots = ['#ff5f57', '#febc2e', '#28c840']
    .map((color, index) => `<circle cx="${18 + index * 18}" cy="${TITLE_BAR / 2}" r="5.5" fill="${color}" opacity="0.85"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(WIDTH)}" height="${fmt(HEIGHT)}" viewBox="0 0 ${fmt(WIDTH)} ${fmt(HEIGHT)}" role="img" aria-label="${ARIA_LABEL}">
<style>
text{font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:${FONT_SIZE}px;white-space:pre}
${css.join('\n')}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs><clipPath id="sky"><rect x="0" y="0" width="${fmt(COLUMNS * CELL_WIDTH)}" height="${fmt(SKY_ROWS * ROW_HEIGHT)}"/></clipPath></defs>
<rect width="100%" height="100%" rx="12" fill="${INK.window}"/>
<path d="M0 12a12 12 0 0 1 12-12h${fmt(WIDTH - 24)}a12 12 0 0 1 12 12v${TITLE_BAR - 12}h-${fmt(WIDTH)}z" fill="${INK.titleBar}"/>
${dots}
<g transform="translate(${PADDING},${TITLE_BAR + 12})" fill="${INK.text}">
${conversation}
<g clip-path="url(#sky)">${snow}</g>
${ringing.name}${ringing.notes}
${garland}${lights}${ringing.glow}${ringing.bell}
${prompt}
${bank}${glow}${glints}${sleigh}
${ringing.pointer}
</g>
</svg>
`
}

process.stdout.write(render())
