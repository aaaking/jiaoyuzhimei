import type { LabAction, LabController, LabTransition } from '../../runtime/types'
import {
  TERMINAL_IDS, ammeterTerminalForRange, isAmmeterTerminal, roundToDivision,
} from './definition'
import { ammeterController, createAmmeterState, type AmmeterLabState, type CircuitEdge, type AmmeterRangeId } from './controller'
import { solvePracticeCircuit, SOURCE_DAMAGE_CURRENT } from './freeCircuit'
import { DEFAULT_METER_SETTINGS, isMeterSettings, loadMeterDefaults, type MeterSettings } from './meterSettings'
import { DEFAULT_SWITCH_SETTINGS, isSwitchId, isSwitchSettings, isSwitchSettingsMap, switchSettingsFor, type SwitchSettingsMap } from './switchSettings'

import { DEFAULT_LAMP_SETTINGS, isLampSettings, lampSettingsFor, lampResistance, loadLampDefaults, type LampSettings } from './lampSettings'
import { batterySettingsFor, DEFAULT_BATTERY_SETTINGS, isBatterySettings, loadBatteryDefaults, type BatterySettings } from './batterySettings'

// 本页面的第二件器材是旁路开关S2；沿用现有接线柱ID以保留拖动与几何接口。
export type PracticeState = AmmeterLabState & {
  bypassClosed?: boolean
  meterSettings?: MeterSettings
  meterRemoved?: boolean
  meterDamaged?: boolean
  sourceDamaged?: boolean
  lampSettings?: LampSettings
  bulbDetached?: boolean
  lampDamaged?: boolean
  batterySettings?: BatterySettings
  switches?: SwitchSettingsMap
}
const INITIAL_WIRES: readonly CircuitEdge[] = [
  { from: 'battery+', to: 'switch-a' },
  { from: 'switch-b', to: 'ammeter-3' },
  { from: 'ammeter-neg', to: 'lamp1-b' },
  { from: 'lamp1-a', to: 'battery-' },
  { from: 'lamp2-a', to: 'lamp1-a' },
  { from: 'lamp2-b', to: 'lamp1-b' },
]
const key = (edge: CircuitEdge) => [edge.from, edge.to].sort().join(':')
const uniqueEdges = (edges: readonly CircuitEdge[]) => edges.filter((edge, i) => edges.findIndex(other => key(other) === key(edge)) === i)
const terminalSet = new Set<string>(TERMINAL_IDS)
function isEdge(value: unknown): value is CircuitEdge {
  if (typeof value !== 'object' || value === null) return false
  const edge = value as CircuitEdge
  return terminalSet.has(edge.from) && terminalSet.has(edge.to) && edge.from !== edge.to
}
function wiredRange(edges: readonly CircuitEdge[]): AmmeterRangeId | null {
  const small = edges.some((edge) => edge.from === 'ammeter-0.6' || edge.to === 'ammeter-0.6')
  const large = edges.some((edge) => edge.from === 'ammeter-3' || edge.to === 'ammeter-3')
  return small ? '0.6A' : large ? '3A' : null
}

export function createPracticeState(): PracticeState {
  return {
    ...createAmmeterState(), edges: INITIAL_WIRES.map((edge) => ({ ...edge })), activeRange: '3A', bypassClosed: false,
    lampSettings: loadLampDefaults(), bulbDetached: false, lampDamaged: false,
    batterySettings: loadBatteryDefaults(),
    meterSettings: loadMeterDefaults(), meterRemoved: false, meterDamaged: false, sourceDamaged: false,
    switches: { S1: { ...DEFAULT_SWITCH_SETTINGS.S1 }, S2: { ...DEFAULT_SWITCH_SETTINGS.S2 } },
  }
}

/** 所有实际接法都交给电路求解，错误操作产生现象而不是拒绝操作。 */
export const evaluatePracticeCircuit = solvePracticeCircuit

