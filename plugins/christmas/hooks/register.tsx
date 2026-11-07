import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, RenderElement, RenderInput, RenderNode, Timer } from 'claude-code'

import { rowsOfDraft, widthOf } from './cells'
import { BELL, bottomRuleCells, createFrameLayout, PALETTE, sideGlyph, topRule } from './frame'
import type { BellSpot, Cell } from './frame'
import { labelLeft, notesAt, RING_GLOW } from './ring'
import { isUnderSnow } from './selection'
import { FLAKES, snowAt } from './snow'
import { createEnterDeck, createTypingSounds, createVoices, isTypingStyle, SANTA_CLIPS, shuffled, SONGS, TYPING_PLAYS, TYPING_STYLES } from './sounds'
import type { TypingStyle, Voices } from './sounds'
import type { Song } from './sounds'

const isEnabled = atom({ plugin: 'christmas', key: 'isEnabled' } as const, true)
const hasSounds = atom({ plugin: 'christmas', key: 'hasSounds' } as const, false)
const hasBells = atom({ plugin: 'christmas', key: 'hasBells' } as const, true)
const draftRows = atom({ plugin: 'christmas', key: 'draftRows' } as const, 1)
const frameTick = atom({ plugin: 'christmas', key: 'frameTick' } as const, 0)
const snowTick = atom({ plugin: 'christmas', key: 'snowTick' } as const, 0)
const isAwake = atom({ plugin: 'christmas', key: 'isAwake' } as const, false)
const isSelecting = atom({ plugin: 'christmas', key: 'isSelecting' } as const, false)
const ringingBell = atom({ plugin: 'christmas', key: 'ringingBell' } as const, -1)
const ringStartTick = atom({ plugin: 'christmas', key: 'ringStartTick' } as const, 0)

const STORE_KEY = 'isEnabled'
const SOUNDS_STORE_KEY = 'hasSounds'
const BELLS_STORE_KEY = 'hasBells'
const TYPING_STORE_KEY = 'typing'
const SOUNDS_ARGUMENT = 'sounds'
const BELLS_ARGUMENT = 'bells'
const TYPING_ARGUMENT = 'typing'

/**
 * One clock drives everything: the snow moves every tick, the frame every
 * other tick, so both land in the same redraw. With no typing, no turn running
 * and no carol ringing for IDLE_MS the clock stops and the scene sleeps,
 * costing nothing. The bells still answer the pointer while it sleeps.
 */
const ANIMATION_TICK_MS = 125
const TICKS_PER_FRAME_STEP = 2
const IDLE_MS = 90_000
const IDLE_TICKS = Math.round(IDLE_MS / ANIMATION_TICK_MS)
const MIN_FRAME_COLUMNS = 30
/**
 * How long a selection stays the same before the snow falls again: by then
 * the drag has ended, copy-on-select has taken the text, and a person copying
 * by hand has had time to press the keys.
 */
const SELECTION_SETTLE_MS = 5_000
const SELECTION_SETTLE_TICKS = Math.round(SELECTION_SETTLE_MS / ANIMATION_TICK_MS)
/** Shortest time a bell shows it rings, so a terminal that plays nothing still shows the carol's name. */
const MIN_RING_MS = 2_500

/** The hint line's garland, for where the frame cannot be drawn. */
const HINT_TAIL = '   🎄 🔔 🎁 ⛄ 🦌'
const FESTIVE_MODE = '🎄 holly jolly'

/**
 * Where the prompt box sits relative to the footer's mode labels, which the
 * terminal keeps right-aligned on the first row under the box whatever else
 * the footer holds (a status line or none): the bottom rule is the row above
 * them, the draft rows above it, then the top rule. The labels end this many
 * columns short of the right edge.
 */
const MODES_RIGHT_MARGIN = 2
/**
 * The cells of the ` · ` the terminal puts before the mode labels when other
 * footer items show (debug, IDE or cloud status), which the hook is not told.
 * A blank this wide goes before the labels, so the site's left edge, which the
 * frame is placed from, is the same either way. It is a sibling of the labels,
 * not a box sized around them: the engine refuses its own drawing under a Box
 * with a size, a place, `display` or `overflow`.
 */
