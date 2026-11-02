import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { rowsOfDraft, widthOf } from '../hooks/cells'
import { BELL, bottomRuleCells, createFrameLayout, topRule } from '../hooks/frame'
import { isUnderSnow } from '../hooks/selection'
import { FLAKES, flakeAt, snowAt, snowfallSize } from '../hooks/snow'
import {
  createDeck,
  createEnterDeck,
  ENTER_CLIPS,
  CRACKLE_CLIPS,
  createTypingSounds,
  KEYSTROKE_GAP_MS,
  noteClip,
  SANTA_CLIPS,
  SNOW_CLIPS,
  TYPING_CAROLS,
  SONGS,
} from '../hooks/sounds'

const FULLSCREEN = { columns: 100, rows: 30, isFullscreen: true }

/** The footer's mode labels, which the frame hangs from, in the fullscreen terminal. */
const MODE_LABELS = {
  plugin: 'christmas',
  surface: 'terminal',
  component: 'SessionMode',
  props: { modes: [] },
  viewport: FULLSCREEN,
} as const

const CHRISTMAS_COMMAND = {
  command: 'christmas',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 100 },
} as const

const TERMINAL_SESSION = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

/** The shortest time a bell shows it rings, as the mod keeps it. */
const MIN_RING_MS = 2_500

const SONG_ASSETS = SONGS.map(song => song.asset)

/** Draws the mode labels as the engine would: joined, on one row. */
function drawModeLabels(on: On): void {
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: e.props.modes.join(' & ') })
  })
}

/** A repeatable random source, so a layout test rolls the same scatter every run. */
function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296

    return state / 4294967296
  }
}

/** Answers what a session start needs beneath the plugin, on a mocked clock it hands back. */
function sessionBeneath(on: On, stored: Record<string, unknown> = {}) {
  const clock = mock.clock(on)
  mock.store(on, stored)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  drawModeLabels(on)

  return { clock }
}

/** Plays clips as the engine beneath would, keeping the list of what played; each clip ends at once. */
function recordPlays(on: On): string[] {
  const played: string[] = []
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? '')

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))

  return played
}

/** Plays each clip until what started it stops it, keeping the lists of what played and what was stopped. */
function holdPlays(on: On): { played: string[]; stopped: string[] } {
  const played: string[] = []
  const stopped: string[] = []
  on('audio.play', async ($, e, next) => {
    const asset = e.clip.asset ?? ''
    played.push(asset)
    await new Promise<void>(resolve => {
      next.signal.addEventListener('abort', () => {
        stopped.push(asset)
        resolve()
      })
    })

    return { value: undefined }
  })

  return { played, stopped }
}

test('the garland always hangs bells, each drawn where the layout put it', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const layout = createFrameLayout(seededRandom(seed))
    expect(layout.bellCount).toBeGreaterThanOrEqual(3)

    for (const columns of [60, 100, 160]) {
      const { cells, bells } = topRule(layout, columns, seed)
      expect(cells).toHaveLength(columns)
      expect(bells.length).toBeGreaterThanOrEqual(1)

      for (const { column } of bells) {
        expect(cells[column]?.glyph).toBe(BELL)
        expect(cells[column + 1]).toBeNull()
      }
    }
  }
})

test('every garland keeps a bell to hover, however narrow the terminal', async () => {
  for (let seed = 1; seed <= 3000; seed++) {
    const layout = createFrameLayout(seededRandom(seed))

    for (const columns of [30, 45, 60]) {
      expect(topRule(layout, columns, 0).bells.length).toBeGreaterThanOrEqual(1)
    }
  }
})

