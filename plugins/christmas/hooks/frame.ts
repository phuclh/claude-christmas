/**
 * The Christmas frame around the prompt box: a pine garland above, strung
 * with chasing lights and hung with bells and bows, and a snowy bank below
 * where trees glow, presents sit and, now and then, a reindeer sleigh glides by.
 *
 * Pure: a session's layout is rolled once, and every frame is drawn from it
 * and the animation tick, so redraws never reshuffle anything.
 */

import { noise } from './noise'

/** One terminal cell; `null` is the right half of the emoji to its left. */
export type Cell = { glyph: string; color?: string } | null

/** Something sitting on a rule, at a fraction of the rule's length; a bell has its number. */
type Prop = { at: number; glyph: string; bell?: number }

export type FrameLayout = {
  seed: number
  top: Prop[]
  bottom: Prop[]
  corners: { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string }
  sides: string[]
  /** How many bells hang on the garland, numbered from 0, left to right. */
  bellCount: number
}

/** Where a bell landed on the garland as drawn at some width. */
export type BellSpot = { column: number; bell: number }

export const PALETTE = {
  pine: '#2E8B57',
  snow: '#E6F0FF',
  frost: '#9FB7D9',
  lights: ['#FF4D4D', '#FFD24A', '#4ADE80', '#60A5FA', '#F472B6'],
  unlit: '#3F4A44',
  gold: ['#FFE9A8', '#FFD24A', '#D99A1E'],
} as const

export const BELL = '🔔'
const TREE = '🎄'
const DEER = '🦌'
const SLEIGH = '🛷'
const RULE = '─'
const HOT_RULE = '━'
const LIGHT = '●'
const GLINT = '✦'

/** Fewest bells on the garland, so there is always one to hover. */
const MIN_BELLS = 3
/** The lights sit every this many cells of bare garland. */
const LIGHT_SPACING = 4
/** Frame ticks the lights take to chase one bulb along. */
const CHASE_TICKS = 2
/** Frame ticks the sleigh waits off-stage between two runs. */
const SLEIGH_PAUSE_TICKS = 120

const TOP_POOL = [BELL, BELL, BELL, BELL, '🎀', '🎀', '🌟', '🍭', '🧦']
const BOTTOM_POOL = [TREE, TREE, TREE, TREE, '🎁', '🎁', '🎁', '🧦', '🍪', '🧸', '🍭', DEER]
const SIDE_POOL = ['🎁', '🍬', '🧦', '🎀', '🍭', '🍪']

const randomOf = <T>(list: readonly T[], random: () => number): T =>
  list[Math.floor(random() * list.length)] as T

/**
 * Scatters props along a rule at irregular gaps: mostly wide, now and then a
 * tight clump of two or three, so no two sessions look alike.
 */
function scatter(pool: readonly string[], density: number, random: () => number): Prop[] {
  const props: Prop[] = []
  let at = random() * 0.08

  while (at < 1) {
    props.push({ at, glyph: randomOf(pool, random) })
    const isClump = random() < 0.3
    at += isClump ? 0.03 + random() * 0.02 : (0.06 + random() * 0.14) / density
  }

  return props
}

/**
 * Makes sure the garland holds enough bells, turning other props spread along
 * it into bells, then numbers the bells left to right.
 */
function hangBells(props: Prop[]): number {
  const others = props.filter(prop => prop.glyph !== BELL)
  let missing = MIN_BELLS - (props.length - others.length)

  for (let index = 0; missing > 0 && index < others.length; index += Math.max(1, Math.floor(others.length / MIN_BELLS))) {
    const prop = others[index]

    if (prop !== undefined) {
      prop.glyph = BELL
      missing--
    }
  }

  let bell = 0

  for (const prop of props) {
    if (prop.glyph === BELL) {
      prop.bell = bell++
    }
  }

  return bell
}

export function createFrameLayout(random: () => number = Math.random): FrameLayout {
  const top = scatter(TOP_POOL, 0.75, random)
  const bellCount = hangBells(top)

  return {
    seed: Math.floor(random() * 1_000_000),
    top,
    bottom: scatter(BOTTOM_POOL, 1, random),
    corners: {
      topLeft: randomOf(['🌟', '🎀', '🍭'], random),
      topRight: randomOf(['🌟', '🎀', '🍭'], random),
      bottomLeft: TREE,
      bottomRight: randomOf([TREE, '🎁', '🧦'], random),
    },
    sides: Array.from({ length: 12 }, () => randomOf(SIDE_POOL, random)),
    bellCount,
  }
}

function emptyRule(columns: number, color: string): Cell[] {
  return Array.from({ length: columns }, () => ({ glyph: RULE, color }))
}

/**
 * Lays the props on the rule between the corners, skipping one that would
 * touch another, and answers the columns they landed on. Bells go first, so
 * the first bell always lands and a narrow garland still has one to hover.
 */
