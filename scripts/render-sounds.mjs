#!/usr/bin/env node
/**
 * Renders the Christmas mod's synthesized sounds into plugins/christmas/sounds:
 * the carols the bells ring, and the chime, church bells and New Year tune
 * Enter plays. (The typing jingles, Santa's laughs and the sleigh-bell shakes
 * were made with ElevenLabs and are not rendered here.)
 *
 * Everything here is synthesized from sines, FM and filtered noise: a
 * glockenspiel carries each tune, a soft bass and chords sit under it, and a
 * small Freeverb gives it all a room. The tunes are traditional carols in the
 * public domain.
 *
 *   node scripts/render-sounds.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 32_000
const TAU = Math.PI * 2
const NYQUIST_LIMIT = SAMPLE_RATE * 0.45
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'christmas', 'sounds')

const samplesIn = seconds => Math.ceil(seconds * SAMPLE_RATE)
const buffer = seconds => new Float32Array(samplesIn(seconds))
const peakOf = signal => signal.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)

function randomFrom(seed) {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0

    return state / 4294967296
  }
}

function mixInto(into, part, atSeconds, gain = 1) {
  const start = Math.round(atSeconds * SAMPLE_RATE)

  for (let index = 0; index < part.length && start + index < into.length; index++) {
    into[start + index] += part[index] * gain
  }
}

/* ------------------------------------------------------------------ pitch */

const STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function midiOf(name) {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name)

  if (match === null) {
    throw new Error(`Not a note: ${name}`)
  }

  const [, letter, accidental, octave] = match

  return 12 * (Number(octave) + 1) + STEPS[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
}

const hertzOf = name => 440 * 2 ** ((midiOf(name) - 69) / 12)

/* ----------------------------------------------------------------- voices */

/**
 * A glockenspiel bar: the free bar's inharmonic modes (1, 2.76, 5.40, 8.93),
 * the upper ones dying fast, over a soft mallet click. `brightness` scales the
 * upper modes, so a chord can sit under the tune without glittering.
 */
function glock(frequency, { length = 2.2, brightness = 1, seed = 1 } = {}) {
  const out = buffer(length)
  const random = randomFrom(seed)
  const stretch = Math.min(1.6, (660 / frequency) ** 0.4)
  const modes = [
    [1, 1, 1.15],
    [2.756, 0.3 * brightness, 0.32],
    [5.404, 0.12 * brightness, 0.11],
    [8.933, 0.05 * brightness, 0.05],
  ]

  for (const [ratio, level, decay] of modes) {
    const pitch = frequency * ratio

    if (pitch > NYQUIST_LIMIT) {
      continue
    }

    const phase = random() * TAU

    for (let index = 0; index < out.length; index++) {
      const time = index / SAMPLE_RATE
      const envelope = (1 - Math.exp(-time / 0.0015)) * Math.exp(-time / (decay * stretch))
      out[index] += level * envelope * Math.sin(TAU * pitch * time + phase)
    }
  }

  let last = 0

  for (let index = 0; index < samplesIn(0.006); index++) {
    const noise = random() * 2 - 1
    out[index] += (noise - last) * 0.08 * brightness * Math.exp(-index / SAMPLE_RATE / 0.0009)
    last = noise
  }

  return out
}

/**
 * A church or tubular bell by FM (Chowning's bell): a carrier against a
 * modulator 1.4 times its pitch, the index dying faster than the ring, and the
 * hum an octave below.
 */
function fmBell(frequency, { length = 3.5, index = 3.2, ratio = 1.4, decay = 1.3 } = {}) {
  const out = buffer(length)

  for (let sample = 0; sample < out.length; sample++) {
    const time = sample / SAMPLE_RATE
    const attack = 1 - Math.exp(-time / 0.002)
    const depth = index * Math.exp(-time / (decay * 0.45))
    const strike = attack * Math.exp(-time / decay) * Math.sin(TAU * frequency * time + depth * Math.sin(TAU * frequency * ratio * time))
    const hum = attack * 0.3 * Math.exp(-time / (decay * 1.6)) * Math.sin(TAU * frequency * 0.5 * time)
    out[sample] = strike + hum
  }

  return out
}