test('the draft counts wide characters as two cells when it wraps', async () => {
  expect(widthOf('🎄 holly jolly')).toBe(14)
  expect(rowsOfDraft('a'.repeat(50), 100)).toBe(1)
  expect(rowsOfDraft('字'.repeat(50), 100)).toBe(2)
  expect(rowsOfDraft('one\ntwo', 100)).toBe(2)
  expect(rowsOfDraft('a'.repeat(90), 100)).toBe(1)
  expect(rowsOfDraft('a'.repeat(90), 50)).toBe(2)
  expect(widthOf('⛄')).toBe(2)
  expect(widthOf('🎅🏽')).toBe(2)
  expect(widthOf('👨‍👩‍👧')).toBe(2)
  expect(widthOf('❤️')).toBe(2)
  expect(widthOf('🇻🇳🇺🇸')).toBe(4)
  expect(widthOf('é')).toBe(1)
  expect(widthOf('♪ ❄')).toBe(3)
  expect(rowsOfDraft('⛄'.repeat(49), 100)).toBe(2)
  expect(rowsOfDraft('🎅🏽'.repeat(25), 100)).toBe(1)
})

test('the draft wraps by word, as the composer does', async () => {
  const word = 'x'.repeat(50)
  expect(rowsOfDraft([word, word, word].join(' '), 100)).toBe(3)
  expect(rowsOfDraft('a b', 100)).toBe(1)
  expect(rowsOfDraft('y'.repeat(200), 100)).toBe(3)
  expect(rowsOfDraft(`ab ${'y'.repeat(96)}`, 100)).toBe(2)
  expect(rowsOfDraft(`${'z'.repeat(96)} `, 100)).toBe(2)
  expect(rowsOfDraft('', 100)).toBe(1)
})

test('the frame hangs from the footer labels the engine draws, a blank before them for the separator', async ($, on) => {
  mock.clock(on)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.render', { component: 'SessionMode' }, () => ({ type: 'engine', ref: 0 }))
  await $.session.start(TERMINAL_SESSION)

  const labels = await $.ui.mount(MODE_LABELS)
  const boxes = await labels.findAll({ type: 'Box' })
  const label = widthOf('🎄 holly jolly')
  expect(boxes[0]?.props.flexDirection).toBe('row')
  expect(boxes[1]?.props.width).toBe(3)

  const rules = boxes.filter(box => box.props.width === FULLSCREEN.columns)
  expect(rules.map(rule => rule.props.left)).toEqual([-(FULLSCREEN.columns - 2 - label - 3), -(FULLSCREEN.columns - 2 - label - 3)])
  expect(await labels.findAll({ type: 'Client' })).not.toHaveLength(0)
  await labels.unmount()
})