function result(state: PracticeState, message: string, rejected = false): LabTransition<PracticeState> {
  return { state, feedback: { outcome: rejected ? 'rejected' : 'accepted', message, ...(message === state.overRangeWarning ? { presentation: 'scene' as const } : {}) } }
}
function recordCurrent(state: PracticeState): PracticeState {
  let analysis = evaluatePracticeCircuit(state)
  const lamp = lampSettingsFor(state)
  if (!state.lampDamaged && !state.bulbDetached && !lamp.removed && !lamp.broken && !lamp.shorted && Math.abs(analysis.lampVoltage) > lamp.burnVoltage) {
    state = { ...state, lampDamaged: true }
    analysis = evaluatePracticeCircuit(state)
  }
  let next = { ...state, activeTrialId: null as string | null, overRangeWarning: null as string | null }
  if (state.lampDamaged) next.overRangeWarning = '灯泡已因过压烧坏，灯丝断路；重置实验可更换器材'
  if (state.meterDamaged) next.overRangeWarning = '电流表已损坏，表内支路断路；重置实验可更换器材'
  if (state.sourceDamaged) next.overRangeWarning = '电池组已因持续严重过流损坏，停止供电；重置实验可更换器材'
  if (!state.meterDamaged && state.activeRange !== null && Math.abs(analysis.current) > 1e-8) {
    const overRange = analysis.meterLoad > 1
    const warning = overRange ? `电流 ${analysis.current.toFixed(2)} A 超过${state.activeRange}量程` : analysis.current < 0 ? '电流表反接，指针反向偏转' : null
    const trial = {
      id: `ammeter-trial-${state.trials.length + 1}`, mode: 'series' as const, position: 'main' as const,
      range: state.activeRange, reading: roundToDivision(analysis.current, state.activeRange), overRange,
      supplyVoltage: batterySettingsFor(state).voltage, lampResistance: lampResistance(lampSettingsFor(state)), wireCount: state.edges.length,
      edges: state.edges.map(edge => ({ ...edge })),
    }
    next = { ...next, activeTrialId: trial.id, trials: [...state.trials, trial], overRangeWarning: warning,
      hasTestedWithLargeRange: state.hasTestedWithLargeRange || (!overRange && analysis.current > 0 && trial.range === '3A') }
    // 过载只损坏电表并使其内支路断路；并联灯泡支路和开关位置不受人为干预。
    if (overRange && (state.meterSettings ?? DEFAULT_METER_SETTINGS).overloadDamage) {
      next = { ...next, meterDamaged: true, activeTrialId: null, overRangeWarning: `${warning}，电流表已损坏，表内支路断路` }
    }
  }
  if (evaluatePracticeCircuit(next).sourceCurrent > SOURCE_DAMAGE_CURRENT) {
    next.overRangeWarning = `电池组电流 ${evaluatePracticeCircuit(next).sourceCurrent.toFixed(2)} A，严重过流发热；持续过流会损坏电池组`
  }
  return next
}

