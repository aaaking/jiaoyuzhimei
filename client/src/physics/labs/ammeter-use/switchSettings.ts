export type SwitchId = 'S1' | 'S2'
export type SwitchSettings = { namePrefix: string; nameNumber: string; reversed: boolean; broken: boolean; angle: number; removed: boolean }
export type SwitchSettingsMap = Record<SwitchId, SwitchSettings>

export const DEFAULT_SWITCH_SETTINGS: SwitchSettingsMap = {
  S1: { namePrefix: 'S', nameNumber: '1', reversed: false, broken: false, angle: 0, removed: false },
  S2: { namePrefix: 'S', nameNumber: '2', reversed: false, broken: false, angle: 0, removed: false },
}
export function switchSettingsFor(state: { switches?: SwitchSettingsMap }, id: SwitchId): SwitchSettings {
  return state.switches?.[id] ?? DEFAULT_SWITCH_SETTINGS[id]
}
export function isSwitchId(value: unknown): value is SwitchId { return value === 'S1' || value === 'S2' }
export function isSwitchSettings(value: unknown): value is SwitchSettings {
  if (!value || typeof value !== 'object') return false
  const s = value as SwitchSettings
  return typeof s.namePrefix === 'string' && s.namePrefix.length <= 8 && typeof s.nameNumber === 'string' && s.nameNumber.length <= 8
    && typeof s.reversed === 'boolean' && typeof s.broken === 'boolean' && typeof s.removed === 'boolean' && Number.isFinite(s.angle)
}
export function isSwitchSettingsMap(value: unknown): value is SwitchSettingsMap {
  if (!value || typeof value !== 'object') return false
  const s = value as SwitchSettingsMap
  return isSwitchSettings(s.S1) && isSwitchSettings(s.S2)
}