const SEPARATOR_CELLS = 3
const BOTTOM_RULE_ROW = -1

/**
 * Screen rows below the conversation besides the draft: the line above the
 * prompt box, its two rules, the status line, the hint line and room for a
 * notice. Erring high keeps snow off the conversation's top edge.
 */
const PROMPT_AREA_ROWS = 8

/** The conversation rows whose newest one carries the snowfall. */
type TranscriptSite = RenderInput<'AssistantMessage' | 'UserMessage' | 'CommandOutput' | 'ToolUse'>

const SPINNER_WORDS = [
  'Jingling',
  'Wrapping presents',
  'Decking the halls',
  'Baking cookies',
  'Trimming the tree',
  'Caroling',
  'Sleighing',
  'Stuffing stockings',
  'Roasting chestnuts',
  'Checking it twice',
  'Building a snowman',
  'Sipping cocoa',
  'Feeding the reindeer',
  'Hanging the mistletoe',
]

const PAST_WORDS = [
  'Jingled',
  'Wrapped',
  'Decked',
  'Baked',
  'Trimmed',
  'Caroled',
  'Sleighed',
  'Stuffed',
  'Roasted',
  'Unwrapped',
  'Twinkled',
]

/** The terminal's width as the prompt box last drew, for wrapping the draft. */
let promptColumns = 80

/**
 * The terminal's size as the mod knows it. The prompt box and its footer span
 * the terminal, but a drawing is told its column's width, which beside a
 * docked pane (a question, another mod's panel) is the transcript's alone.
 * So the widest width seen stands while the height stays the same: a new
 * height means the window itself was resized, and a slash command the person
 * types says the terminal's width exactly.
 */
let terminal = { columns: 0, rows: 0 }

/** The prompt box's width for a drawing told `viewport`: the terminal's, as far as the mod knows. */
function promptBoxColumns(viewport: { columns: number; rows: number }): number {
  if (viewport.rows !== terminal.rows || viewport.columns > terminal.columns) {
    terminal = { columns: viewport.columns, rows: viewport.rows }
  }

  return terminal.columns
}

/** The draft in the prompt box as last edited, so its rows can be counted again at a new width. */
let draftText = ''

/** This load's scatter of props on the frame: rolled once, so redraws keep it. */
const frameLayout = createFrameLayout()
/** The same garland without its bells, for the spare drawn left of the frame: only the frame's bells ring. */
const spareLayout = { ...frameLayout, top: frameLayout.top.filter(prop => prop.bell === undefined), bellCount: 0 }

/** Which carol each bell rings this load: bell `n` rings `bellSongs[n % length]`. */
const bellSongs = shuffled(SONGS)

/** This load's snowfall: every journey of every flake follows from it. */
const snowSeed = Math.floor(Math.random() * 1_000_000)

/** The order each conversation row was first drawn in; the latest is the newest row. */
const rowOrder = new Map<string, number>()

/** The running animation clock and how many ticks have passed with nothing happening. */
let animation: { timer: Timer; ticks: number; idleTicks: number } | undefined
let isTurnRunning = false

/** How many rows of each on-screen conversation row show, by its id. */
const visibleRows = new Map<string, number>()

/** The row carrying the snowfall (`''` while none on screen does), and its order. */
let snowRow = { requestId: '', order: -1 }

/** The selection's text as the last tick read it, and for how many ticks it has stayed so. */
let selection: { text: string | undefined; quietTicks: number } = { text: undefined, quietTicks: 0 }

/** When the last keystroke sound played, in the clock's milliseconds. */
let lastKeystrokeAt = Number.NEGATIVE_INFINITY

/** Deals the next Enter sound, and stops the one still playing when it does. */
const nextEnterClip = createEnterDeck()

/**
 * When Enter last counted, so a slash command and the prompt it may send on
 * make one Enter: one sound, one new typing scene.
 */
let lastEnterAt = Number.NEGATIVE_INFINITY
const ONE_ENTER_MS = 1_000

