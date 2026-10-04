export type LampSettings = { namePrefix: string; nameNumber: string; ratedVoltage: number; burnVoltage: number; ratedPower: number; broken: boolean; shorted: boolean; angle: number; reversed: boolean; removed: boolean }
export const LAMP_VOLTAGES = [2.5, 3, 3.8, 6, 10] as const
export const LAMP_POWERS = [0.75, 0.9, 3.6, 10] as const
export const DEFAULT_LAMP_SETTINGS: LampSettings = { namePrefix: 'L', nameNumber: '1', ratedVoltage: 3, burnVoltage: 3.13, ratedPower: 0.9, broken: false, shorted: false, angle: 0, reversed: false, removed: false }
const STORAGE_KEY = 'physics:ammeter-use:lamp-defaults:v1'
export function lampSettingsFor(state: { lampSettings?: LampSettings }): LampSettings { return state.lampSettings ?? DEFAULT_LAMP_SETTINGS }
export function lampResistance(settings: LampSettings): number { return settings.ratedVoltage ** 2 / settings.ratedPower }
export function isLampSettings(value: unknown): value is LampSettings {
  if (!value || typeof value !== 'object') return false
  const s = value as LampSettings
  return typeof s.namePrefix === 'string' && s.namePrefix.length <= 8 && typeof s.nameNumber === 'string' && s.nameNumber.length <= 8
    && LAMP_VOLTAGES.some(v => v === s.ratedVoltage) && LAMP_POWERS.some(p => p === s.ratedPower)
    && Number.isFinite(s.burnVoltage) && s.burnVoltage > 0 && Number.isFinite(s.angle)
    && typeof s.broken === 'boolean' && typeof s.shorted === 'boolean' && typeof s.reversed === 'boolean' && typeof s.removed === 'boolean'
}
export function loadLampDefaults(): LampSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isLampSettings(stored)) return { ...stored, removed: false }
  } catch { /* 存储不可用时使用实验初始值。 */ }
  return { ...DEFAULT_LAMP_SETTINGS }
}
export function saveLampDefaults(settings: LampSettings): boolean {
  if (!isLampSettings(settings)) return false
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, removed: false })); return true } catch { return false }
}
