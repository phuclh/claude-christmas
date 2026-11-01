import type { FlakeSpot } from '../types'

import { noise } from './noise'

/**
 * Snow falling through a region of the conversation. Every flake falls whole
 * journeys: in over the top, down at its own slow pace while it sways from
 * side to side, out under the bottom, then a rest out of sight before it falls
 * again somewhere else.
 *
 * Pure: where every flake is follows from the snowfall's seed and the tick
 * alone, so a redraw at any moment lands each flake where it should be.
 */

export const FLAKES = ['❄', '❅', '❆'] as const

/** Near flakes are white, far ones a cold blue. */
const COLORS = ['#FFFFFF', '#DDEBFF', '#A9C6EE'] as const

/** Rows above the top and below the bottom a journey starts and ends. */
const OFFSTAGE = 1
/** Ticks a flake rests out of sight between two journeys, at least and at most. */
const SHORTEST_REST = 4
const LONGEST_REST = 50

/** Ticks a flake takes to fall one row: the near ones fall faster. */
function slownessOf(seed: number, flake: number): number {
  return 2 + Math.floor(noise(seed, flake, 1) * 3)
}

function restOf(seed: number, flake: number): number {
  return SHORTEST_REST + Math.floor(noise(seed, flake, 2) * (LONGEST_REST - SHORTEST_REST))
}

/**
 * Where flake `flake` is at `tick`, or `undefined` while it rests between
 * journeys. Positions lie above the top as it enters and below the bottom as it
 * leaves.
 */
export function flakeAt(seed: number, flake: number, columns: number, rows: number, tick: number): FlakeSpot | undefined {
  const slowness = slownessOf(seed, flake)
  const fall = (rows + OFFSTAGE * 2) * slowness
  const cycle = fall + restOf(seed, flake)
  const shifted = tick + Math.floor(noise(seed, flake, 9) * cycle)
  const elapsed = shifted % cycle

  if (elapsed >= fall) {
    return undefined
  }

  const journey = Math.floor(shifted / cycle)
  const roll = (salt: number): number => noise(seed, flake, journey, salt)
  const sway = Math.round(roll(2) * 2.4 * Math.sin((elapsed + roll(3) * 40) / (6 + roll(4) * 8)))
  const depth = Math.min(COLORS.length - 1, slowness - 2)

  return {
    x: Math.floor(roll(1) * columns) + sway,
    y: Math.floor(elapsed / slowness) - OFFSTAGE,
    glyph: FLAKES[Math.floor(roll(5) * FLAKES.length)] ?? '❄',
    color: COLORS[depth] ?? '#FFFFFF',
  }
}

/** How many flakes a region of this size holds: more room, more snow. */
export function snowfallSize(columns: number, rows: number): number {
  return Math.min(30, Math.max(8, Math.round((columns * rows) / 220)))
}

/** Every flake of the snowfall inside the region at `tick`. */
export function snowAt(seed: number, columns: number, rows: number, tick: number): FlakeSpot[] {
  const spots: FlakeSpot[] = []

  for (let flake = 0; flake < snowfallSize(columns, rows); flake++) {
    const spot = flakeAt(seed, flake, columns, rows, tick)

    if (spot !== undefined && spot.x >= 0 && spot.x <= columns - 1 && spot.y >= 0 && spot.y < rows) {
      spots.push(spot)
    }
  }

  return spots
}
