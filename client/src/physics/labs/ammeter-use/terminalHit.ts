import type { Position } from '../../runtime/types'
import { TERMINAL_DRAW_ORDER } from './competitorGeometry'
import type { AmmeterTerminalId } from './definition'
import { terminalPosition, TERMINAL_OWNER, type LabLayout, type LabComponentId } from './layout'

/** 命中范围跟随真实器材，已删除器材不保留隐藏端子。 */
export function nearestTerminal(layout: LabLayout, position: Position, meterRemoved = false, removedComponents: readonly LabComponentId[] = []): { id: AmmeterTerminalId; position: Position } | null {
  let best: { id: AmmeterTerminalId; position: Position; distance: number } | null = null
  for (const id of TERMINAL_DRAW_ORDER) {
    if (meterRemoved && id.startsWith('ammeter-')) continue
    if (removedComponents.includes(TERMINAL_OWNER[id])) continue
    const point = terminalPosition(layout, id)
    const distance = Math.hypot(position.x - point.x, position.y - point.y)
    if (best === null || distance < best.distance) best = { id, position: point, distance }
  }
  return best === null ? null : { id: best.id, position: best.position }
}

export function terminalAt(layout: LabLayout, position: Position, meterRemoved = false, removedComponents: readonly LabComponentId[] = []): AmmeterTerminalId | null {
  const nearest = nearestTerminal(layout, position, meterRemoved, removedComponents)
  if (nearest === null) return null
  return Math.hypot(position.x - nearest.position.x, position.y - nearest.position.y) <= 28 ? nearest.id : null
}
