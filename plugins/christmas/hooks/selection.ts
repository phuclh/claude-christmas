/**
 * Telling a selection the person made from one the snow changed.
 *
 * The engine reads a highlighted selection off the screen, so a flake falling
 * through it changes its text: the flake, one cell wide, stands where the
 * character under it was (or where none was, past a line's trimmed end).
 */

/** Where `part` ends when read from each of `starts`, for the starts it matches at. */
function pastPart(text: readonly string[], part: readonly string[], starts: ReadonlySet<number>): Set<number> {
  const ends = new Set<number>()

  for (const start of starts) {
    if (part.every((character, index) => text[start + index] === character)) {
      ends.add(start + part.length)
    }
  }

  return ends
}

/** Where a flake standing at each of `starts` ends: over no character, or one of a line. */
function pastFlake(text: readonly string[], starts: ReadonlySet<number>): Set<number> {
  const ends = new Set<number>()

  for (const start of starts) {
    ends.add(start)

    if (start < text.length && text[start] !== '\n') {
      ends.add(start + 1)
    }
  }

  return ends
}

/**
 * Whether `current` is `settled` with flakes over some of it, and nothing else
 * changed. Reads both once, character by character, keeping every place the
 * text read so far can end, so a selection full of snow costs no more than its
 * length.
 */
export function isUnderSnow(settled: string, current: string, flakes: readonly string[]): boolean {
  const characters = Array.from(current)

  if (!characters.some(character => flakes.includes(character))) {
    return false
  }

  const text = Array.from(settled)
  const parts: string[][] = [[]]

  for (const character of characters) {
    if (flakes.includes(character)) {
      parts.push([])
    } else {
      parts[parts.length - 1]?.push(character)
    }
  }

  const [first = [], ...rest] = parts
  let ends = pastPart(text, first, new Set([0]))

  for (const part of rest) {
    if (ends.size === 0) {
      return false
    }

    ends = pastPart(text, part, pastFlake(text, ends))
  }

  return ends.has(text.length)
}
