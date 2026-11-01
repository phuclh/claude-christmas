/**
 * The theme's sounds. Each bell on the garland rings a carol when the pointer
 * reaches it. With sounds on, typing jingles a sleigh bell, and sending a
 * prompt gets Santa's "Ho! ho! ho!", sleigh bells, church bells or a chime.
 *
 * The clips are the mod's own files under sounds/. The carols and chimes are
 * synthesized by the repository's scripts/render-sounds.mjs, and the carols
 * are traditional tunes in the public domain; the typing jingles, Santa's
 * laughs and the sleigh bells were made with ElevenLabs.
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

/** Sleigh-bell jingles for typing, one at random per keystroke. */
export const JINGLE_CLIPS: readonly string[] = Array.from(
  { length: 52 },
  (_, index) => `sounds/keys/jingle-${String(index + 1).padStart(2, '0')}.wav`,
)

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

/**
 * The clip an edit plays: none for a bare cursor move or within
 * KEYSTROKE_GAP_MS of the last one, else one of the sleigh-bell jingles.
 */
export function keystrokeClip(edit: Edit, msSinceLast: number, random: () => number = Math.random): string | undefined {
  const isChange = edit.inputText !== '' || edit.end > edit.start

  if (!isChange || msSinceLast < KEYSTROKE_GAP_MS) {
    return undefined
  }

  return randomOf(JINGLE_CLIPS, random)
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