test('the lights chase along the garland', async () => {
  const layout = createFrameLayout(seededRandom(7))
  const colorsAt = (tick: number) =>
    topRule(layout, 100, tick)
      .cells.map(cell => (cell?.glyph === '●' ? cell.color : undefined))
      .join(',')

  expect(colorsAt(0)).toMatch(/#/)
  expect(colorsAt(0)).not.toBe(colorsAt(2))
})

test('a sleigh glides along the snow now and then, and never while the scene sleeps', async () => {
  const layout = createFrameLayout(seededRandom(3))
  const hasSleigh = (tick: number, isAwake = true) =>
    bottomRuleCells(layout, 100, tick, isAwake).some(cell => cell?.glyph === '🛷')
  const ticks = Array.from({ length: 220 }, (_, tick) => tick)

  expect(ticks.some(tick => hasSleigh(tick))).toBe(true)
  expect(ticks.some(tick => !hasSleigh(tick))).toBe(true)
  expect(ticks.some(tick => hasSleigh(tick, false))).toBe(false)

  for (const tick of ticks) {
    expect(bottomRuleCells(layout, 100, tick)).toHaveLength(100)
  }
})

test('snow falls down through the region and stays inside it', async () => {
  const columns = 80
  const rows = 20
  const size = snowfallSize(columns, rows)
  expect(size).toBeGreaterThanOrEqual(8)

  for (let tick = 0; tick < 400; tick += 7) {
    for (const spot of snowAt(42, columns, rows, tick)) {
      expect(spot.x).toBeGreaterThanOrEqual(0)
      expect(spot.x).toBeLessThan(columns)
      expect(spot.y).toBeGreaterThanOrEqual(0)
      expect(spot.y).toBeLessThan(rows)
      expect(FLAKES).toContain(spot.glyph)
    }
  }

  const fallen = Array.from({ length: 60 }, (_, tick) => flakeAt(42, 0, columns, rows, tick)).filter(spot => spot !== undefined)
  const firstY = fallen[0]?.y ?? 0
  const lastY = fallen[fallen.length - 1]?.y ?? 0
  expect(lastY).toBeGreaterThanOrEqual(firstY)
})

test('a selection with snow over it reads as the same selection', async () => {
  expect(isUnderSnow('hello world', 'hel❄o world', FLAKES)).toBe(true)
  expect(isUnderSnow('hello world', 'hello world❅', FLAKES)).toBe(true)
  expect(isUnderSnow('hello world', 'hello there', FLAKES)).toBe(false)
  expect(isUnderSnow('hello world', 'hello world', FLAKES)).toBe(false)
  expect(isUnderSnow('hello world', 'goodbye ❆', FLAKES)).toBe(false)
})

const LETTER = { start: 0, end: 0, inputText: 'a' } as const
const SPACE = { start: 0, end: 0, inputText: ' ' } as const
const BACKSPACE = { start: 2, end: 3, inputText: '' } as const

/** What a typing clip is: a note on an instrument, a crackle or a step. */
const kindOf = (clip: string | undefined): string =>
  clip === undefined ? 'silence' : clip.includes('/notes/box/') ? 'box' : clip.includes('/notes/celesta/') ? 'celesta' : clip.includes('/crackle-') ? 'fire' : 'snow'

test('layered typing crackles at each key and plays the carols a note at each space', async () => {
  const typing = createTypingSounds(seededRandom(3))
  expect(typing.clipFor('layered', LETTER, KEYSTROKE_GAP_MS - 1)).toBeUndefined()
  expect(typing.clipFor('layered', { start: 3, end: 3, inputText: '' }, 1_000)).toBeUndefined()
  expect(CRACKLE_CLIPS).toContain(typing.clipFor('layered', LETTER, 1_000))
  expect(CRACKLE_CLIPS).toContain(typing.clipFor('layered', BACKSPACE, 1_000))

  const [first, second] = TYPING_CAROLS
  const jingleBells = (first?.notes ?? []).map(() => typing.clipFor('layered', SPACE, 0))
  expect(jingleBells).toEqual((first?.notes ?? []).map(note => noteClip('box', note)))
  expect(typing.clipFor('layered', { ...SPACE, inputText: '\n' }, 0)).toBe(noteClip('box', second?.notes[0] ?? ''))

  const heard = new Set(Array.from({ length: 300 }, () => typing.clipFor('layered', LETTER, 1_000)))
  expect(heard.size).toBeGreaterThan(20)
})

test('shuffled typing gives each prompt one sound, a different one each prompt', async () => {
  const typing = createTypingSounds(seededRandom(5))
  const scenes: string[] = []

  for (let prompt = 0; prompt < 12; prompt++) {
    const kinds = new Set(Array.from({ length: 10 }, () => kindOf(typing.clipFor('shuffle', LETTER, 1_000))))
    expect(kinds.size).toBe(1)
    const [scene = ''] = kinds
    scenes.push(scene)

    if (scene === 'box' || scene === 'celesta') {
      expect(typing.clipFor('shuffle', BACKSPACE, 1_000)).toBeUndefined()
    }

    typing.newPrompt()
  }

  expect(new Set(scenes)).toEqual(new Set(['box', 'celesta', 'fire', 'snow']))
  expect(scenes.some((scene, index) => scene === scenes[index - 1])).toBe(false)
})

test('mixed typing plays carol notes, crackles and steps, and a deletion never a note', async () => {
  const typing = createTypingSounds(seededRandom(7))
  const kinds = Array.from({ length: 400 }, () => kindOf(typing.clipFor('mix', LETTER, 1_000)))
  const notes = kinds.filter(kind => kind === 'box').length
  expect(new Set(kinds)).toEqual(new Set(['box', 'fire', 'snow']))
  expect(notes).toBeGreaterThan(150)
  expect(notes).toBeLessThan(250)

  const deletions = new Set(Array.from({ length: 100 }, () => kindOf(typing.clipFor('mix', BACKSPACE, 1_000))))
  expect(deletions).toEqual(new Set(['fire', 'snow']))
  expect(SNOW_CLIPS).toHaveLength(28)
})

test('/christmas typing lists the styles, picks one, and a new session keeps it', async ($, on) => {
  sessionBeneath(on, { typing: 'mix' })
  await $.session.start(TERMINAL_SESSION)

  const listed = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'typing' })
  expect(listed.text).toMatch(/^Typing sounds: mix\./)
  expect(listed.text).toMatch(/● mix: /)
  expect(listed.text).toMatch(/○ layered: /)

  const picked = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'typing Shuffle' })
  expect(picked.text).toMatch(/Typing sounds: shuffle, each prompt gets one sound/)
  expect(picked.text).toMatch(/\/christmas sounds to hear it/)

  const wrong = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'typing loud' })
  expect(wrong.text).toMatch(/^No typing style "loud"/)
  expect((await $.command.run({ ...CHRISTMAS_COMMAND, args: 'typing' })).text).toMatch(/^Typing sounds: shuffle\./)
})

