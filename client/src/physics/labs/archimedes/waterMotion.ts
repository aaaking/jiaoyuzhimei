import type { ArchimedesState } from './controller'
import type { Position } from '../../runtime/types'
import { GROUND_Y } from './gravity'
import { BUCKET_CAPACITY, HOOK_Y } from './definition'
import { rotatedLoadPosition } from './suspendedMotion'

export const POUR_DURATION = 2.3
export function bucketWaterY(state: ArchimedesState) {
  return state.positions.bucket.y + 110 - state.collectedVolume / BUCKET_CAPACITY * 105
}
export function bucketCatches(state: ArchimedesState) {
  return !state.bucketRemoved && !state.bucketPour && state.attached !== 'bucket'
    && Math.abs(state.positions.bucket.x - state.positions.cup.x - 165) <= 44
    && state.positions.bucket.y > state.positions.cup.y + 100
}
export function pourRemaining(volume: number, elapsed: number) {
  const progress = Math.max(0, Math.min(1, (elapsed - .35) / 1.15))
  return volume * (1 - progress ** 2)
}
export function pourGeometry(state: ArchimedesState) {
  const p = state.positions.bucket
  const elapsed = state.bucketPour?.elapsed ?? 0
  const progress = elapsed <= 1.5 ? Math.min(1, elapsed / 1.1) : Math.max(0, (POUR_DURATION - elapsed) / .8)
  const angle = progress * 80 * Math.PI / 180 * (state.attached === 'bucket' ? -1 : 1)
  const pivot = state.attached === 'bucket' ? { x: state.positions.meter.x, y: state.positions.meter.y + HOOK_Y } : { x: p.x + 38, y: p.y + 112 }
  const lip = rotatedLoadPosition({ x: p.x + (state.attached === 'bucket' ? -50 : 50), y: p.y }, pivot, angle)
  return { angle, pivot, lip, transform: `rotate(${angle * 180 / Math.PI} ${pivot.x} ${pivot.y})` }
}
export function spillSurface(start: Position) {
  return { x: start.x, y: start.x >= 62 && start.x <= 607 && start.y < 490 ? 490 : GROUND_Y }
}