function reduce(state: PracticeState, action: LabAction): LabTransition<PracticeState> {
  if (['setLampSettings', 'flipLamp', 'deleteLamp', 'detachBulb', 'attachBulb', 'damageLamp'].includes(action.type)) {
    if (action.type === 'setLampSettings' && !isLampSettings(action.payload)) return result(state, '灯泡设置无效', true)
    const current = lampSettingsFor(state)
    if (current.removed) return result(state, '灯座已删除，请重置实验恢复', true)
    const settings = action.type === 'setLampSettings' ? { ...action.payload as LampSettings, removed: false }
      : action.type === 'flipLamp' ? { ...current, reversed: !current.reversed }
      : action.type === 'deleteLamp' ? { ...current, removed: true } : current
    const changed = { ...state, lampSettings: settings, bulbDetached: action.type === 'detachBulb' ? true : action.type === 'attachBulb' ? false : Boolean(state.bulbDetached) }
    const electrical = settings.ratedVoltage !== current.ratedVoltage || settings.ratedPower !== current.ratedPower || settings.burnVoltage !== current.burnVoltage || settings.broken !== current.broken || settings.shorted !== current.shorted || settings.removed !== current.removed || changed.bulbDetached !== Boolean(state.bulbDetached) || action.type === 'damageLamp'
    const next = electrical ? recordCurrent(changed) : changed
    return result(next, next.overRangeWarning ?? (action.type === 'deleteLamp' ? '已删除灯泡和灯座，导线保留' : action.type === 'detachBulb' ? '已移开灯泡' : action.type === 'attachBulb' ? '已装回灯泡' : '已更新灯泡设置'))
  }
  if (action.type === 'setBatterySettings' || action.type === 'flipBattery' || action.type === 'deleteBattery') {
    if (action.type === 'setBatterySettings' && !isBatterySettings(action.payload)) return result(state, '电池组设置无效', true)
    const current = batterySettingsFor(state)
    if (current.removed) return result(state, '电池组已删除，请重置实验恢复', true)
    const settings = action.type === 'setBatterySettings' ? { ...action.payload as BatterySettings, removed: false }
      : action.type === 'flipBattery' ? { ...current, reversed: !current.reversed } : { ...current, removed: true }
    const changed = { ...state, batterySettings: settings }
    const next = settings.voltage !== current.voltage || settings.resistance !== current.resistance || settings.reversed !== current.reversed || settings.removed !== current.removed ? recordCurrent(changed) : changed
    return result(next, next.overRangeWarning ?? (action.type === 'deleteBattery' ? '已删除电池组，导线保留' : '已更新电池组设置'))
  }
  if (action.type === 'setSwitchSettings' || action.type === 'flipSwitch' || action.type === 'deleteSwitch') {
    const payload = action.payload as { id?: unknown; settings?: unknown } | undefined
    const id = action.type === 'setSwitchSettings' ? payload?.id : action.payload
    if (!isSwitchId(id) || (action.type === 'setSwitchSettings' && !isSwitchSettings(payload?.settings))) return result(state, '开关设置无效', true)
    const current = switchSettingsFor(state, id)
    if (current.removed) return result(state, '开关已删除，请重置实验恢复', true)
    const settings = action.type === 'setSwitchSettings' ? { ...payload!.settings as typeof current, removed: false }
      : action.type === 'flipSwitch' ? { ...current, reversed: !current.reversed } : { ...current, removed: true }
    const switches = { S1: switchSettingsFor(state, 'S1'), S2: switchSettingsFor(state, 'S2'), [id]: settings }
    const changed = { ...state, switches }
    const next = settings.broken !== current.broken || settings.removed !== current.removed ? recordCurrent(changed) : changed
    return result(next, next.overRangeWarning ?? (action.type === 'deleteSwitch' ? `已删除${id}开关，导线保留` : '已更新开关设置'))
  }
  if (action.type === 'setMeterSettings') {
    if (!isMeterSettings(action.payload)) return result(state, '电流表设置无效', true)
    const changed = { ...state, meterSettings: { ...action.payload } }
    const resistanceChanged = changed.meterSettings.smallResistance !== (state.meterSettings ?? DEFAULT_METER_SETTINGS).smallResistance
    const willDamage = changed.meterSettings.overloadDamage && evaluatePracticeCircuit(changed).meterLoad > 1
    const next = resistanceChanged || willDamage ? recordCurrent(changed) : changed
    return result(next, next.overRangeWarning ?? '已更新电流表设置')
  }
  if (action.type === 'damageMeter') {
    if (evaluatePracticeCircuit(state).meterLoad <= 1) return result(state, '电流表未持续过载')
    const next = { ...state, meterDamaged: true, activeTrialId: null, overRangeWarning: '电流表因持续过载损坏，表内支路断路；重置实验可更换器材' }
    return result(next, next.overRangeWarning)
  }
  if (action.type === 'damageSource') {
    if (evaluatePracticeCircuit(state).sourceCurrent <= SOURCE_DAMAGE_CURRENT) return result(state, '电池组未持续过流')
    const next = recordCurrent({ ...state, sourceDamaged: true })
    return result(next, next.overRangeWarning!)
  }
  if (action.type === 'deleteMeter') return result(recordCurrent({
    ...state, meterRemoved: true, edges: state.edges.filter((edge) => !isAmmeterTerminal(edge.from) && !isAmmeterTerminal(edge.to)),
    activeRange: null, activeTrialId: null,
  }), '已删除电流表及相关导线')
  if (action.type === 'resetTrial') return result(recordCurrent({ ...state, switchClosed: false, bypassClosed: false, edges: [], activeRange: null, activeTrialId: null }), '已断开两只开关并清空接线，可重新连接')
  if (state.meterRemoved && (action.type === 'setRange'
    || (action.type === 'connect' && isEdge(action.payload) && (isAmmeterTerminal(action.payload.from) || isAmmeterTerminal(action.payload.to))))) {
    return result(state, '电流表已删除，请重置实验恢复', true)
  }
  if (action.type === 'dragStart') return result(state, '把导线拖到目标接线柱')
  if (action.type === 'setSwitch' || action.type === 'setBypassSwitch') {
    if (switchSettingsFor(state, action.type === 'setSwitch' ? 'S1' : 'S2').removed) return result(state, '开关已删除，请重置实验恢复', true)
    if (action.payload !== 'open' && action.payload !== 'closed') return result(state, '开关状态无效', true)
    const field = action.type === 'setSwitch' ? 'switchClosed' : 'bypassClosed'
    const next = { ...state, [field]: action.payload === 'closed' }
    const recorded = recordCurrent(next)
    const analysis = evaluatePracticeCircuit(recorded)
    const transition = result(recorded, recorded.overRangeWarning ?? `${field === 'switchClosed' ? 'S1主开关' : 'S2旁路开关'}已${action.payload === 'closed' ? '闭合' : '断开'}${analysis.sourceCurrent < 1e-8 ? '，当前无电流' : analysis.lampLit ? '，灯泡发光' : '，电流表过载'}`)
    return { ...transition, feedback: { ...transition.feedback, presentation: 'scene' } }
  }
  if (action.type === 'rewire') {
    const payload = action.payload as { edge?: unknown; endpoint?: unknown; target?: unknown } | undefined
    if (!payload || !isEdge(payload.edge) || typeof payload.endpoint !== 'string' || typeof payload.target !== 'string'
      || !terminalSet.has(payload.target)) return result(state, '重新接线的端点无效', true)
    if ((payload.target.startsWith('switch-') && switchSettingsFor(state, 'S1').removed) || (payload.target.startsWith('lamp2-') && switchSettingsFor(state, 'S2').removed)) return result(state, '该开关已删除，请连接现有接线柱', true)
    if (payload.target.startsWith('lamp1-') && lampSettingsFor(state).removed) return result(state, '灯座已删除，请连接现有接线柱', true)
    if (payload.target.startsWith('battery') && batterySettingsFor(state).removed) return result(state, '电池组已删除，请连接现有接线柱', true)
    const index = state.edges.findIndex((edge) => key(edge) === key(payload.edge as CircuitEdge))
    const original = state.edges[index]
    if (!original || (original.from !== payload.endpoint && original.to !== payload.endpoint)) return result(state, '请先选择这个接线柱上的导线', true)
    const replacement = { from: original.from === payload.endpoint ? payload.target : original.from, to: original.to === payload.endpoint ? payload.target : original.to } as CircuitEdge
    if (!isEdge(replacement)) return result(state, '导线必须连接两个不同的接线柱', true)
    if (state.meterRemoved && (isAmmeterTerminal(replacement.from) || isAmmeterTerminal(replacement.to))) return result(state, '电流表不可接线，请重置实验恢复', true)
    // 原子替换端点；只检查端点有效性，物理后果由新回路计算。
    const updated = state.edges.map((edge, i) => i === index ? replacement : edge)
    const edges = uniqueEdges(updated)
    const next = { ...state, edges, activeRange: wiredRange(edges), activeTrialId: null }
    const recorded = recordCurrent(next)
    return result(recorded, recorded.overRangeWarning ?? '已调整导线连接')
  }
  if (action.type === 'connect' || action.type === 'disconnect') {
    if (!isEdge(action.payload)) return result(state, '导线必须连接两个不同的接线柱', true)
    const edge = action.payload
    if (action.type === 'connect' && lampSettingsFor(state).removed && [edge.from, edge.to].some(id => id.startsWith('lamp1-'))) return result(state, '灯座已删除，请连接现有接线柱', true)
    if (action.type === 'connect' && batterySettingsFor(state).removed && [edge.from, edge.to].some(id => id.startsWith('battery'))) return result(state, '电池组已删除，请连接现有接线柱', true)
    if (action.type === 'connect' && [edge.from, edge.to].some(id => (id.startsWith('switch-') && switchSettingsFor(state, 'S1').removed) || (id.startsWith('lamp2-') && switchSettingsFor(state, 'S2').removed))) return result(state, '该开关已删除，请连接现有接线柱', true)
    if (action.type === 'connect' && state.edges.some(wire => key(wire) === key(edge))) return result(state, '这两个接线柱已连接')
    const edges = action.type === 'connect' ? [...state.edges, edge] : state.edges.filter((wire) => key(wire) !== key(edge))
    const next = { ...state, edges, activeRange: wiredRange(edges), activeTrialId: null }
    const recorded = recordCurrent(next)
    return result(recorded, recorded.overRangeWarning ?? (action.type === 'connect' ? '已接好导线' : '已拆下导线'))
  }
  if (action.type === 'setRange') {
    if (action.payload !== '0.6A' && action.payload !== '3A') return result(state, '量程无效', true)
    const target = ammeterTerminalForRange(action.payload)
    const other = target === 'ammeter-3' ? 'ammeter-0.6' : 'ammeter-3'
    const edges = uniqueEdges(state.edges.map((edge) => ({ from: edge.from === other ? target : edge.from, to: edge.to === other ? target : edge.to })))
    const next = recordCurrent({ ...state, edges, activeRange: wiredRange(edges), activeTrialId: null })
    return result(next, next.overRangeWarning ?? `已换接到${action.payload}量程`)
  }
  if (action.type === 'dragCancel') return result(state, '已取消接线')
  return result(state, '不支持的实验操作', true)
}