test('a new session without a saved style types layered', async ($, on) => {
  sessionBeneath(on, { typing: 'nonsense' })
  await $.session.start(TERMINAL_SESSION)

  expect((await $.command.run({ ...CHRISTMAS_COMMAND, args: 'typing' })).text).toMatch(/^Typing sounds: layered\./)
})

test('hovering a bell rings a carol; another bell takes over; a click hushes it', async ($, on) => {
  sessionBeneath(on)
  const played = recordPlays(on)
  await $.session.start(TERMINAL_SESSION)

  const labels = await $.ui.mount(MODE_LABELS)
  const bells = await labels.findAll({ type: 'Client' })
  expect(bells.length).toBeGreaterThanOrEqual(2)

  const first = bells[0]?.key ?? ''
  const second = bells[1]?.key ?? ''
  expect(first).toMatch(/^bell-\d+$/)

  await labels.pointer({ type: 'enter', x: 0, y: 0, in: first })
  expect(played).toHaveLength(1)
  expect(SONG_ASSETS).toContain(played[0])
  const title = SONGS.find(song => song.asset === played[0])?.title ?? ''
  expect((await labels.find({ type: 'Text', text: /^♪ / }))?.text).toBe(`♪ ${title} ♪`)

  // Resting or moving on the same bell does not start it over.
  await labels.pointer({ type: 'move', x: 1, y: 0, in: first })
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: first })
  expect(played).toHaveLength(1)

  await labels.pointer({ type: 'enter', x: 0, y: 0, in: second })
  expect(played).toHaveLength(2)
  expect(SONG_ASSETS).toContain(played[1])
  expect(played[1]).not.toBe(played[0])

  // The ringing bell glows; the others do not.
  const glowing = (await labels.findAll({ type: 'Client' })).filter(bell => (bell.props.props as { glow: unknown }).glow !== null)
  expect(glowing.map(bell => bell.key)).toEqual([second])

  await labels.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: second })
  expect(await labels.find({ type: 'Text', text: /^♪ / })).toBeUndefined()
  await labels.unmount()
})

