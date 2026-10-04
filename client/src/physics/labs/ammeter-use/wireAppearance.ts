import type { Position } from '../../runtime/types'
import type { AmmeterTerminalId } from './definition'
import { terminalPosition, TERMINAL_OWNER, wirePathPoints, type LabLayout } from './layout'

// 素材中柱帽下方金属柱的局部高度、半径（画布单位）。
export const METAL_POST_GEOMETRY = {
  E1: { y: 8.47, radius: 5.83 },
  S1: { y: 12.96, radius: 5.4 },
  S2: { y: 12.96, radius: 5.4 },
  L1: { y: 10.26, radius: 6.3 },
  A1: { y: 10.125, radius: 5.875 },
} as const

const rounded = (value: number) => Number(value.toFixed(3))

/** 可见线头独立于柱帽上的操作热区；裸线从绝缘层末端绕过金属柱前侧。 */
export function exposedWireEnd(layout: LabLayout, terminal: AmmeterTerminalId, toward: Position) {
  const owner = TERMINAL_OWNER[terminal]
  const cap = terminalPosition(layout, terminal)
  const post = METAL_POST_GEOMETRY[owner]
  const angle = layout.componentAngles?.[owner] ?? 0
  const cos = Math.cos(angle * Math.PI / 180), sin = Math.sin(angle * Math.PI / 180)
  const dx = toward.x - cap.x, dy = toward.y - cap.y
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos
  const side = localX < 0 ? -1 : 1
  const leadX = side * (post.radius + 6)
  const leadY = rounded(3 * localY / (Math.hypot(dx, dy) || 1))
  const center = { x: rounded(cap.x - post.y * sin), y: rounded(cap.y + post.y * cos) }
  return {
    terminal, center, angle,
    insulation: { x: center.x + leadX * cos - leadY * sin, y: center.y + leadX * sin + leadY * cos },
    path: `M ${leadX} ${leadY} L ${side * post.radius} 0 A ${post.radius} 2 0 0 ${side > 0 ? 1 : 0} ${-side * post.radius} 0`,
  }
}

export function wireAppearance(layout: LabLayout, from: AmmeterTerminalId, to: AmmeterTerminalId) {
  const points = wirePathPoints(layout, from, to)
  const ends = [exposedWireEnd(layout, from, points[1]), exposedWireEnd(layout, to, points[points.length - 2])]
  points[0] = ends[0].insulation
  points[points.length - 1] = ends[1].insulation
  const pair = (p: Position) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`
  const path = points.length === 2 ? `M ${pair(points[0])} L ${pair(points[1])}` : `M ${pair(points[0])} Q ${pair(points[1])} ${pair(points[2])}`
  return { path, points, ends }
}
