/**
 * The theme's sounds. Each bell on the garland rings a carol when the pointer
 * reaches it. With sounds on, typing plays fire crackles, steps in the snow
 * and carols a note at a time on a music box or celesta, in the style the
 * person picks, and sending a prompt gets Santa's "Ho! ho! ho!", sleigh bells,
 * church bells or a chime.
 *
 * The clips are the mod's own files under sounds/. The carols the bells ring
 * and the chimes are synthesized by the repository's scripts/render-sounds.mjs;
 * the crackles, the steps, the music-box and celesta notes, Santa's laughs and
 * the sleigh bells were made with ElevenLabs. The tunes are traditional carols
 * in the public domain.
 */

export type Song = { title: string; asset: string }

export const SONGS: readonly Song[] = [
  { title: 'Jingle Bells', asset: 'sounds/songs/jingle-bells.wav' },
  { title: 'We Wish You a Merry Christmas', asset: 'sounds/songs/we-wish-you.wav' },
  { title: 'Deck the Halls', asset: 'sounds/songs/deck-the-halls.wav' },
  { title: 'Carol of the Bells', asset: 'sounds/songs/carol-of-the-bells.wav' },
  { title: 'Silent Night', asset: 'sounds/songs/silent-night.wav' },
  { title: 'Joy to the World', asset: 'sounds/songs/joy-to-the-world.wav' },
  { title: 'O Christmas Tree', asset: 'sounds/songs/o-christmas-tree.wav' },
  { title: 'Hark! The Herald Angels Sing', asset: 'sounds/songs/hark-the-herald.wav' },
]

/** Crackles of a wood fire and steps in fresh snow, for typing. */
const numbered = (name: string, count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `sounds/keys/${name}-${String(index + 1).padStart(2, '0')}.wav`)
export const CRACKLE_CLIPS = numbered('crackle', 27)
export const SNOW_CLIPS = numbered('snow', 28)

/**
 * The carols typing plays a note at a time, one after another, in the music
 * box's range; each note has a file for each instrument under sounds/notes/.
 */
export const TYPING_CAROLS: readonly { title: string; notes: readonly string[] }[] = [
  {
    title: 'Jingle Bells',
    notes: 'E6 E6 E6 E6 E6 E6 E6 G6 C6 D6 E6 F6 F6 F6 F6 F6 E6 E6 E6 E6 D6 D6 E6 D6 G6 E6 E6 E6 E6 E6 E6 E6 G6 C6 D6 E6 F6 F6 F6 F6 F6 E6 E6 E6 G6 G6 F6 D6 C6',
  },
  { title: 'We Wish You a Merry Christmas', notes: 'D6 G6 G6 A6 G6 F#6 E6 E6 E6 A6 A6 B6 A6 G6 F#6 D6 D6 B6 B6 C7 B6 A6 G6 E6 D6 D6 E6 A6 F#6 G6' },
  { title: 'Deck the Halls', notes: 'G6 F6 E6 D6 C6 D6 E6 C6 D6 E6 F6 D6 E6 D6 C6 B5 C6 G6 F6 E6 D6 C6 D6 E6 C6 D6 E6 F6 D6 E6 D6 C6 B5 C6' },
  { title: 'Joy to the World', notes: 'C7 B6 A6 G6 F6 E6 D6 C6 G6 A6 A6 B6 B6 C7 C7 C7 B6 A6 G6 G6 F6 E6 C7 C7 B6 A6 G6 G6 F6 E6' },
  { title: 'Silent Night', notes: 'G6 A6 G6 E6 G6 A6 G6 E6 D7 D7 B6 C7 C7 G6 A6 A6 C7 B6 A6 G6 A6 G6 E6 A6 A6 C7 B6 A6 G6 A6 G6 E6' },
].map(carol => ({ title: carol.title, notes: carol.notes.split(' ') }))

export type Instrument = 'box' | 'celesta'

/** An instrument's file for a note such as `F#6`. */
export const noteClip = (instrument: Instrument, note: string): string => `sounds/notes/${instrument}/${note.replace('#', 's')}.wav`

/** How typing sounds, as `/christmas typing` picks it. */
export const TYPING_STYLES = {
  layered: 'fire crackles as you type, and the next note of a carol on a music box at each space',
  shuffle: 'each prompt gets one sound for all its keys: a carol on a music box or a celesta, the fireplace or the snow',
  mix: 'every key picks the next note of a carol, a fire crackle or a step in the snow',
} as const

export type TypingStyle = keyof typeof TYPING_STYLES

export const isTypingStyle = (name: string): name is TypingStyle => (Object.keys(TYPING_STYLES) as string[]).includes(name)

/** One sound for every key of a prompt, in the shuffle style. */
type Scene = Instrument | 'fire' | 'snow'

/**
 * Santa's laughs, some with a "Merry Christmas!": twelve as sound effects and
 * four spoken. The first greets `/christmas sounds`.
 */
export const SANTA_CLIPS = [
  'sounds/santa/santa-merry-1.wav',
  'sounds/santa/santa-hearty-1.wav',
  'sounds/santa/santa-belly-1.wav',
  'sounds/santa/santa-bells-1.wav',
  'sounds/santa/santa-bill-1.wav',
  'sounds/santa/santa-merry-2.wav',
  'sounds/santa/santa-hearty-2.wav',
  'sounds/santa/santa-belly-2.wav',
  'sounds/santa/santa-bells-2.wav',
  'sounds/santa/santa-brian-1.wav',
  'sounds/santa/santa-merry-3.wav',
  'sounds/santa/santa-hearty-3.wav',
  'sounds/santa/santa-belly-3.wav',
  'sounds/santa/santa-bells-3.wav',
  'sounds/santa/santa-bill-2.wav',
  'sounds/santa/santa-brian-2.wav',
] as const

