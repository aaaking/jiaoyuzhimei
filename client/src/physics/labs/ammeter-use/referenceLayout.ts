import type { Position } from '../../runtime/types'
import type { AmmeterTerminalId } from './definition'
import { wireKey, type LabLayout } from './layout'
import { PART_GEOMETRY } from './RealisticParts'

const offset = (kind: keyof typeof PART_GEOMETRY, pixelX: number): Position => ({
  x: (pixelX - PART_GEOMETRY[kind].anchorX) * PART_GEOMETRY[kind].scale, y: 0,
})
export const REFERENCE_TERMINAL_OFFSETS: Readonly<Record<AmmeterTerminalId, Position>> = {
  'battery-': offset('battery', PART_GEOMETRY.battery.left),
  'battery+': offset('battery', PART_GEOMETRY.battery.right),
  'switch-a': offset('switch', PART_GEOMETRY.switch.left),
  'switch-b': offset('switch', PART_GEOMETRY.switch.right),
  'lamp2-a': offset('switch', PART_GEOMETRY.switch.left),
  'lamp2-b': offset('switch', PART_GEOMETRY.switch.right),
  'lamp1-a': offset('lamp', PART_GEOMETRY.lamp.left),
  'lamp1-b': offset('lamp', PART_GEOMETRY.lamp.right),
  'ammeter-neg': offset('ammeter', PART_GEOMETRY.ammeter.left),
  'ammeter-0.6': offset('ammeter', 657),
  'ammeter-3': offset('ammeter', PART_GEOMETRY.ammeter.right),
}

/** 以用户上传的860×666截图为基准，器材参考点位于接线柱高度。 */
export function createReferenceLayout(): LabLayout {
  const bends: [AmmeterTerminalId, AmmeterTerminalId, number][] = [
    ['battery+', 'switch-a', 0], ['switch-b', 'ammeter-3', 78],
    ['ammeter-neg', 'lamp1-b', -40], ['lamp1-a', 'battery-', 164],
    ['lamp2-a', 'lamp1-a', 52], ['lamp2-b', 'lamp1-b', -40],
  ]
  return {
    components: { S2: { x: 316, y: 120 }, L1: { x: 317, y: 285 }, A1: { x: 634, y: 285 }, E1: { x: 284, y: 588 }, S1: { x: 571, y: 591 } },
    terminalOffsets: REFERENCE_TERMINAL_OFFSETS,
    wires: Object.fromEntries(bends.map(([from, to, bend]) => [wireKey(from, to), { bend, direction: { x: 1, y: 0 } }])),
  }
}
