/**
 * The theme's sounds. Each bell on the garland rings a carol when the pointer
 * reaches it. With sounds on, typing tinkles a sleigh bell or, now and then, a
 * glockenspiel note, and sending a prompt gets Santa's "Ho! ho! ho!", sleigh
 * bells or a chime.
 *
 * The clips are the mod's own files under sounds/, synthesized from sines, FM
 * and noise by the repository's scripts/render-sounds.mjs; the carols are
 * traditional tunes in the public domain.
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

export const JINGLE_CLIPS = ['sounds/jingle-1.wav', 'sounds/jingle-2.wav', 'sounds/jingle-3.wav', 'sounds/jingle-4.wav'] as const
export const TWINKLE_CLIPS = [
  'sounds/twinkle-c.wav',
  'sounds/twinkle-d.wav',
  'sounds/twinkle-e.wav',
  'sounds/twinkle-g.wav',
  'sounds/twinkle-a.wav',
] as const
export const SANTA_CLIPS = [
  'sounds/santa-jolly.wav',
  'sounds/santa-deep.wav',
  'sounds/santa-belly.wav',
  'sounds/santa-bells.wav',
] as const
export const ENTER_CLIPS = [
  ...SANTA_CLIPS,
  'sounds/sleigh.wav',
  'sounds/chime.wav',
  'sounds/ding-dong.wav',
  'sounds/new-year.wav',
] as const

/** Fewest milliseconds between two keystroke sounds, so fast typing or a held key never drones. */
export const KEYSTROKE_GAP_MS = 70

/** The share of keystrokes that play a glockenspiel note instead of a sleigh bell. */
const TWINKLE_SHARE = 0.2

/** One edit of the prompt box, as `prompt.edit` carries it. */
type Edit = { start: number; end: number; inputText: string }

const randomOf = <T>(list: readonly T[], random: () => number): T =>
  list[Math.floor(random() * list.length)] as T

/**
 * The clip an edit plays: none for a bare cursor move or within
 * KEYSTROKE_GAP_MS of the last one, else a sleigh bell or, now and then, a
 * note of the pentatonic scale, so fast typing plays a little tune.
 */
export function keystrokeClip(edit: Edit, msSinceLast: number, random: () => number = Math.random): string | undefined {
  const isChange = edit.inputText !== '' || edit.end > edit.start

  if (!isChange || msSinceLast < KEYSTROKE_GAP_MS) {
    return undefined
  }

  return randomOf(random() < TWINKLE_SHARE ? TWINKLE_CLIPS : JINGLE_CLIPS, random)
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
