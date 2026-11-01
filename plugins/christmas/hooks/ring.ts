/**
 * How a ringing bell looks: the colors it flashes, the notes rising from it
 * and where the carol's name goes beside it.
 *
 * Pure: everything follows from the bell's column and how long it has rung,
 * so the mod and the README's demo draw it the same way.
 */

import { widthOf } from './cells'
import { PALETTE } from './frame'

/** The two colors a ringing bell flashes between. */
export const RING_GLOW = [PALETTE.gold[1], '#E23B3B'] as const
const NOTES = ['🎵', '🎶'] as const
/** Frame ticks between two notes rising from a ringing bell, and how long each rises. */
const NOTE_EVERY_TICKS = 3
const NOTE_RISE_TICKS = 8

/** A note rising from a ringing bell: its column, rows above the garland, and glyph. */
export type Note = { x: number; rise: number; glyph: string }

/**
 * The notes rising from a bell that has rung for `age` frame ticks, in rows
 * above the garland and columns of the screen: a new one every few ticks,
 * each rising for a while, leaning left and right in turn.
 */
export function notesAt(column: number, age: number, columns: number): Note[] {
  const notes: Note[] = []

  for (let note = 0; note * NOTE_EVERY_TICKS <= age; note++) {
    const noteAge = age - note * NOTE_EVERY_TICKS

    if (noteAge < NOTE_RISE_TICKS) {
      const lean = note % 2 === 0 ? -1 : 1
      const x = Math.max(0, Math.min(columns - 2, column + lean * (1 + Math.floor(noteAge / 4))))
      notes.push({ x, rise: 2 + Math.floor(noteAge / 2), glyph: NOTES[note % NOTES.length] ?? '🎵' })
    }
  }

  return notes
}

/**
 * Where the carol's name goes, on the row just above the garland: right of
 * the bell, or left of it when the right has no room.
 */
export function labelLeft(column: number, label: string, columns: number): number {
  const width = widthOf(label)

  return column + 3 + width <= columns - 1 ? column + 3 : Math.max(0, column - 1 - width)
}
