import { useRef } from 'react'
import { PART_GEOMETRY } from './RealisticParts'

/** 闸刀和握柄共用开合命中区；底座用于摆位，接线帽热区保持独立。 */
export default function SwitchHandle({ id, x, y, closed, reversed = false, angle = 0, onToggle }: {
  id: 'S1' | 'S2'; x: number; y: number; closed: boolean; reversed?: boolean; angle?: number; onToggle(): void
}) {
  const gesture = useRef({ x: 0, y: 0, moved: false })
  const part = PART_GEOMETRY.switch
  const vertices = closed
    ? [[450, 490], [1370, 485], [1370, 450], [1715, 450], [1715, 612], [550, 612], [450, 590]]
    : [[470, 500], [1280, 172], [1580, 43], [1645, 228], [1330, 310], [550, 595]]
  const radians = angle * Math.PI / 180
  const points = vertices.map(([px, py]) => {
    const dx = (px - part.anchorX) * part.scale * (reversed ? -1 : 1), dy = (py - part.anchorY) * part.scale
    return `${x + dx * Math.cos(radians) - dy * Math.sin(radians)},${y + dx * Math.sin(radians) + dy * Math.cos(radians)}`
  }).join(' ')
  return <polygon
    data-switch-handle={id} data-canvas-pan-block points={points} fill="transparent"
    role="button" tabIndex={0} aria-label={`${closed ? '断开' : '闭合'}${id}开关闸刀或把手`} className="cursor-pointer outline-none"
    onPointerDown={(event) => {
      event.stopPropagation()
      if (event.button !== 0) return
      gesture.current = { x: event.clientX, y: event.clientY, moved: false }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }}
    onPointerMove={(event) => {
      if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 4) gesture.current.moved = true
    }}
    onPointerUp={(event) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={() => { gesture.current.moved = true }}
    onClick={(event) => { if (event.button === 0 && !gesture.current.moved) onToggle() }}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle() } }}
  ><title>{`点击闸刀或把手${closed ? '断开' : '闭合'}开关`}</title></polygon>
}