/** A soft, round bass note held for `seconds`, then let go. */
function bass(frequency, seconds) {
  const out = buffer(seconds + 0.35)

  for (let index = 0; index < out.length; index++) {
    const time = index / SAMPLE_RATE
    const release = time > seconds ? Math.exp(-(time - seconds) / 0.07) : 1
    const envelope = (1 - Math.exp(-time / 0.012)) * Math.exp(-time / 1.1) * release
    const wave =
      Math.sin(TAU * frequency * time) + 0.35 * Math.sin(TAU * 2 * frequency * time) + 0.1 * Math.sin(TAU * 3 * frequency * time)
    out[index] = envelope * wave
  }

  return out
}

/**
 * One shake of a sleigh bell: its pellet rattles two or three times in a few
 * milliseconds, each hit ringing a handful of high, unrelated partials.
 */
function jingle(seed, { length = 0.14, brightness = 1 } = {}) {
  const random = randomFrom(seed)
  const out = buffer(length + 0.06)
  const hits = 2 + Math.floor(random() * 2)
  let at = 0

  for (let hit = 0; hit < hits; hit++) {
    const level = hit === 0 ? 1 : 0.55 + random() * 0.3
    const start = samplesIn(at)

    for (let partial = 0; partial < 5; partial++) {
      const pitch = Math.min(NYQUIST_LIMIT, (2600 + random() * 5200) * brightness)
      const decay = 0.018 + random() * 0.05
      const phase = random() * TAU

      for (let index = 0; start + index < out.length; index++) {
        const time = index / SAMPLE_RATE
        out[start + index] += level * 0.22 * Math.exp(-time / decay) * Math.sin(TAU * pitch * time + phase)
      }
    }

    let last = 0

    for (let index = 0; index < samplesIn(0.012) && start + index < out.length; index++) {
      const noise = random() * 2 - 1
      out[start + index] += (noise - last) * 0.12 * level * Math.exp(-index / SAMPLE_RATE / 0.003)
      last = noise
    }

    at += 0.007 + random() * 0.013
  }

  return out
}

/** A strap of sleigh bells shaken for `seconds`: many jingles under one swell. */
function sleighShake(seed, seconds, { density = 90, swell = 0.4 } = {}) {
  const random = randomFrom(seed)
  const out = buffer(seconds + 0.25)
  const count = Math.round(density * seconds)

  for (let index = 0; index < count; index++) {
    const at = random() * seconds
    const level = Math.sin(Math.PI * Math.min(1, at / seconds)) ** swell * (0.5 + random() * 0.5)
    mixInto(out, jingle(seed * 977 + index, { length: 0.1 }), at, level)
  }

  return out
}

/* --------------------------------------------------------------- finishing */

/**
 * Freeverb in mono: eight damped combs into four allpasses, the classic
 * tunings scaled to this sample rate. `wet` is the hall's peak against the
 * dry signal's.
 */
