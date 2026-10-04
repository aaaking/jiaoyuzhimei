import type { Position } from '../../runtime/types'

export interface SpringMeterSettings {
  speed: number
  range: 1 | 5 | 10 | 20
  showTrace: boolean
  lockMode: 'ring' | 'hook' | 'none'
  magnifier: boolean
  movementButtons: boolean
  display: 'force' | 'mass'
  ownWeight: boolean
  elasticLimit: boolean
  direction: 'none' | 'left' | 'right' | 'up' | 'down'
  decimals: 1 | 2
}
export const DEFAULT_SPRING_SETTINGS: SpringMeterSettings = {
  speed: 0, range: 5, showTrace: false, lockMode: 'ring', magnifier: false,
  movementButtons: false, display: 'force', ownWeight: false, elasticLimit: false,
  direction: 'none', decimals: 2,
}
// 下端挂钩的质量为 5 g；外壳由吊环支撑，不计入弹簧读数。
export const HOOK_WEIGHT = .005 * 9.8
export const SPRING_TRAVEL = 130
export function validMeterSettings(s: SpringMeterSettings): boolean {
  return typeof s === 'object' && s !== null && Number.isFinite(s.speed) && Math.abs(s.speed) <= 100
    && [1, 5, 10, 20].includes(s.range) && ['ring', 'hook', 'none'].includes(s.lockMode)
    && ['force', 'mass'].includes(s.display) && ['none', 'left', 'right', 'up', 'down'].includes(s.direction)
    && [1, 2].includes(s.decimals)
    && ['showTrace', 'magnifier', 'movementButtons', 'ownWeight', 'elasticLimit'].every(key => typeof s[key as keyof SpringMeterSettings] === 'boolean')
}
export function formatMeterReading(force: number, settings: SpringMeterSettings): string {
  return `${(settings.display === 'mass' ? force / 9.8 * 1000 : force).toFixed(settings.decimals)} ${settings.display === 'mass' ? 'g' : 'N'}`
}

/** 每一步消耗指针位移，反向不移动；回到允许方向时无需追回旧的最远指针位置。 */
export function projectMeterDrag(position: Position, previousPointer: Position, nextPointer: Position, direction: SpringMeterSettings['direction']): Position {
  const dx = nextPointer.x - previousPointer.x
  const dy = nextPointer.y - previousPointer.y
  return {
    x: position.x + (direction === 'left' ? Math.min(0, dx) : direction === 'right' ? Math.max(0, dx) : 0),
    y: position.y + (direction === 'up' ? Math.min(0, dy) : direction === 'down' ? Math.max(0, dy) : 0),
  }
}
