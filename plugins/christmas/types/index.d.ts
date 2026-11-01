/** Where one snowflake is, in cells of the region it falls through, and how it looks. */
export type FlakeSpot = { x: number; y: number; glyph: string; color: string }

declare module 'claude-code' {
  interface PluginState {
    christmas: {
      isEnabled: boolean
      hasSounds: boolean
      hasBells: boolean
      draftRows: number
      frameTick: number
      snowTick: number
      isAwake: boolean
      isSelecting: boolean
      /** The bell ringing now, by its number on the garland; -1 while none rings. */
      ringingBell: number
      /** The frame tick the ringing bell started on, for the notes rising from it. */
      ringStartTick: number
    }
  }
}