test('a carol plays only while the pointer stays on its bell', async ($, on) => {
  sessionBeneath(on)
  const { played, stopped } = holdPlays(on)
  await $.session.start(TERMINAL_SESSION)

  const labels = await $.ui.mount(MODE_LABELS)
  const bells = await labels.findAll({ type: 'Client' })
  const first = bells[0]?.key ?? ''
  const second = bells[1]?.key ?? ''
  const glowing = async () =>
    (await labels.findAll({ type: 'Client' })).filter(bell => (bell.props.props as { glow: unknown }).glow !== null).map(bell => bell.key)

  await labels.pointer({ type: 'enter', x: 0, y: 0, in: first })
  await labels.pointer({ type: 'leave', x: 2, y: 0, in: first })
  expect(stopped).toEqual([played[0]])
  expect(await labels.find({ type: 'Text', text: /^♪ / })).toBeUndefined()
  expect(await glowing()).toEqual([])

  // Coming back rings the carol again from the start.
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: first })
  expect(played).toEqual([played[0], played[0]])

  // Onto the next bell before the first says the pointer left: the late leave stops nothing.
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: second })
  await labels.pointer({ type: 'leave', x: 2, y: 0, in: first })
  expect(stopped).toEqual([played[0], played[0]])
  expect(await glowing()).toEqual([second])

  await labels.pointer({ type: 'leave', x: 2, y: 0, in: second })
  expect(stopped).toEqual([played[0], played[0], played[2]])
  expect(await glowing()).toEqual([])
  await labels.unmount()
})

test('a carol that ends lets its bell rest, and the bell rings again', async ($, on) => {
  const { clock } = sessionBeneath(on)
  const played = recordPlays(on)
  await $.session.start(TERMINAL_SESSION)

  const labels = await $.ui.mount(MODE_LABELS)
  const bell = (await labels.find({ type: 'Client' }))?.key ?? ''

  await labels.pointer({ type: 'enter', x: 0, y: 0, in: bell })
  await clock.advance(MIN_RING_MS + 100)
  expect(await labels.find({ type: 'Text', text: /^♪ / })).toBeUndefined()

  await labels.pointer({ type: 'leave', x: 0, y: 0, in: bell })
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: bell })
  expect(played).toHaveLength(2)
  expect(played[1]).toBe(played[0])
  await labels.unmount()
})

test('/christmas bells mutes the carols but the bells still name them', async ($, on) => {
  sessionBeneath(on)
  const played = recordPlays(on)
  await $.session.start(TERMINAL_SESSION)

  const muted = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'bells' })
  expect(muted.text).toMatch(/muted/)

  const labels = await $.ui.mount(MODE_LABELS)
  const bell = (await labels.find({ type: 'Client' }))?.key ?? ''
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: bell })
  expect(played).toHaveLength(0)
  expect((await labels.find({ type: 'Text', text: /^♪ / }))?.text).toMatch(/\(muted\)$/)
  await labels.unmount()

  const unmuted = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'bells' })
  expect(unmuted.text).toMatch(/unmuted/)
})

test('/christmas takes the frame and its bells off the prompt box and puts them back', async ($, on) => {
  sessionBeneath(on)
  await $.session.start(TERMINAL_SESSION)
  const bellCount = async () => {
    const labels = await $.ui.mount(MODE_LABELS)
    const count = (await labels.findAll({ type: 'Client' })).length
    await labels.unmount()

    return count
  }

  expect(await bellCount()).toBeGreaterThan(0)

  const off = await $.command.run(CHRISTMAS_COMMAND)
  expect(off.text).toMatch(/off/)
  expect(await bellCount()).toBe(0)

  const back = await $.command.run(CHRISTMAS_COMMAND)
  expect(back.text).toMatch(/on/)
  expect(await bellCount()).toBeGreaterThan(0)
})

test('no frame or bells outside the fullscreen terminal, only a garland on the hint line', async ($, on) => {
  sessionBeneath(on)
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: `${e.props.hint}${e.props.tail ?? ''}` })
  })
  await $.session.start(TERMINAL_SESSION)

  const labels = await $.ui.mount({ ...MODE_LABELS, viewport: { ...FULLSCREEN, isFullscreen: false } })
  expect(await labels.findAll({ type: 'Client' })).toHaveLength(0)
  expect(await labels.find({ type: 'Text', text: /🎄 holly jolly/ })).toBeDefined()

  const hint = await $.ui.mount({
    plugin: 'christmas',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
  expect(await hint.find({ type: 'Text', text: /🎄 🔔 🎁/ })).toBeDefined()
})

