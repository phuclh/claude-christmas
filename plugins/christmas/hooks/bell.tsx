import type { ClientModule } from 'claude-code'

/**
 * One bell on the garland, drawn in its own two-cell region so the terminal
 * tells it when the pointer arrives.
 *
 * The pointer reaching the bell asks the hooks module to ring its carol; a
 * click hushes it. Only the arrival rings: resting or moving on the bell does
 * not start the carol again, and leaving it lets the carol play on.
 */

/** What the frame hands the bell: its glyph and, while it rings, the color it glows. */
export type BellProps = { glyph: string; glow: string | null }

type BellState = { isPointerOn: boolean }

const Bell: ClientModule<BellProps, BellState> = (props, surface) => {
  const { Text } = surface.elements

  surface.onPointer(event => {
    const isPointerOn = surface.state?.isPointerOn === true

    if (event.type === 'leave') {
      if (isPointerOn) {
        surface.setState({ isPointerOn: false })
      }

      return
    }

    if (event.type === 'down') {
      if (event.button === 'left') {
        surface.post({ hush: true })
      }

      return
    }

    const isHover = event.type === 'enter' || (event.type === 'move' && event.button === undefined)

    if (isHover && !isPointerOn) {
      surface.setState({ isPointerOn: true })
      surface.post({ ring: true })
    }
  })

  return props.glow === null ? <Text>{props.glyph}</Text> : <Text backgroundColor={props.glow}>{props.glyph}</Text>
}

export default Bell