function completedInOrder(state: PracticeState): boolean {
  const large = state.trials.findIndex((trial) => trial.range === '3A' && !trial.overRange && trial.reading > 0)
  return large >= 0 && state.trials.slice(large + 1).some((trial) => trial.range === '0.6A' && !trial.overRange && trial.reading > 0)
}

const SCHEMA = 'ammeter-practice-v1'
export const practiceController: LabController<PracticeState> = {
  ...ammeterController,
  createInitialState: createPracticeState,
  createResetState: () => ({
    ...createPracticeState(), lampSettings: { ...DEFAULT_LAMP_SETTINGS },
    batterySettings: { ...DEFAULT_BATTERY_SETTINGS }, meterSettings: { ...DEFAULT_METER_SETTINGS },
  }),
  reduce,
  snapshot: (state) => ({
    lampSettings: { ...lampSettingsFor(state) }, bulbDetached: Boolean(state.bulbDetached), lampDamaged: Boolean(state.lampDamaged),
    batterySettings: { ...batterySettingsFor(state) },
    schema: SCHEMA, bypassClosed: Boolean(state.bypassClosed),
    meterSettings: { ...(state.meterSettings ?? DEFAULT_METER_SETTINGS) }, meterRemoved: Boolean(state.meterRemoved), meterDamaged: Boolean(state.meterDamaged), sourceDamaged: Boolean(state.sourceDamaged),
    switches: { S1: { ...switchSettingsFor(state, 'S1') }, S2: { ...switchSettingsFor(state, 'S2') } },
    ...ammeterController.snapshot(state) as Record<string, import('../../sessions/types').JsonValue>,
  }),
  restore: (value) => {
    if (typeof value !== 'object' || value === null) return createPracticeState()
    const stored = value as Record<string, unknown>
    if (stored.schema !== SCHEMA || !Array.isArray(stored.edges) || !stored.edges.every(isEdge)
      || typeof stored.switchClosed !== 'boolean' || typeof stored.bypassClosed !== 'boolean'
      || !Array.isArray(stored.trials) || typeof stored.hasTestedWithLargeRange !== 'boolean') return createPracticeState()
    if ((stored.lampSettings !== undefined && !isLampSettings(stored.lampSettings))
      || (stored.bulbDetached !== undefined && typeof stored.bulbDetached !== 'boolean')
      || (stored.lampDamaged !== undefined && typeof stored.lampDamaged !== 'boolean')
      || (stored.batterySettings !== undefined && !isBatterySettings(stored.batterySettings))
      || (stored.meterSettings !== undefined && !isMeterSettings(stored.meterSettings))
      || (stored.meterRemoved !== undefined && typeof stored.meterRemoved !== 'boolean')
      || (stored.meterDamaged !== undefined && typeof stored.meterDamaged !== 'boolean')
      || (stored.switches !== undefined && !isSwitchSettingsMap(stored.switches))
      || (stored.sourceDamaged !== undefined && typeof stored.sourceDamaged !== 'boolean')) return createPracticeState()
    const state = {
      ...stored, lampSettings: stored.lampSettings ?? { ...DEFAULT_LAMP_SETTINGS }, bulbDetached: stored.bulbDetached ?? false, lampDamaged: stored.lampDamaged ?? false, batterySettings: stored.batterySettings ?? { ...DEFAULT_BATTERY_SETTINGS }, meterSettings: stored.meterSettings ?? { ...DEFAULT_METER_SETTINGS },
      meterRemoved: stored.meterRemoved ?? false, meterDamaged: stored.meterDamaged ?? false, sourceDamaged: stored.sourceDamaged ?? false,
      switches: stored.switches ?? { S1: { ...DEFAULT_SWITCH_SETTINGS.S1 }, S2: { ...DEFAULT_SWITCH_SETTINGS.S2 } },
    } as unknown as PracticeState
    if (state.meterRemoved && state.edges.some((edge) => isAmmeterTerminal(edge.from) || isAmmeterTerminal(edge.to))) return createPracticeState()
    if (state.activeRange !== wiredRange(state.edges) || (state.activeRange !== null && state.activeRange !== '3A' && state.activeRange !== '0.6A')
      || !state.trials.every((trial) => trial && typeof trial.id === 'string' && Number.isFinite(trial.reading)
        && (trial.range === '3A' || trial.range === '0.6A') && Array.isArray(trial.edges) && trial.edges.every(isEdge))
      || (state.activeTrialId !== null && !state.trials.some((trial) => trial.id === state.activeTrialId))
      || evaluatePracticeCircuit(state).error) return createPracticeState()
    const restored = { ...state } as Record<string, unknown>
    delete restored.schema
    return restored as unknown as PracticeState
  },
  completion: (state) => ({
    complete: completedInOrder(state),
    message: completedInOrder(state)
      ? '已完成大量程试触和小量程精读' : '先用3A量程试触，再断开S1，换接0.6A量程并读数',
  }),
}