export const SLEIGH_CLIPS = ['sounds/sleigh-1.wav', 'sounds/sleigh-2.wav', 'sounds/sleigh-3.wav'] as const

/**
 * What Enter plays, by kind, and how often: in each round of seven, Santa
 * laughs three times and the others come once each.
 */
const ENTER_KINDS: Record<string, readonly string[]> = {
  santa: SANTA_CLIPS,
  sleigh: SLEIGH_CLIPS,
  chime: ['sounds/chime.wav'],
  'ding-dong': ['sounds/ding-dong.wav'],
  'new-year': ['sounds/new-year.wav'],
}
const ENTER_ROUND = ['santa', 'santa', 'santa', 'sleigh', 'chime', 'ding-dong', 'new-year'] as const

/** Every sound Enter can play. */
export const ENTER_CLIPS: readonly string[] = Object.values(ENTER_KINDS).flat()

/** Fewest milliseconds between two keystroke sounds, so fast typing or a held key never drones. */
export const KEYSTROKE_GAP_MS = 70

/** One edit of the prompt box, as `prompt.edit` carries it. */
type Edit = { start: number; end: number; inputText: string }

const randomOf = <T>(list: readonly T[], random: () => number): T =>
  list[Math.floor(random() * list.length)] as T

/** A space or line break typed: the end of a word. */
const isWordEnd = (edit: Edit): boolean => edit.inputText !== '' && /^\s+$/.test(edit.inputText)

/** What typing plays: the clip for an edit, and a new prompt to start (a new scene to shuffle). */
export type TypingSounds = {
  clipFor: (style: TypingStyle, edit: Edit, msSinceLast: number) => string | undefined
  newPrompt: () => void
}

/**
 * Picks what each edit of the prompt box plays, in each style:
 *
 * - layered: a space or line break plays the next note of the carols on the
 *   music box, every time; any other change crackles.
 * - shuffle: every change plays the prompt's scene: the next carol note on its
 *   instrument, a crackle or a step. A deletion plays nothing in a carol, so
 *   it never skips a note.
 * - mix: every change plays the next carol note half the time, else a crackle
 *   or a step; a deletion only crackles or steps.
 *
 * The carols run one after another and start over after the last, keeping
 * their place across styles and prompts. Besides a layered space, nothing
 * plays within KEYSTROKE_GAP_MS of the last sound, and a bare cursor move
 * plays nothing.
 */
export function createTypingSounds(random: () => number = Math.random): TypingSounds {
  let carol = 0
  let note = 0
  const nextScene = createDeck(['box', 'celesta', 'fire', 'snow'], random)
  let scene = nextScene() as Scene

  const nextNote = (instrument: Instrument): string => {
    const notes = TYPING_CAROLS[carol]?.notes ?? []
    const clip = noteClip(instrument, notes[note] ?? 'C6')
    note++

    if (note >= notes.length) {
      carol = (carol + 1) % TYPING_CAROLS.length
      note = 0
    }

    return clip
  }

  const ambient = (kind: 'fire' | 'snow'): string => randomOf(kind === 'fire' ? CRACKLE_CLIPS : SNOW_CLIPS, random)

  return {
    clipFor: (style, edit, msSinceLast) => {
      const isChange = edit.inputText !== '' || edit.end > edit.start

      if (!isChange) {
        return undefined
      }

      if (style === 'layered' && isWordEnd(edit)) {
        return nextNote('box')
      }

      if (msSinceLast < KEYSTROKE_GAP_MS) {
        return undefined
      }

      const isDeletion = edit.inputText === ''

      if (style === 'layered') {
        return ambient('fire')
      }

      if (style === 'shuffle') {
        if (scene === 'fire' || scene === 'snow') {
          return ambient(scene)
        }

        return isDeletion ? undefined : nextNote(scene)
      }

      const roll = random()

      if (roll < 0.5 && !isDeletion) {
        return nextNote('box')
      }

      return ambient(roll < 0.75 ? 'fire' : 'snow')
    },
    newPrompt: () => {
      scene = nextScene() as Scene
    },
  }
}

/** The list in a new order, every item once. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const order = [...list]

  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[order[index], order[other]] = [order[other] as T, order[index] as T]
  }

  return order
}

/**
 * Deals the clips: each once in a shuffled round before any comes again, and
 * never one twice in a row where two rounds meet.
 */
export function createDeck(clips: readonly string[], random: () => number = Math.random): () => string {
  let round: string[] = []
  let last: string | undefined

  return () => {
    if (round.length === 0) {
      round = shuffled(clips, random)

      if (round[round.length - 1] === last) {
        ;[round[0], round[round.length - 1]] = [round[round.length - 1] as string, round[0] as string]
      }
    }

    last = round.pop() as string

    return last
  }
}

/**
 * Deals Enter's sounds: a kind from ENTER_ROUND's deck, then that kind's next
 * clip from its own, so every Santa laugh plays before one comes again.
 */
export function createEnterDeck(random: () => number = Math.random): () => string {
  const nextKind = createDeck(ENTER_ROUND, random)
  const decks = new Map(Object.entries(ENTER_KINDS).map(([kind, clips]) => [kind, createDeck(clips, random)]))

  return () => decks.get(nextKind())?.() ?? (SANTA_CLIPS[0] as string)
}
