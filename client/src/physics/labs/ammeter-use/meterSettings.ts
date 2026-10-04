export type MeterSettings = {
  namePrefix: string
  nameNumber: string
  overloadDamage: boolean
  showGraph: boolean
  smallResistance: 0 | 0.5 | 1 | 2 | 5
  decimals: 1 | 2 | 3
}
export const DEFAULT_METER_SETTINGS: MeterSettings = {
  namePrefix: 'A', nameNumber: '1', overloadDamage: true, showGraph: false, smallResistance: 0, decimals: 2,
}
const STORAGE_KEY = 'physics:ammeter-use:meter-defaults:v1'

export function isMeterSettings(value: unknown): value is MeterSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as MeterSettings
  return typeof settings.namePrefix === 'string' && typeof settings.nameNumber === 'string'
    && typeof settings.overloadDamage === 'boolean' && typeof settings.showGraph === 'boolean'
    && [0, 0.5, 1, 2, 5].includes(settings.smallResistance)
    && [1, 2, 3].includes(settings.decimals)
}

export function loadMeterDefaults(): MeterSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isMeterSettings(stored)) return { ...stored }
  } catch { /* 存储不可用或损坏时使用器材默认值。 */ }
  return { ...DEFAULT_METER_SETTINGS }
}

export function saveMeterDefaults(settings: MeterSettings): boolean {
  if (!isMeterSettings(settings)) return false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    return true
  } catch { return false }
}
