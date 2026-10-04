import { OBJECT_VOLUME } from './definition'

export const OBJECT_MATERIALS = {
  copper: { label: '铜块', density: 9, fill: 'url(#arch-gold)', top: '#ddba43' },
  iron: { label: '铁块', density: 7.8, fill: 'url(#arch-metal)', top: '#b3bab4' },
  aluminum: { label: '铝块', density: 2.7, fill: 'url(#arch-aluminum)', top: '#e5edf0' },
  wood: { label: '木块', density: .6, fill: 'url(#arch-leg)', top: '#d6a15b' },
} as const
export type ObjectMaterial = keyof typeof OBJECT_MATERIALS
export interface ObjectSettings { material: ObjectMaterial; showScale: boolean; sway: boolean; wetting: boolean }
export const DEFAULT_OBJECT_SETTINGS: ObjectSettings = { material: 'copper', showScale: false, sway: true, wetting: false }
export function validObjectSettings(value: unknown): value is ObjectSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as ObjectSettings
  return Object.hasOwn(OBJECT_MATERIALS, settings.material) && ['showScale', 'sway', 'wetting'].every(key => typeof settings[key as keyof ObjectSettings] === 'boolean')
}
export function objectGravity(settings: ObjectSettings) { return OBJECT_VOLUME * OBJECT_MATERIALS[settings.material].density * .0098 }
