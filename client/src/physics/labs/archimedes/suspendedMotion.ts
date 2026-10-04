import { useEffect, useRef, useState } from 'react'
import type { Position } from '../../runtime/types'
import { GRAVITY } from './gravity'

export function createSwing(pivot: Position) { return { pivot, pivotSpeed: 0, angle: 0, velocity: 0 } }
export function stepSwing(swing: ReturnType<typeof createSwing>, pivot: Position, length: number, dt: number, limit = .45, damping = 1.7) {
  const speed = Math.max(-800, Math.min(800, (pivot.x - swing.pivot.x) / dt))
  let velocity = swing.velocity + (speed - swing.pivotSpeed) / length * Math.cos(swing.angle)
  velocity += (-GRAVITY / length * Math.sin(swing.angle) - damping * velocity) * dt
  let angle = swing.angle + velocity * dt
  if (Math.abs(angle) > limit) { angle = Math.sign(angle) * limit; velocity = 0 }
  if (speed === 0 && Math.abs(angle) < .0001 && Math.abs(velocity) < .0005) { angle = 0; velocity = 0 }
  return { pivot, pivotSpeed: speed, angle, velocity }
}
export function rotatedLoadPosition(position: Position, pivot: Position, angle: number) {
  const dx = position.x - pivot.x, dy = position.y - pivot.y
  return { x: pivot.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: pivot.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
}

export function useSuspendedSwing(subject: 'object' | 'bucket' | null, pivot: Position, enabled: boolean, limit: number, damping: number) {
  const { x, y } = pivot
  const latest = useRef({ pivot, limit })
  const [view, setView] = useState({ subject, angle: 0 })
  useEffect(() => { latest.current = { pivot: { x, y }, limit } }, [x, y, limit])
  useEffect(() => {
    if (!subject || !enabled) return
    let swing = createSwing(latest.current.pivot)
    let previousTime: number | null = null
    let frame = 0
    const animate = (time: number) => {
      const dt = Math.min(.05, Math.max(.001, previousTime === null ? 1 / 60 : (time - previousTime) / 1000))
      previousTime = time
      swing = stepSwing(swing, latest.current.pivot, subject === 'object' ? 119 : 111, dt, latest.current.limit, damping)
      const angle = swing.angle
      setView(old => old.subject === subject && old.angle === angle ? old : { subject, angle })
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(frame); setView({ subject: null, angle: 0 }) }
  }, [subject, enabled, damping])
  return enabled && view.subject === subject ? view.angle : 0
}
