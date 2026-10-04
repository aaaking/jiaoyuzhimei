import { AMMETER_RESISTANCE, type AmmeterTerminalId } from './definition'
import { DEFAULT_METER_SETTINGS } from './meterSettings'
import type { PracticeState } from './practiceController'
import { batterySettingsFor } from './batterySettings'
import { switchSettingsFor } from './switchSettings'
import { lampSettingsFor, lampResistance } from './lampSettings'

// 简化的直流课堂模型；导线电阻及可调电源内阻使短路可计算，不是某款干电池的标定参数。
export const WIRE_RESISTANCE = 0.02
export const SWITCH_RESISTANCE = 0.01
export const SOURCE_DAMAGE_CURRENT = 6
export const SOURCE_DAMAGE_DELAY = 3000
export const METER_DAMAGE_DELAY = 1500 // 关闭“瞬间损坏”时留出观察持续过载的窗口。
const MIN_METER_RESISTANCE = 0.001 // “0Ω”档近似理想表，保留非零电阻避免奇异方程。
const EPSILON = 1e-8

export interface PracticeCircuitAnalysis {
  current: number // 带符号的电表读数；不等同于电源总电流。
  sourceCurrent: number
  lampVoltage: number
  lampCurrent: number
  lampLit: boolean
  lampBrightness: number
  meterLoad: number // 各量程支路满偏比的总和，反接也按绝对值判断热过载。
  wireCurrents: readonly number[] // 与 state.edges 的次序一致；正值 from → to。
  error: string | null
}

type Branch = { from: AmmeterTerminalId; to: AmmeterTerminalId; resistance: number }
/** 节点电压法：含可调电源、导线、独立开关、灯泡及两量程输入支路。 */
export function solvePracticeCircuit(state: PracticeState): PracticeCircuitAnalysis {
  const empty: PracticeCircuitAnalysis = { current: 0, sourceCurrent: 0, lampVoltage: 0, lampCurrent: 0, lampLit: false, lampBrightness: 0, meterLoad: 0, wireCurrents: state.edges.map(() => 0), error: null }
  const battery = batterySettingsFor(state)
  if (state.sourceDamaged || battery.removed) return empty
  const emf = battery.voltage * (battery.reversed ? -1 : 1)
  const branches: Branch[] = state.edges.map(edge => ({ ...edge, resistance: WIRE_RESISTANCE }))
  const s1 = switchSettingsFor(state, 'S1'), s2 = switchSettingsFor(state, 'S2')
  if (state.switchClosed && !s1.broken && !s1.removed) branches.push({ from: 'switch-a', to: 'switch-b', resistance: SWITCH_RESISTANCE })
  if (state.bypassClosed && !s2.broken && !s2.removed) branches.push({ from: 'lamp2-a', to: 'lamp2-b', resistance: SWITCH_RESISTANCE })
  const lampSettings = lampSettingsFor(state)
  const filament = !state.bulbDetached && !state.lampDamaged && !lampSettings.broken && !lampSettings.shorted && !lampSettings.removed
  const lampConnected = !lampSettings.removed && (lampSettings.shorted || filament)
  const lamp = { from: 'lamp1-a', to: 'lamp1-b', resistance: lampSettings.shorted ? 0.01 : lampResistance(lampSettings) } as const
  if (lampConnected) branches.push(lamp)
  const small = { from: 'ammeter-0.6', to: 'ammeter-neg', resistance: Math.max(MIN_METER_RESISTANCE, (state.meterSettings ?? DEFAULT_METER_SETTINGS).smallResistance) } as const
  const large = { from: 'ammeter-3', to: 'ammeter-neg', resistance: AMMETER_RESISTANCE } as const
  if (!state.meterRemoved && !state.meterDamaged) branches.push(small, large)
  // 有内阻时采用诺顿等效；0Ω时固定两端电压，不用微小电阻冒充理想电源。
  if (battery.resistance > 0) branches.push({ from: 'battery+', to: 'battery-', resistance: battery.resistance })
  const connected = new Set<AmmeterTerminalId>(['battery-', 'battery+'])
  for (let changed = true; changed;) {
    changed = false
    for (const edge of branches) {
      if (connected.has(edge.from) === connected.has(edge.to)) continue
      connected.add(edge.from); connected.add(edge.to); changed = true
    }
  }
  // 未连到电源的浮空部分没有电流；不为它们生成奇异的线性方程。
  const nodes = [...connected].filter(id => id !== 'battery-')
  const indices = new Map<AmmeterTerminalId, number>(nodes.map((id, i) => [id, i]))
  const matrix = nodes.map(() => Array<number>(nodes.length + 1).fill(0))
  for (const edge of branches) {
    const a = indices.get(edge.from), b = indices.get(edge.to), g = 1 / edge.resistance
    if (a !== undefined) matrix[a][a] += g
    if (b !== undefined) matrix[b][b] += g
    if (a !== undefined && b !== undefined) { matrix[a][b] -= g; matrix[b][a] -= g }
  }
  const sourceRow = matrix[indices.get('battery+')!]
  if (battery.resistance === 0) { sourceRow.fill(0); sourceRow[indices.get('battery+')!] = 1; sourceRow[nodes.length] = emf }
  else sourceRow[nodes.length] = emf / battery.resistance
  for (let column = 0; column < nodes.length; column++) {
    let pivot = column
    for (let row = column + 1; row < nodes.length; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
    const divisor = matrix[column][column]
    for (let j = column; j <= nodes.length; j++) matrix[column][j] /= divisor
    for (let row = 0; row < nodes.length; row++) {
      if (row === column) continue
      const factor = matrix[row][column]
      for (let j = column; j <= nodes.length; j++) matrix[row][j] -= factor * matrix[column][j]
    }
  }
  const voltage = (id: AmmeterTerminalId) => indices.has(id) ? matrix[indices.get(id)!][nodes.length] : 0
  const current = (edge: Branch) => {
    const value = (voltage(edge.from) - voltage(edge.to)) / edge.resistance
    return Math.abs(value) < EPSILON ? 0 : value
  }
  const smallCurrent = state.meterRemoved || state.meterDamaged ? 0 : current(small)
  const largeCurrent = state.meterRemoved || state.meterDamaged ? 0 : current(large)
  const ratio = smallCurrent / 0.6 + largeCurrent / 3
  const lampCurrent = lampConnected ? current(lamp) : 0
  const lampVoltage = voltage(lamp.from) - voltage(lamp.to)
  const lampBrightness = filament ? Math.min(1, lampCurrent ** 2 * lamp.resistance / lampSettings.ratedPower) : 0
  return {
    current: ratio * (state.activeRange === '0.6A' ? 0.6 : 3),
    sourceCurrent: battery.resistance > 0 ? Math.abs((emf - voltage('battery+')) / battery.resistance)
      : Math.abs(branches.reduce((sum, edge) => sum + (edge.from === 'battery+' ? current(edge) : edge.to === 'battery+' ? -current(edge) : 0), 0)),
    lampVoltage, lampCurrent, lampLit: lampBrightness > 0.01, lampBrightness,
    meterLoad: Math.abs(smallCurrent) / 0.6 + Math.abs(largeCurrent) / 3,
    wireCurrents: branches.slice(0, state.edges.length).map(current), error: null,
  }
}