function withReverb(dry, { room = 0.82, damping = 0.3, wet = 0.3, tail = 1.6 } = {}) {
  const scale = SAMPLE_RATE / 44_100
  const length = dry.length + samplesIn(tail)
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(delay => ({
    line: new Float32Array(Math.round(delay * scale)),
    at: 0,
    store: 0,
  }))
  const allpasses = [556, 441, 341, 225].map(delay => ({ line: new Float32Array(Math.round(delay * scale)), at: 0 }))
  const hall = new Float32Array(length)

  for (let index = 0; index < length; index++) {
    const input = (dry[index] ?? 0) * 0.015
    let sum = 0

    for (const comb of combs) {
      const output = comb.line[comb.at]
      comb.store = output * (1 - damping) + comb.store * damping
      comb.line[comb.at] = input + comb.store * room
      comb.at = (comb.at + 1) % comb.line.length
      sum += output
    }

    for (const allpass of allpasses) {
      const buffered = allpass.line[allpass.at]
      allpass.line[allpass.at] = sum + buffered * 0.5
      allpass.at = (allpass.at + 1) % allpass.line.length
      sum = buffered - sum
    }

    hall[index] = sum
  }

  const gain = (wet * peakOf(dry)) / Math.max(peakOf(hall), 1e-9)
  const out = new Float32Array(length)

  for (let index = 0; index < length; index++) {
    out[index] = (dry[index] ?? 0) + hall[index] * gain
  }

  return out
}

/** Trims the silence at the end, fades the last moment out and sets the peak. */
function finished(signal, peak) {
  const loudest = peakOf(signal)
  let end = signal.length

  while (end > 0 && Math.abs(signal[end - 1]) < loudest * 0.0015) {
    end--
  }

  const out = signal.slice(0, Math.max(end, 1))
  const fade = Math.min(samplesIn(0.06), out.length)

  for (let index = 0; index < fade; index++) {
    out[out.length - 1 - index] *= index / fade
  }

  const gain = peak / Math.max(peakOf(out), 1e-9)

  return out.map(sample => sample * gain)
}

function wavBytes(signal) {
  const bytes = new Uint8Array(44 + signal.length * 2)
  const view = new DataView(bytes.buffer)
  const writeText = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + signal.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, signal.length * 2, true)
  signal.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32_767), true))

  return bytes
}

/* ------------------------------------------------------------------- songs */

/**
 * Reads a line of music: `E5:1 G5:0.5 r:1 B3+D4:1`, a note (or notes joined
 * by `+`, or `r` for a rest) and its length in beats; `|` marks bars for the
 * reader and is skipped.
 */
function parse(line) {
  return line
    .split(/\s+/)
    .filter(token => token !== '' && token !== '|')
    .map(token => {
      const [notes, beats] = token.split(':')

      if (beats === undefined || Number.isNaN(Number(beats))) {
        throw new Error(`No length on "${token}"`)
      }

      return { notes: notes === 'r' ? [] : notes.split('+'), beats: Number(beats) }
    })
}

const beatsOf = line => parse(line).reduce((total, event) => total + event.beats, 0)

/**
 * A carol: the tune on the glockenspiel; under it, every note below G3 on the
 * bass and the rest as soft chords; sleigh bells on each beat for a sleigh song;
 * `extra` for whatever else the arrangement rings.
 */
function carol({ title, beat, melody, accompaniment, hasSleighBells = false, extra }) {
  const melodyBeats = beatsOf(melody)
  const accompanimentBeats = beatsOf(accompaniment)

  if (melodyBeats !== accompanimentBeats) {
    throw new Error(`${title}: the tune has ${melodyBeats} beats, the accompaniment ${accompanimentBeats}`)
  }

  const out = buffer(melodyBeats * beat + 3.5)
  let time = 0
  let seed = 1

  for (const { notes, beats } of parse(melody)) {
    for (const note of notes) {
      mixInto(out, glock(hertzOf(note), { seed: seed++ }), time, 0.6)
    }

    time += beats * beat
  }

  time = 0

  for (const { notes, beats } of parse(accompaniment)) {
    for (const note of notes) {
      if (midiOf(note) < midiOf('G3')) {
        mixInto(out, bass(hertzOf(note), beats * beat * 0.92), time, 0.42)
      } else {
        mixInto(out, glock(hertzOf(note), { length: 1.1, brightness: 0.35, seed: seed++ }), time, 0.17)
      }
    }

    time += beats * beat
  }

  if (hasSleighBells) {
    for (let count = 0; count < melodyBeats; count++) {
      const isBackbeat = count % 2 === 1
      mixInto(out, sleighShake(500 + count, 0.12, { density: 70 }), count * beat, isBackbeat ? 0.5 : 0.3)
    }
  }

  extra?.(out, beat)

  return finished(withReverb(out, { wet: 0.28 }), 0.72)
}