function placeProps(cells: Cell[], props: readonly Prop[], corners: [string, string]): Map<number, Prop> {
  const columns = cells.length
  const placed = new Map<number, Prop>([
    [0, { at: 0, glyph: corners[0] }],
    [columns - 2, { at: 1, glyph: corners[1] }],
  ])
  const inner = columns - 8
  const bellsFirst = [...props.filter(prop => prop.bell !== undefined), ...props.filter(prop => prop.bell === undefined)]

  for (const prop of bellsFirst) {
    const column = 3 + Math.floor(prop.at * inner)
    const isCrowded = [-2, -1, 0, 1, 2].some(offset => placed.has(column + offset))

    if (!isCrowded && column + 1 < columns - 3) {
      placed.set(column, prop)
    }
  }

  for (const [column, prop] of placed) {
    cells[column] = { glyph: prop.glyph }
    cells[column + 1] = null
  }

  return placed
}

/** True for a cell still showing the bare rule, which lights, glow and trails may take. */
const isBareRule = (cell: Cell | undefined): boolean => cell != null && cell.glyph === RULE

/**
 * Puts a two-cell emoji at `column`, mending the halves of any emoji it cuts
 * into with plain rule.
 */
function stamp(cells: Cell[], column: number, glyph: string, color: string): void {
  if (cells[column] === null && column > 0) {
    cells[column - 1] = { glyph: RULE, color }
  }

  if (cells[column + 2] === null) {
    cells[column + 2] = { glyph: RULE, color }
  }

  cells[column] = { glyph }
  cells[column + 1] = null
}

/**
 * The pine garland over the prompt box: its bells, bows and stars, and between
 * them a string of lights chasing along, one bulb now and then blinking out.
 * Answers the cells and the columns the bells landed on.
 */
export function topRule(layout: FrameLayout, columns: number, tick: number): { cells: Cell[]; bells: BellSpot[] } {
  const cells = emptyRule(columns, PALETTE.pine)
  const placed = placeProps(cells, layout.top, [layout.corners.topLeft, layout.corners.topRight])
  const chase = Math.floor(tick / CHASE_TICKS)

  cells.forEach((cell, column) => {
    if (!isBareRule(cell) || column % LIGHT_SPACING !== 2) {
      return
    }

    const bulb = Math.floor(column / LIGHT_SPACING)
    const isOut = noise(layout.seed, column, Math.floor(tick / 3)) < 0.1
    const color = isOut ? PALETTE.unlit : PALETTE.lights[(bulb + chase) % PALETTE.lights.length]
    cells[column] = { glyph: LIGHT, color }
  })

  const bells: BellSpot[] = []

  for (const [column, prop] of placed) {
    if (prop.bell !== undefined) {
      bells.push({ column, bell: prop.bell })
    }
  }

  return { cells, bells: bells.sort((a, b) => a.column - b.column) }
}

/**
 * How far a tree's lights glow onto the snow this tick: mostly two cells,
 * flickering to one or three.
 */
function glowReach(seed: number, tree: number, tick: number): number {
  const flicker = noise(seed, tree, tick)

  return flicker < 0.25 ? 1 : flicker < 0.75 ? 2 : 3
}

/**
 * The snowbank under the prompt box: frost glinting, trees glowing gold onto
 * the snow, and every so often a reindeer sleigh gliding by, a trail of gold
 * behind it. No sleigh while the scene sleeps.
 */
export function bottomRuleCells(layout: FrameLayout, columns: number, tick: number, hasSleigh = true): Cell[] {
  const cells = emptyRule(columns, PALETTE.snow)
  const placed = placeProps(cells, layout.bottom, [layout.corners.bottomLeft, layout.corners.bottomRight])

  cells.forEach((cell, column) => {
    if (isBareRule(cell) && noise(layout.seed, column, 7) < 0.06) {
      const isGlinting = noise(layout.seed, column, Math.floor(tick / 2)) < 0.35
      cells[column] = { glyph: GLINT, color: isGlinting ? '#FFFFFF' : PALETTE.frost }
    }
  })

  let tree = 0

  for (const [column, prop] of placed) {
    if (prop.glyph !== TREE) {
      continue
    }

    const reach = glowReach(layout.seed, tree++, tick)

    for (let distance = 1; distance <= reach; distance++) {
      const color = PALETTE.gold[distance - 1]
      const glyph = distance === 1 ? HOT_RULE : RULE

      for (const target of [column - distance, column + 1 + distance]) {
        if (isBareRule(cells[target])) {
          cells[target] = { glyph, color }
        }
      }
    }
  }

  const lead = columns - 4 - (tick % (columns + SLEIGH_PAUSE_TICKS))
  const tail = lead + 6

  if (hasSleigh && lead >= 2 && tail + 3 <= columns - 3) {
    stamp(cells, lead, DEER, PALETTE.snow)
    stamp(cells, lead + 2, DEER, PALETTE.snow)
    stamp(cells, lead + 4, SLEIGH, PALETTE.snow)
    PALETTE.gold.forEach((color, index) => {
      const target = tail + index

      if (isBareRule(cells[target]) || cells[target]?.glyph === GLINT) {
        cells[target] = { glyph: HOT_RULE, color }
      }
    })
  }

  return cells
}

/** What sits at the right end of the prompt box's draft row `index`. */
export function sideGlyph(layout: FrameLayout, index: number): string {
  return layout.sides[index % layout.sides.length] ?? '🎁'
}