/** Picks what typing plays, in the style `/christmas typing` chose; the carols keep their place all session. */
const typing = createTypingSounds()
let typingStyle: TypingStyle = 'layered'

/** The engine's plays shared out (ENGINE_PLAYS), so fast typing never leaves Enter or a carol without one. */
const typingVoices = createVoices(TYPING_PLAYS)
const enterVoices = createVoices(1)
const carolVoices = createVoices(1)

/** The bell ringing now and what stops its carol; each ring is its own object. */
let ringing: { bell: number; stop: AbortController } | undefined

/** The bell the pointer is on, as the bells last said: a carol plays only while the pointer stays on its bell. */
let pointedBell: number | undefined

function hashOf(text: string): number {
  let hash = 0

  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

/**
 * Picks a word from the list by the engine's own sampled word, so the same
 * turn keeps the same festive word on every redraw.
 */
function festiveWordFor(word: string, words: readonly string[]): string {
  return words[hashOf(word) % words.length] ?? word
}

function songFor(bell: number): Song {
  return bellSongs[bell % bellSongs.length] ?? (SONGS[0] as Song)
}

/** Counts the draft's rows at the width the prompt box last drew at, redrawing the frame when they changed. */
async function fitDraft($: EngineInterface): Promise<void> {
  const rows = rowsOfDraft(draftText, promptColumns)

  if (rows !== (await read($, draftRows))) {
    await update($, draftRows, () => rows)
  }
}

/** Whether the frame is drawn here: the fullscreen terminal, wide enough for it. */
function isFramed(e: { surface: string; viewport?: { columns: number; isFullscreen?: boolean } }): e is {
  surface: 'terminal'
  viewport: { columns: number; isFullscreen: true }
} {
  return e.surface === 'terminal' && e.viewport?.isFullscreen === true && e.viewport.columns >= MIN_FRAME_COLUMNS
}


/**
 * Draws a row of cells as one Text, a nested Text per run of one color, the
 * right halves of emoji skipped.
 */
function drawCells(Text: ElementTable<'terminal'>['Text'], cells: readonly Cell[]): RenderElement {
  const runs: { color?: string; text: string }[] = []

  for (const cell of cells) {
    if (cell === null) {
      continue
    }

    const last = runs[runs.length - 1]

    if (last !== undefined && last.color === cell.color) {
      last.text += cell.glyph
    } else {
      runs.push({ color: cell.color, text: cell.glyph })
    }
  }

  const children: RenderNode[] = runs.map(run =>
    run.color === undefined ? run.text : <Text color={run.color}>{run.text}</Text>,
  )

  return <Text wrap="truncate">{children}</Text>
}

/**
 * Whether this conversation row carries the snowfall: the newest row on
 * screen takes it, and a row scrolled off screen lets it go to the next
 * on-screen row drawn. A row that lost it to a newer one finds out on its next
 * tick.
 */
function carriesSnow(requestId: string, isOnScreen: boolean): boolean {
  let order = rowOrder.get(requestId)

  if (order === undefined) {
    order = rowOrder.size
    rowOrder.set(requestId, order)
  }

  if (!isOnScreen) {
    if (snowRow.requestId === requestId) {
      snowRow = { requestId: '', order: snowRow.order }
    }

    return false
  }

  if (snowRow.requestId === '' || order > snowRow.order) {
    snowRow = { requestId, order }
  }

  return snowRow.requestId === requestId
}

/**
 * Rows of conversation shown above the row carrying the snowfall: every
 * on-screen row's visible rows and the blank row before it. Rows the mod does
 * not hook (the logo, command records) are left out, so this errs low.
 */
function conversationRowsOnScreen(): number {
  let rows = -1

  for (const visible of visibleRows.values()) {
    rows += visible + 1
  }

  return Math.max(0, rows)
}

/**
 * Draws a conversation row and, on the row carrying it in the fullscreen
 * terminal, the snow falling through the conversation above it.
 *
 * The snow falls through a sky a screen tall, its bottom on the last row of
 * this one on screen (its bottom, unless it runs past the screen's), and only
 * the flakes over rows of conversation on screen are drawn: the
 * terminal pins anything placed past the conversation's edges to those edges.
 *
 * The snow stops while text is being selected: a mouse copy takes the cells on
 * screen, so a flake over the selection would be copied in place of the text
 * under it.
 */
async function withSnow($: EngineInterface, e: TranscriptSite, row: RenderElement): Promise<RenderElement> {
  const { onScreen } = e.props

  if (onScreen == null) {
    visibleRows.delete(e.requestId)
  } else {
    visibleRows.set(e.requestId, onScreen.last - onScreen.first + 1)
  }

  const isSnowing = carriesSnow(e.requestId, onScreen != null)

  if (!isSnowing || onScreen == null || e.surface !== 'terminal' || e.viewport?.isFullscreen !== true) {
    return row
  }

  if (!(await read($, isEnabled)) || !(await read($, isAwake)) || (await read($, isSelecting))) {
    return row
  }

  const { Box, Text } = $.ui.resolve(e)
  const { columns, rows: screenRows } = e.viewport
  const skyRows = Math.max(1, screenRows - PROMPT_AREA_ROWS - rowsOfDraft(draftText, promptColumns))
  const shownRows = Math.min(skyRows, conversationRowsOnScreen())
  const skyTop = onScreen.last + 1 - skyRows
  const tick = await read($, snowTick)
  const flakes = snowAt(snowSeed, columns, skyRows, tick).filter(spot => spot.y >= skyRows - shownRows)

  return (
    <Box flexDirection="column">
      {row}
      {flakes.map(spot => (
        <Box position="absolute" top={skyTop + spot.y} left={spot.x}>
          <Text color={spot.color}>{spot.glyph}</Text>
        </Box>
      ))}
    </Box>
  )
}

/**
 * Stops a clock, the running one unless another is named, and when that is
 * the running one hides what moves: the snow stops, the sleigh goes home.
 */
async function sleep($: EngineInterface, clock: typeof animation = animation): Promise<void> {
  clock?.timer.cancel()

  if (clock === undefined || clock !== animation) {
    return
  }

  animation = undefined
  await update($, isAwake, () => false)
}

/** The clock running now, read afresh: an `await` may have started or stopped one. */
function runningClock(): typeof animation {
  return animation
}

/**
 * Something happened: keeps the clock running, or starts it again after a
 * sleep. A no-op while the theme is off.
 */
async function wake($: EngineInterface): Promise<void> {
  if (animation !== undefined) {
    animation.idleTicks = 0

    return
  }

  if (!(await read($, isEnabled))) {
    return
  }

  // Another wake may have started the clock while this one read the theme.
  const started = runningClock()

  if (started !== undefined) {
    started.idleTicks = 0

    return
  }

  const clock = {
    ticks: 0,
    idleTicks: 0,
    timer: $.clock.every(ANIMATION_TICK_MS, () => {
      void advance($, clock)
    }),
  }
  animation = clock
  await update($, isAwake, () => true)
}

/**
 * Stops the snow while the person is selecting text, and lets it fall again
 * once the selection has stayed the same for SELECTION_SETTLE_MS. The engine
 * reports a selection while the mouse still drags, so the snow is gone before
 * copy-on-select reads the screen on release.
 *
 * It waits for the selection to settle, not to go: after a click takes the
 * highlight down the engine keeps reporting the last selection until the next
 * prompt or command, and it reads the same as one still highlighted. A flake
 * falling through a highlight still up changes its text without making it a
 * new selection. A surface that cannot say counts as no selection.
 */
async function checkSelection($: EngineInterface): Promise<void> {
  const text = (await $.ui.selection().catch(() => undefined))?.text
  const isStopped = await read($, isSelecting)
  const isSnowCrossing =
    !isStopped && text !== undefined && selection.text !== undefined && isUnderSnow(selection.text, text, FLAKES)

  if (text === selection.text || isSnowCrossing) {
    selection.quietTicks++
  } else {
    selection = { text, quietTicks: 0 }
  }

  const isNowSelecting = text !== undefined && selection.quietTicks < SELECTION_SETTLE_TICKS

  if (isNowSelecting !== isStopped) {
    await update($, isSelecting, () => isNowSelecting)
  }
}

async function advance($: EngineInterface, clock: NonNullable<typeof animation>): Promise<void> {
  if (clock !== animation) {
    clock.timer.cancel()

    return
  }

  clock.idleTicks = isTurnRunning || ringing !== undefined ? 0 : clock.idleTicks + 1

  if (clock.idleTicks > IDLE_TICKS) {
    await sleep($, clock)

    return
  }

  await checkSelection($)
  clock.ticks++
  await update($, snowTick, tick => tick + 1)

  if (clock.ticks % TICKS_PER_FRAME_STEP === 0) {
    await update($, frameTick, tick => tick + 1)
  }
}

async function isSounding($: EngineInterface): Promise<boolean> {
  return (await read($, hasSounds)) && (await read($, isEnabled))
}

/**
 * Plays one of the mod's clips on `voices`, within their share of the
 * engine's plays, until it ends or `stop` stops it; a terminal with no player
 * plays nothing.
 */
function play($: EngineInterface, voices: Voices, asset: string, stop?: AbortController): Promise<void> {
  return voices.play(signal => $.audio.play({ asset }, { signal }), stop)
}

/** A sleigh-bell jingle for an edit the person typed. */
async function soundKeystroke($: EngineInterface, edit: { start: number; end: number; inputText: string }): Promise<void> {
  if (!(await isSounding($))) {
    return
  }

  const now = await $.clock.now()
  const clip = typing.clipFor(typingStyle, edit, now - lastKeystrokeAt)

  if (clip !== undefined) {
    lastKeystrokeAt = now
    void play($, typingVoices, clip)
  }
}

/**
 * The person pressed Enter on a prompt or a slash command: a new typing scene
 * and, with sounds on, an Enter sound. Within ONE_ENTER_MS of the last it
 * counts once.
 */
async function enterPressed($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  if (now - lastEnterAt < ONE_ENTER_MS) {
    return
  }

  lastEnterAt = now
  typing.newPrompt()

  if (await isSounding($)) {
    soundEnter($)
  }
}

/**
 * The next of Santa's laughs, sleigh bells or chimes in the deck (or the clip
 * given), cutting off the last one; none over a carol.
 */
function soundEnter($: EngineInterface, clip?: string): void {
  if (ringing !== undefined) {
    return
  }

  void play($, enterVoices, clip ?? nextEnterClip())
}

/** Ends a ring, unless another bell has taken over since it began. */
async function endRing($: EngineInterface, ring: NonNullable<typeof ringing>): Promise<void> {
  if (ringing !== ring) {
    return
  }

  ringing = undefined
  await showRinging($)
}

/** Draws the bell that rings now; every change of `ringing` ends with this, so the last write is always the truth. */
async function showRinging($: EngineInterface): Promise<void> {
  await update($, ringingBell, () => ringing?.bell ?? -1)
}

/**
 * Rings bell `bell`: its carol plays, cutting off another bell's, while the
 * bell flashes and notes rise from it under the carol's name, until the
 * carol ends or the pointer leaves the bell. The bell already ringing does not
 * start over. With bells muted it flashes and names its carol without a sound.
 */
async function ring($: EngineInterface, bell: number): Promise<void> {
  if (!(await read($, isEnabled)) || ringing?.bell === bell || pointedBell !== bell) {
    return
  }

  ringing?.stop.abort()
  enterVoices.stopAll()
  const current = { bell, stop: new AbortController() }
  ringing = current
  const startTick = await read($, frameTick)
  await update($, ringStartTick, () => startTick)
  await showRinging($)
  void wake($)

  const startedAt = await $.clock.now()

  if (await read($, hasBells)) {
    await play($, carolVoices, songFor(bell).asset, current.stop)
  }

  const shownMs = (await $.clock.now()) - startedAt

  if (shownMs < MIN_RING_MS && ringing === current) {
    $.clock.after(MIN_RING_MS - shownMs, () => {
      void endRing($, current)
    })

    return
  }

  await endRing($, current)
}

/** Stops the carol ringing now, if one is (and, given a bell, only that bell's). */
async function hush($: EngineInterface, bell?: number): Promise<void> {
  const current = ringing

  if (current !== undefined && (bell === undefined || current.bell === bell)) {
    current.stop.abort()
    await endRing($, current)
  }
}

/** The bell a `Client` key names (`bell-3`), or `undefined` for any other key. */
function bellOf(element: string): number | undefined {
  const match = /^bell-(\d+)$/.exec(element)

  return match === null ? undefined : Number(match[1])
}

/**
 * The garland's bells, each in its own region so the pointer reaching it
 * rings its carol and leaving it stops the carol; the ringing one flashes.
 * With a carol ringing and nothing being selected, notes rise from its bell
 * and its name shows beside it.
 */
async function drawBells(
  $: EngineInterface,
  { Box, Text, Client }: ElementTable<'terminal'>,
  bells: readonly BellSpot[],
  place: { topRuleRow: number; siteLeft: number; columns: number; tick: number },
): Promise<RenderElement[]> {
  const bellRinging = await read($, ringingBell)
  const glow = RING_GLOW[place.tick % RING_GLOW.length] ?? null
  const drawn: RenderElement[] = bells.map(({ column, bell }) => (
    <Box position="absolute" top={place.topRuleRow} left={column - place.siteLeft}>
      <Client
        key={`bell-${bell}`}
        module="./bell.tsx"
        width={2}
        height={1}
        props={{ glyph: BELL, glow: bell === bellRinging ? glow : null }}
      />
    </Box>
  ))
  const ringingSpot = bells.find(spot => spot.bell === bellRinging)

  if (ringingSpot === undefined || (await read($, isSelecting))) {
    return drawn
  }

  const age = Math.max(0, place.tick - (await read($, ringStartTick)))
  const label = `♪ ${songFor(ringingSpot.bell).title} ♪${(await read($, hasBells)) ? '' : ' (muted)'}`

  for (const note of notesAt(ringingSpot.column, age, place.columns)) {
    drawn.push(
      <Box position="absolute" top={place.topRuleRow - note.rise} left={note.x - place.siteLeft}>
        <Text>{note.glyph}</Text>
      </Box>,
    )
  }

  drawn.push(
    <Box position="absolute" top={place.topRuleRow - 1} left={labelLeft(ringingSpot.column, label, place.columns) - place.siteLeft}>
      <Text color={PALETTE.gold[1]} bold>
        {label}
      </Text>
    </Box>,
  )

  return drawn
}

async function toggleSounds($: EngineInterface): Promise<{ text: string }> {
  const isNowOn = !(await read($, hasSounds))
  await update($, hasSounds, () => isNowOn)
  await $.store.set(SOUNDS_STORE_KEY, isNowOn)

  if (!isNowOn) {
    enterVoices.stopAll()
    typingVoices.stopAll()

    return { text: 'Sounds off. Run /christmas sounds to bring them back.' }
  }

  const isThemeComingBack = !(await read($, isEnabled))

  if (isThemeComingBack) {
    await setTheme($, true)
  }

  soundEnter($, SANTA_CLIPS[0])

  return {
    text: `🎅 Sounds on${isThemeComingBack ? ', and the Christmas theme with them' : ''}. Typing crackles like a fire and plays a carol on a music box (/christmas typing for other styles), and Enter gets a "Ho! ho! ho!" from Santa, sleigh bells or church bells. Sounds play on macOS.`,
  }
}

/** Lists the typing styles with the one in use, or picks one and remembers it. */
async function chooseTyping($: EngineInterface, name: string): Promise<{ text: string }> {
  const styles = (Object.entries(TYPING_STYLES) as [TypingStyle, string][])
    .map(([style, about]) => `${style === typingStyle ? '●' : '○'} ${style}: ${about}`)
    .join('\n')

  if (name === '') {
    return { text: `Typing sounds: ${typingStyle}.\n${styles}\nPick one with /christmas typing <style>.` }
  }

  if (!isTypingStyle(name)) {
    return { text: `No typing style "${name}". Pick one with /christmas typing <style>:\n${styles}` }
  }

  typingStyle = name
  typing.newPrompt()
  await $.store.set(TYPING_STORE_KEY, name)
  const hint = (await isSounding($)) ? '' : ' Run /christmas sounds to hear it.'

  return { text: `⌨️ Typing sounds: ${name}, ${TYPING_STYLES[name]}.${hint}` }
}

async function toggleBells($: EngineInterface): Promise<{ text: string }> {
  const isNowOn = !(await read($, hasBells))
  await update($, hasBells, () => isNowOn)
  await $.store.set(BELLS_STORE_KEY, isNowOn)

  if (!isNowOn) {
    await hush($)

    return { text: 'Bells muted: hovering a bell shows its carol without playing it. Run /christmas bells to unmute.' }
  }

  return { text: '🔔 Bells unmuted. Hover a bell on the garland above the prompt to hear its carol; move off it to stop.' }
}

/** Turns the theme on or off and remembers it; off, the snow stops and any sound stops. */
async function setTheme($: EngineInterface, isOn: boolean): Promise<void> {
  await update($, isEnabled, () => isOn)
  await $.store.set(STORE_KEY, isOn)

  if (isOn) {
    await wake($)

    return
  }

  enterVoices.stopAll()
  typingVoices.stopAll()
  await hush($)
  await sleep($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    draftText = ''
    await $.command.register({
      name: 'christmas',
      description:
        'Toggle the Christmas theme (garland, bells and snow around the prompt); "bells" mutes the carols, "sounds" toggles typing and Enter sounds, "typing" picks how typing sounds',
      argumentHint: '[bells|sounds|typing [layered|shuffle|mix]]',
    })

    if ((await $.store.get(STORE_KEY)) === false) {
      await update($, isEnabled, () => false)
    }

    if ((await $.store.get(SOUNDS_STORE_KEY)) === true) {
      await update($, hasSounds, () => true)
    }

    if ((await $.store.get(BELLS_STORE_KEY)) === false) {
      await update($, hasBells, () => false)
    }

    const storedTyping = await $.store.get(TYPING_STORE_KEY)
    typingStyle = typeof storedTyping === 'string' && isTypingStyle(storedTyping) ? storedTyping : 'layered'

    await update($, ringingBell, () => -1)
    await wake($)

    return next(e)
  })

  // A slash command or skill the person typed runs as a command, not a prompt:
  // its Enter sounds here, before `/christmas`'s own hook answers it. `/christmas sounds` answers with its own sound.
  on('command.run', async ($, e, next) => {
    const isSoundsToggle = e.command === 'christmas' && e.args.trim().toLowerCase() === SOUNDS_ARGUMENT

    if (e.presentation.isFullscreen) {
      terminal = { ...terminal, columns: e.presentation.columns }
    }

    if (e.origin.kind === 'composer' && !isSoundsToggle) {
      void wake($)
      await enterPressed($)
    }

    return next(e)
  })

  on('command.run', { command: 'christmas' }, async ($, e) => {
    const option = e.args.trim().toLowerCase()

    if (option === SOUNDS_ARGUMENT) {
      return toggleSounds($)
    }

    if (option === BELLS_ARGUMENT) {
      return toggleBells($)
    }

    if (option === TYPING_ARGUMENT || option.startsWith(`${TYPING_ARGUMENT} `)) {
      return chooseTyping($, option.slice(TYPING_ARGUMENT.length).trim())
    }

    if (option !== '') {
      return {
        text: `No option "${e.args.trim()}": run /christmas to turn the theme on or off, /christmas bells to mute the carols, /christmas sounds for typing and Enter sounds, or /christmas typing to pick how typing sounds.`,
      }
    }

    const isNowEnabled = !(await read($, isEnabled))
    await setTheme($, isNowEnabled)

    if (!isNowEnabled) {
      return { text: 'Christmas theme off. Run /christmas to bring the snow back.' }
    }

    return {
      text: '🎄 Christmas theme on. Hover a bell on the garland above the prompt to hear a carol.',
    }
  })

  on('ui.message', { element: /^bell-\d+$/ }, async ($, e, next) => {
    const bell = bellOf(e.element)
    const data = e.data

    if (bell === undefined || typeof data !== 'object' || data === null) {
      return next(e)
    }

    if ('ring' in data && data.ring === true) {
      pointedBell = bell
      void ring($, bell)
    } else if ('leave' in data && data.leave === true) {
      if (pointedBell === bell) {
        pointedBell = undefined
      }

      void hush($, bell)
    } else if ('hush' in data && data.hush === true) {
      void hush($)
    }

    return {}
  })

  on('prompt.edit', async ($, e, next) => {
    void wake($)
    void soundKeystroke($, e)
    const box = await next(e)
    draftText = box.text
    await fitDraft($)

    return box
  })

  on('prompt.fill', async ($, e, next) => {
    void wake($)
    const filled = await next(e)
    draftText = (await $.prompt.read()).text
    await fitDraft($)

    return filled
  })

  on('prompt.change', async ($, e, next) => {
    draftText = e.text
    await fitDraft($)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    void wake($)
    draftText = ''
    await fitDraft($)

    if (e.origin.kind === 'composer') {
      await enterPressed($)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    void wake($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isTurnRunning = false
    void wake($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    void wake($)

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await read($, isEnabled)) || isFramed(e)) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, tail: HINT_TAIL } })
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!(await read($, isEnabled))) {
      return next(e)
    }

    const modes = [...e.props.modes, FESTIVE_MODE]
    const labels = await next({ ...e, props: { ...e.props, modes } })

    if (!isFramed(e)) {
      return labels
    }

    const columns = promptBoxColumns(e.viewport)

    promptColumns = columns
    // Read for the redraw a new row count brings, but counted here at this
    // width: a resize wraps the draft again with no edit, and a drawing may
    // not write state.
    await read($, draftRows)
    const rows = rowsOfDraft(draftText, columns)
    const tick = await read($, frameTick)
    const hasSleigh = await read($, isAwake)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const siteWidth = widthOf(modes.join(' & ')) + SEPARATOR_CELLS
    const siteLeft = columns - MODES_RIGHT_MARGIN - siteWidth
    const topRuleRow = BOTTOM_RULE_ROW - rows - 1
    const garland = topRule(frameLayout, columns, tick)
    const bells = await drawBells($, elements, garland.bells, { topRuleRow, siteLeft, columns, tick })

    return (
      <Box flexDirection="row">
        <Box width={SEPARATOR_CELLS} />
        {labels}
        <Box position="absolute" top={topRuleRow} left={-siteLeft} width={columns}>
          {drawCells(Text, garland.cells)}
        </Box>
        {/* Spare garland to the left, past the screen's edge while the width above is the terminal's; it fills the row while a pane docked before the mod could see the whole terminal. */}
        <Box position="absolute" top={topRuleRow} left={-siteLeft - columns} width={columns}>
          {drawCells(Text, topRule(spareLayout, columns, tick).cells)}
        </Box>
        <Box position="absolute" top={BOTTOM_RULE_ROW} left={-siteLeft - columns} width={columns}>
          {drawCells(Text, bottomRuleCells(spareLayout, columns, tick, false))}
        </Box>
        {Array.from({ length: rows }, (_, index) => (
          <Box position="absolute" top={BOTTOM_RULE_ROW - rows + index} left={columns - 2 - siteLeft}>
            <Text>{sideGlyph(frameLayout, index)}</Text>
          </Box>
        ))}
        <Box position="absolute" top={BOTTOM_RULE_ROW} left={-siteLeft} width={columns}>
          {drawCells(Text, bottomRuleCells(frameLayout, columns, tick, hasSleigh))}
        </Box>
        {bells}
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.message !== null || !(await read($, isEnabled))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, word: festiveWordFor(e.props.word, SPINNER_WORDS) } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await read($, isEnabled))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, word: festiveWordFor(e.props.word, PAST_WORDS) } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => withSnow($, e, await next(e)))
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => withSnow($, e, await next(e)))
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => withSnow($, e, await next(e)))
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => withSnow($, e, await next(e)))
}