const SONGS = {
  // James Lord Pierpont, 1857: the chorus.
  'jingle-bells': {
    title: 'Jingle Bells',
    beat: 0.27,
    hasSleighBells: true,
    melody: `
      E5:1 E5:1 E5:2 | E5:1 E5:1 E5:2 | E5:1 G5:1 C5:1.5 D5:0.5 | E5:4 |
      F5:1 F5:1 F5:1.5 F5:0.5 | F5:1 E5:1 E5:1 E5:0.5 E5:0.5 | E5:1 D5:1 D5:1 E5:1 | D5:2 G5:2 |
      E5:1 E5:1 E5:2 | E5:1 E5:1 E5:2 | E5:1 G5:1 C5:1.5 D5:0.5 | E5:4 |
      F5:1 F5:1 F5:1.5 F5:0.5 | F5:1 E5:1 E5:1 E5:0.5 E5:0.5 | G5:1 G5:1 F5:1 D5:1 | C5:4`,
    accompaniment: `
      C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 |
      F2:2 C3:2 | C3:2 G2:2 | D3:2 A2:2 | G2:2 D3:2 |
      C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 | C3:2 G2:2 |
      F2:2 C3:2 | C3:2 G2:2 | G2:2 D3:2 | C3+C4+E4+G4:4`,
  },
  // English West Country carol.
  'we-wish-you': {
    title: 'We Wish You a Merry Christmas',
    beat: 0.32,
    melody: `
      D5:1 |
      G5:1 G5:0.5 A5:0.5 G5:0.5 F#5:0.5 | E5:1 E5:1 E5:1 |
      A5:1 A5:0.5 B5:0.5 A5:0.5 G5:0.5 | F#5:1 D5:1 D5:1 |
      B5:1 B5:0.5 C6:0.5 B5:0.5 A5:0.5 | G5:1 E5:1 D5:0.5 D5:0.5 |
      E5:1 A5:1 F#5:1 | G5:3`,
    accompaniment: `
      r:1 |
      G2:1 B3+D4:1 B3+D4:1 | C3:1 C4+E4:1 C4+E4:1 |
      A2:1 C#4+E4:1 C#4+E4:1 | D3:1 F#3+A3:1 F#3+A3:1 |
      B2:1 D#4+F#4:1 D#4+F#4:1 | E3:1 G3+B3:1 G3+B3:1 |
      C3:1 D3:1 F#3+A3:1 | G2+G3+B3+D4:3`,
  },
  // Welsh, "Nos Galan": the first line, the third, then the first again.
  'deck-the-halls': {
    title: 'Deck the Halls',
    beat: 0.28,
    melody: `
      C6:1.5 Bb5:0.5 A5:1 G5:1 | F5:1 G5:1 A5:1 F5:1 | G5:0.5 A5:0.5 Bb5:0.5 G5:0.5 A5:1.5 G5:0.5 | F5:1 E5:1 F5:2 |
      G5:1.5 A5:0.5 Bb5:1 G5:1 | A5:1.5 Bb5:0.5 C6:1 G5:1 | A5:0.5 B5:0.5 C6:1 D6:0.5 E6:0.5 F6:1 | E6:1 D6:1 C6:2 |
      C6:1.5 Bb5:0.5 A5:1 G5:1 | F5:1 G5:1 A5:1 F5:1 | G5:0.5 A5:0.5 Bb5:0.5 G5:0.5 A5:1.5 G5:0.5 | F5:1 E5:1 F5:2`,
    accompaniment: `
      F2:2 C3:2 | F2:2 C3:2 | C3:2 F2:2 | C3:2 F2:2 |
      C3:2 G2:2 | F2:2 C3:2 | F2:2 D3:2 | G2:2 C3:2 |
      F2:2 C3:2 | F2:2 C3:2 | C3:2 F2:2 | C3:1 C3:1 F2+F3+A3+C4:2`,
  },
  // Mykola Leontovych, "Shchedryk", 1914: the four-note ostinato over its falling bass.
  'carol-of-the-bells': {
    title: 'Carol of the Bells',
    beat: 0.27,
    melody: `
      Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 |
      Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 | Bb5:1 A5:0.5 Bb5:0.5 G5:1 |
      Bb6:1 A6:0.5 Bb6:0.5 G6:1 | Bb6:1 A6:0.5 Bb6:0.5 G6:1 | Bb6:1 A6:0.5 Bb6:0.5 G6:1 | Bb6:1 A6:0.5 Bb6:0.5 G6:1 |
      G5:3`,
    accompaniment: `
      G2:3 | G2:3 | G2:3 | G2:3 |
      G2:3 | F2:3 | Eb2:3 | D2:3 |
      G2:3 | F2:3 | Eb2:3 | D2:3 |
      G2+G3+Bb3+D4:3`,
    extra: (out, beat) => {
      for (let bar = 8; bar < 12; bar++) {
        mixInto(out, fmBell(hertzOf(bar % 2 === 0 ? 'G4' : 'D4'), { length: 2.4, decay: 0.9, index: 2.4 }), bar * 3 * beat, 0.22)
      }

      mixInto(out, fmBell(hertzOf('G3'), { length: 4, decay: 1.6 }), 12 * 3 * beat, 0.4)
    },
  },
  // Franz Xaver Gruber, 1818: the first half, then the last "sleep in heavenly peace".
  'silent-night': {
    title: 'Silent Night',
    beat: 0.21,
    melody: `
      G5:3 A5:1 G5:2 | E5:6 | G5:3 A5:1 G5:2 | E5:6 |
      D6:4 D6:2 | B5:6 | C6:4 C6:2 | G5:6 |
      E6:6 | C6:3 G5:1 E5:2 | G5:3 F5:1 D5:2 | C5:6 | r:3`,
    accompaniment: `
      C3:3 G2:3 | C3:3 G2:3 | C3:3 G2:3 | C3:3 G2:3 |
      G2:3 D3:3 | G2:3 D3:3 | C3:3 G2:3 | C3:3 G2:3 |
      C3:3 G2:3 | C3:3 G2:3 | G2:3 G2:3 | C3+C4+E4+G4:6 | r:3`,
  },
  // Lowell Mason, 1839, after Handel: "Joy to the world... let earth receive her King".
  'joy-to-the-world': {
    title: 'Joy to the World',
    beat: 0.14,
    melody: `
      C6:4 B5:3 A5:1 | G5:6 F5:2 | E5:4 D5:4 | C5:6 G5:2 |
      A5:6 A5:2 | B5:6 B5:2 | C6:12`,
    accompaniment: `
      C3:8 | C3:4 F2:4 | C3:4 G2:4 | C3:8 |
      F2:8 | G2:8 | C3+C4+E4+G4:12`,
  },
  // "O Tannenbaum", Ernst Anschütz, 1824: its opening line, twice.
  'o-christmas-tree': {
    title: 'O Christmas Tree',
    beat: 0.42,
    melody: `
      C5:1 |
      F5:0.75 F5:0.25 F5:1.5 G5:0.5 | A5:0.75 A5:0.25 A5:1.5 A5:0.5 | G5:0.5 A5:0.5 Bb5:1 E5:1 | G5:1 F5:1 C5:1 |
      F5:0.75 F5:0.25 F5:1.5 G5:0.5 | A5:0.75 A5:0.25 A5:1.5 A5:0.5 | G5:0.5 A5:0.5 Bb5:1 E5:1 | G5:1 F5:2`,
    accompaniment: `
      r:1 |
      F2:1 A3+C4:1 A3+C4:1 | F2:1 A3+C4:1 A3+C4:1 | C3:1 Bb3+E4:1 Bb3+E4:1 | C3:1 F2:1 A3+C4:1 |
      F2:1 A3+C4:1 A3+C4:1 | F2:1 A3+C4:1 A3+C4:1 | C3:1 Bb3+E4:1 Bb3+E4:1 | C3:1 F2+F3+A3+C4:2`,
  },
  // Felix Mendelssohn, 1840: "Hark! the herald angels sing, glory to the newborn King".
  'hark-the-herald': {
    title: 'Hark! The Herald Angels Sing',
    beat: 0.4,
    melody: `
      D5:1 G5:1 G5:1.5 F#5:0.5 | G5:1 B5:1 B5:1 A5:1 | D6:1 D6:1 D6:1.5 C6:0.5 | B5:1 A5:1 B5:2`,
    accompaniment: `
      G2:2 G2:2 | G2:2 D3:2 | B2:2 D3:2 | D3:1 D3:1 G2+G3+B3+D4:2`,
    extra: (out, beat) => mixInto(out, fmBell(hertzOf('G3'), { length: 4, decay: 1.5 }), 14 * beat, 0.3),
  },
}

