export type BatterySettings = { namePrefix: string; nameNumber: string; resistance: number; voltage: number; angle: number; reversed: boolean; removed: boolean }
export const BATTERY_RESISTANCES = [0, 0.1, 0.2, 0.5, 1, 2] as const
export const BATTERY_VOLTAGES = [1.5, 3, 4.5, 6] as const
export const DEFAULT_BATTERY_SETTINGS: BatterySettings = { namePrefix: 'E', nameNumber: '1', resistance: 0.2, voltage: 3, angle: 0, reversed: false, removed: false }
const STORAGE_KEY = 'physics:ammeter-use:battery-defaults:v1'
export function batterySettingsFor(state: { batterySettings?: BatterySettings }): BatterySettings { return state.batterySettings ?? DEFAULT_BATTERY_SETTINGS }
export function isBatterySettings(value: unknown): value is BatterySettings {
  if (!value || typeof value !== 'object') return false
  const s = value as BatterySettings
  return typeof s.namePrefix === 'string' && s.namePrefix.length <= 8 && typeof s.nameNumber === 'string' && s.nameNumber.length <= 8
    && BATTERY_RESISTANCES.some(r => r === s.resistance) && BATTERY_VOLTAGES.some(v => v === s.voltage)
    && Number.isFinite(s.angle) && typeof s.reversed === 'boolean' && typeof s.removed === 'boolean'
}
export function loadBatteryDefaults(): BatterySettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isBatterySettings(stored)) return { ...stored, removed: false }
  } catch { /* 存储不可用时使用实验初始值。 */ }
  return { ...DEFAULT_BATTERY_SETTINGS }
}
export function saveBatteryDefaults(settings: BatterySettings): boolean {
  if (!isBatterySettings(settings)) return false
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, removed: false })); return true } catch { return false }
}
