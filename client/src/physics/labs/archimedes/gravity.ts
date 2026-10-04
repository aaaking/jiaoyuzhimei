import type { ArchimedesState } from './controller'
import { CUP_BOTTOM, ML_HEIGHT, OBJECT_HEIGHT, OBJECT_VOLUME } from './definition'
import { OBJECT_MATERIALS } from './objectSettings'

export type FallingApparatus = 'cup' | 'bucket' | 'object'
export const FALLING_APPARATUS: FallingApparatus[] = ['cup', 'bucket', 'object']
export const GROUND_Y = 714
const BOTTOM = { cup: 280, bucket: 112, object: OBJECT_HEIGHT }
const TABLE_Y = { cup: 490, bucket: 490, object: 493 }
export const GRAVITY = 1000 // 画布单位/s²，仅用于松手后的视觉运动。

export function fallTarget(state: Pick<ArchimedesState, 'positions' | 'cupRemoved' | 'bucketRemoved' | 'bucketLocked' | 'objectRemoved' | 'attached' | 'objectSettings' | 'cupTetherLength' | 'liquidVolume'>, subject: FallingApparatus): number | null {
  if ((subject === 'cup' && state.cupRemoved) || (subject === 'bucket' && (state.bucketRemoved || state.bucketLocked)) || (subject === 'object' && state.objectRemoved) || state.attached === subject) return null
  const p = state.positions[subject]
  if (subject === 'object' && !state.cupRemoved && Math.abs(p.x - state.positions.cup.x) <= 76 && p.y < state.positions.cup.y + CUP_BOTTOM) {
    const bottom = state.positions.cup.y + CUP_BOTTOM
    const density = OBJECT_MATERIALS[state.objectSettings.material].density
    if (density < 1 && state.liquidVolume > 0) {
      const floatY = bottom - (state.liquidVolume + density * OBJECT_VOLUME) * ML_HEIGHT - OBJECT_HEIGHT * (1 - density)
      const tetherY = state.cupTetherLength === null ? -Infinity : bottom - Math.sqrt(state.cupTetherLength ** 2 - (p.x - state.positions.cup.x) ** 2) + 14
      return Math.min(bottom - OBJECT_HEIGHT, Math.max(floatY, tetherY))
    }
    return bottom - OBJECT_HEIGHT
  }
  const surface = p.x >= 62 && p.x <= 607 && p.y + BOTTOM[subject] <= TABLE_Y[subject] + .001 ? TABLE_Y[subject] : GROUND_Y
  return surface - BOTTOM[subject]
}