/* ------------------------------------------------------------ enter chimes */

function sequence(notes, { step, gain = 0.6, brightness = 1, length = 2 }) {
  const out = buffer(notes.length * step + length)

  notes.forEach((note, index) => mixInto(out, glock(hertzOf(note), { brightness, seed: index + 3 }), index * step, gain))

  return out
}

const ENTER = {
  // A rising arpeggio on the glockenspiel.
  chime: () => finished(withReverb(sequence(['C6', 'E6', 'G6', 'C7'], { step: 0.09 }), { wet: 0.3 }), 0.55),
  // Two church bells, high then low.
  'ding-dong': () => {
    const out = buffer(4)
    mixInto(out, fmBell(hertzOf('E5'), { length: 3, decay: 1.1 }), 0)
    mixInto(out, fmBell(hertzOf('C5'), { length: 3.4, decay: 1.3 }), 0.55)

    return finished(withReverb(out, { wet: 0.32 }), 0.55)
  },
  // "...and a happy New Year!"
  'new-year': () => {
    const out = buffer(3)
    const beat = 0.2
    const tune = [
      ['D5', 0, 0.5],
      ['D5', 0.5, 0.5],
      ['E5', 1, 1],
      ['A5', 2, 1],
      ['F#5', 3, 1],
      ['G5', 4, 2],
    ]

    for (const [note, at] of tune) {
      mixInto(out, glock(hertzOf(note), { seed: Math.round(at * 10) + 1 }), at * beat, 0.6)
    }

    mixInto(out, bass(hertzOf('C3'), beat * 1.9), 1 * beat, 0.4)
    mixInto(out, bass(hertzOf('D3'), beat * 1.9), 3 * beat, 0.4)
    mixInto(out, bass(hertzOf('G2'), beat * 3), 4 * beat, 0.45)
    mixInto(out, sleighShake(31, 0.3, { density: 100 }), 4 * beat, 0.5)

    return finished(withReverb(out, { wet: 0.28 }), 0.55)
  },
}

/* -------------------------------------------------------------------- run */

function write(path, signal) {
  const file = join(OUT, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, wavBytes(signal))
  process.stdout.write(`${path.padEnd(28)} ${(signal.length / SAMPLE_RATE).toFixed(2)}s\n`)
}

for (const [name, song] of Object.entries(SONGS)) {
  write(`songs/${name}.wav`, carol(song))
}

for (const [name, render] of Object.entries(ENTER)) {
  write(`${name}.wav`, render())
}