test('the spinner turns festive', async ($, on) => {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: `spinner: ${e.props.word}` })
  })

  const spinner = await $.ui.mount({
    plugin: 'christmas',
    surface: 'terminal',
    component: 'Spinner',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
  })
  const text = (await spinner.find({ type: 'Text', text: /^spinner: / }))?.text ?? ''
  expect(text).not.toMatch(/Sauteing/)
  expect(text).toMatch(/Jingling|Wrapping|Decking|Baking|Trimming|Caroling|Sleighing|Stuffing|Roasting|Checking|Building|Sipping|Feeding|Hanging/)
})

test('/christmas sounds greets with a ho ho ho', async ($, on) => {
  sessionBeneath(on)
  const played = recordPlays(on)
  await $.session.start(TERMINAL_SESSION)

  const on1 = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'sounds' })
  expect(on1.text).toMatch(/Ho! ho! ho!/)
  expect(played).toEqual([SANTA_CLIPS[0]])

  const off = await $.command.run({ ...CHRISTMAS_COMMAND, args: 'sounds' })
  expect(off.text).toMatch(/off/)
})

test('Enter laughs like Santa most, every laugh in turn, and every other sound comes round', async () => {
  const deal = createEnterDeck(seededRandom(9))
  const played = Array.from({ length: 7 * SANTA_CLIPS.length }, () => deal())
  const santa = new Set<string>(SANTA_CLIPS)
  const laughs = played.filter(clip => santa.has(clip))

  expect(laughs).toHaveLength(3 * SANTA_CLIPS.length)
  expect(new Set(laughs.slice(0, SANTA_CLIPS.length)).size).toBe(SANTA_CLIPS.length)
  expect(new Set(played)).toEqual(new Set(ENTER_CLIPS))
  expect(played.filter(clip => clip === 'sounds/ding-dong.wav')).toHaveLength(SANTA_CLIPS.length)
  expect(played.some((clip, index) => clip === played[index - 1])).toBe(false)
})

test('with sounds on, Enter plays a sound, but not over a carol', async ($, on) => {
  const { clock } = sessionBeneath(on, { hasSounds: true })
  const played = recordPlays(on)
  await $.session.start(TERMINAL_SESSION)

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(ENTER_CLIPS).toContain(played[0])

  const labels = await $.ui.mount(MODE_LABELS)
  const bell = (await labels.find({ type: 'Client' }))?.key ?? ''
  await labels.pointer({ type: 'enter', x: 0, y: 0, in: bell })
  expect(SONG_ASSETS).toContain(played[1])

  await clock.advance(2_000)
  await $.prompt.submit({ text: 'again', wait: false, origin: { kind: 'composer' } })
  expect(played).toHaveLength(2)
  await labels.unmount()
})

test('a slash command or skill typed gets an Enter sound too, once even if it sends a prompt on', async ($, on) => {
  const { clock } = sessionBeneath(on, { hasSounds: true })
  const played = recordPlays(on)
  on('command.run', () => ({ text: '' }))
  await $.session.start(TERMINAL_SESSION)
  const typed = (command: string, args = '') =>
    $.command.run({ ...CHRISTMAS_COMMAND, command, args, origin: { kind: 'composer' } })

  await typed('commit')
  expect(played).toHaveLength(1)
  expect(ENTER_CLIPS).toContain(played[0])

  await $.prompt.submit({ text: 'the skill prompt', wait: false, origin: { kind: 'composer' } })
  expect(played).toHaveLength(1)

  await clock.advance(2_000)
  await $.command.run({ ...CHRISTMAS_COMMAND, command: 'compact', origin: { kind: 'plugin', name: 'other' } })
  expect(played).toHaveLength(1)

  await typed('christmas', 'typing mix')
  expect(played).toHaveLength(2)

  await clock.advance(2_000)
  await typed('christmas', 'sounds')
  expect(played).toHaveLength(2)
})
