import { describe, expect, it } from 'vitest'
import { createPracticeState, evaluatePracticeCircuit, practiceController, type PracticeState } from './practiceController'
import { currentWireDirections } from './currentFlow'
import { wireKey } from './layout'
import type { CircuitEdge } from './controller'

const connect = (state: ReturnType<typeof createPracticeState>, from: CircuitEdge['from'], to: CircuitEdge['to']) => practiceController.reduce(state, { type: 'connect', payload: { from, to } })
describe('自由实验：行为由电路决定，而非教学规则阻止', () => {
  it('用户截图的回路绕过S1，补上最后一根线立即通电；拆线立即断电', () => {
    let state: PracticeState = { ...createPracticeState(), edges: [
      { from: 'battery+', to: 'ammeter-3' }, { from: 'ammeter-neg', to: 'lamp2-b' },
      { from: 'lamp2-a', to: 'lamp1-a' }, { from: 'lamp1-a', to: 'battery-' },
    ] as CircuitEdge[] }
    const closed = connect(state, 'lamp1-b', 'lamp2-b')
    expect(closed.feedback.outcome).toBe('accepted')
    state = closed.state
    expect(state.switchClosed).toBe(false)
    expect(evaluatePracticeCircuit(state).current).toBeGreaterThan(0)
    expect(evaluatePracticeCircuit(state).lampLit).toBe(true)
    expect(state.trials).toHaveLength(1)
    const off = practiceController.reduce(state, { type: 'disconnect', payload: state.edges.at(-1) })
    expect(off.feedback.outcome).toBe('accepted')
    expect(evaluatePracticeCircuit(off.state).current).toBeCloseTo(0)
    expect(evaluatePracticeCircuit(off.state).lampLit).toBe(false)
  })
  it('带电拖动、换量程和拆接线不自动扳动开关', () => {
    const on = practiceController.reduce(createPracticeState(), { type: 'setSwitch', payload: 'closed' }).state
    expect(practiceController.reduce(on, { type: 'dragStart' }).state).toBe(on)
    const ranged = practiceController.reduce(on, { type: 'setRange', payload: '0.6A' })
    expect(ranged.feedback.outcome).toBe('accepted')
    expect(ranged.state.switchClosed).toBe(true)
    const off = practiceController.reduce(ranged.state, { type: 'disconnect', payload: ranged.state.edges[0] })
    expect(off.feedback.outcome).toBe('accepted')
    expect(off.state.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(off.state).current).toBeCloseTo(0)
  })
  it('反接电流表显示负值，灯泡发光，箭头仍从电源正极流向负极', () => {
    const initial = createPracticeState()
    const swap = (id: CircuitEdge['from']): CircuitEdge['from'] => id === 'ammeter-3' ? 'ammeter-neg' : id === 'ammeter-neg' ? 'ammeter-3' : id
    const edges = initial.edges.map(edge => ({ from: swap(edge.from), to: swap(edge.to) }))
    const on = practiceController.reduce({ ...initial, edges }, { type: 'setSwitch', payload: 'closed' })
    expect(on.feedback.outcome).toBe('accepted')
    expect(evaluatePracticeCircuit(on.state).current).toBeLessThan(0)
    expect(evaluatePracticeCircuit(on.state).lampLit).toBe(true)
    expect(currentWireDirections(on.state).get(wireKey('switch-b', 'ammeter-neg'))).toBe(1)
  })
  it('没有电表的灯泡回路仍通电，电表读数为零', () => {
    const state = { ...createPracticeState(), edges: [{ from: 'battery+', to: 'lamp1-a' }, { from: 'lamp1-b', to: 'battery-' }] as CircuitEdge[], activeRange: null }
    const analysis = evaluatePracticeCircuit(state)
    expect(analysis.error).toBeNull()
    expect(analysis.current).toBeCloseTo(0)
    expect(analysis.lampLit).toBe(true)
    expect(currentWireDirections(state).size).toBe(2)
  })
  it('闭合S2造成过载仍允许操作，保留接线和开关位置，表内熔断', () => {
    const on = practiceController.reduce(createPracticeState(), { type: 'setSwitch', payload: 'closed' }).state
    const short = practiceController.reduce(on, { type: 'setBypassSwitch', payload: 'closed' })
    expect(short.feedback.outcome).toBe('accepted')
    expect(short.state.switchClosed).toBe(true)
    expect(short.state.bypassClosed).toBe(true)
    expect(short.state.meterDamaged).toBe(true)
    expect(short.state.edges).toEqual(on.edges)
    expect(short.state.trials.at(-1)?.overRange).toBe(true)
    expect(evaluatePracticeCircuit(short.state).current).toBeCloseTo(0)
  })
  it('损坏表内支路断路，独立并联的灯泡支路仍有电', () => {
    let state: PracticeState = { ...createPracticeState(), edges: [
      { from: 'battery+', to: 'lamp1-a' }, { from: 'lamp1-b', to: 'battery-' },
      { from: 'battery+', to: 'ammeter-3' },
    ] as CircuitEdge[] }
    state = connect(state, 'ammeter-neg', 'battery-').state
    expect(state.meterDamaged).toBe(true)
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(0)
    expect(evaluatePracticeCircuit(state).lampLit).toBe(true)
    expect(currentWireDirections(state).size).toBe(2)
    expect(connect(state, 'ammeter-0.6', 'lamp2-a').feedback.outcome).toBe('accepted')
    expect(practiceController.restore(practiceController.snapshot(state))).toEqual(state)
  })
  it('电源直接短路有有限电流和动画，持续发热后损坏但接线保留', () => {
    const initial = { ...createPracticeState(), edges: [] as CircuitEdge[], activeRange: null }
    const short = connect(initial, 'battery+', 'battery-')
    expect(short.feedback.outcome).toBe('accepted')
    const analysis = evaluatePracticeCircuit(short.state)
    expect(Number.isFinite(analysis.sourceCurrent)).toBe(true)
    expect(analysis.sourceCurrent).toBeGreaterThan(10)
    expect(currentWireDirections(short.state).size).toBe(1)
    const damaged = practiceController.reduce(short.state, { type: 'damageSource' }).state
    expect(damaged.sourceDamaged).toBe(true)
    expect(evaluatePracticeCircuit(damaged).sourceCurrent).toBe(0)
    expect(damaged.edges).toEqual(short.state.edges)
    expect(practiceController.restore(practiceController.snapshot(damaged))).toEqual(damaged)
    expect(practiceController.reduce(damaged, { type: 'resetTrial' }).state.sourceDamaged).toBe(true)
    expect(createPracticeState().sourceDamaged).toBe(false)
  })
  it('无严重过流时过期损坏事件不能破坏电池', () => {
    const state = createPracticeState()
    expect(practiceController.reduce(state, { type: 'damageSource' }).state).toBe(state)
  })
  it('两量程柱同时接线可以保留并计算，不拒绝', () => {
    const state = { ...createPracticeState(), meterSettings: { ...createPracticeState().meterSettings!, overloadDamage: false } }
    const next = connect(state, 'ammeter-0.6', 'switch-b')
    expect(next.feedback.outcome).toBe('accepted')
    expect(next.state.edges).toHaveLength(7)
    const on = practiceController.reduce(next.state, { type: 'setSwitch', payload: 'closed' })
    expect(on.feedback.outcome).toBe('accepted')
    expect(Number.isFinite(evaluatePracticeCircuit(on.state).current)).toBe(true)
    expect(evaluatePracticeCircuit(on.state).lampLit).toBe(true)
  })
})


describe('直流近似模型的数值不变量', () => {
  it('正常串联回路遵守包含电池、导线和开关内阻的欧姆定律', () => {
    const on = { ...createPracticeState(), switchClosed: true }
    const analysis = evaluatePracticeCircuit(on)
    const expected = 3 / (10 + 0.1 + 0.2 + 4 * 0.02 + 0.01)
    expect(analysis.current).toBeCloseTo(expected, 8)
    expect(analysis.sourceCurrent).toBeCloseTo(expected, 8)
    expect(Math.abs(analysis.lampCurrent)).toBeCloseTo(expected, 8)
    for (const value of analysis.wireCurrents.slice(0, 4)) expect(value).toBeCloseTo(expected, 8)
    expect(analysis.wireCurrents.slice(4)).toEqual([0, 0])
  })
  it('灯泡和电表并联时支路电流之和等于电源电流，开路悬空部分没有假电流', () => {
    const state = { ...createPracticeState(), activeRange: '0.6A' as const, meterSettings: { ...createPracticeState().meterSettings!, smallResistance: 1 as const, overloadDamage: false }, edges: [
      { from: 'battery+', to: 'lamp1-a' }, { from: 'lamp1-b', to: 'battery-' },
      { from: 'battery+', to: 'ammeter-0.6' }, { from: 'ammeter-neg', to: 'battery-' },
      { from: 'lamp2-a', to: 'switch-a' },
    ] as CircuitEdge[] }
    const analysis = evaluatePracticeCircuit(state)
    const load = 1 / (1 / 10.04 + 1 / 1.04)
    const terminalVoltage = 3 * load / (load + 0.2)
    expect(analysis.current).toBeCloseTo(terminalVoltage / 1.04, 8)
    expect(analysis.lampCurrent).toBeCloseTo(terminalVoltage / 10.04, 8)
    expect(analysis.sourceCurrent).toBeCloseTo(analysis.current + analysis.lampCurrent, 8)
    expect(analysis.wireCurrents.at(-1)).toBe(0)
  })
  it('反向过载也熔断，损坏支路不能通过重接自动修好', () => {
    const state = { ...createPracticeState(), activeRange: '3A' as const, edges: [{ from: 'battery+', to: 'ammeter-neg' }] as CircuitEdge[] }
    const overloaded = connect(state, 'ammeter-3', 'battery-')
    expect(overloaded.feedback.outcome).toBe('accepted')
    expect(overloaded.state.meterDamaged).toBe(true)
    expect(overloaded.state.trials.at(-1)?.reading).toBeLessThan(0)
    const moved = practiceController.reduce(overloaded.state, { type: 'rewire', payload: { edge: overloaded.state.edges[1], endpoint: 'ammeter-3', target: 'ammeter-0.6' } })
    expect(moved.feedback.outcome).toBe('accepted')
    expect(moved.state.meterDamaged).toBe(true)
    expect(evaluatePracticeCircuit(moved.state).current).toBe(0)
  })
})


describe('灯泡的可观察亮度', () => {
  it('有限导线电阻下旁路灯泡只剩微弱亮度，不能仍显示全亮', () => {
    const initial = createPracticeState()
    const analysis = evaluatePracticeCircuit({ ...initial, switchClosed: true, bypassClosed: true, meterSettings: { ...initial.meterSettings!, overloadDamage: false } })
    expect(Math.abs(analysis.lampCurrent)).toBeGreaterThan(0)
    expect(analysis.lampBrightness).toBeGreaterThan(0)
    expect(analysis.lampBrightness).toBeLessThan(0.02)
  })
  it('小量程内阻增大后电流和灯泡亮度同步降低', () => {
    const initial = createPracticeState()
    const small = practiceController.reduce(initial, { type: 'setRange', payload: '0.6A' }).state
    const low = evaluatePracticeCircuit({ ...small, switchClosed: true })
    const high = evaluatePracticeCircuit({ ...small, switchClosed: true, meterSettings: { ...small.meterSettings!, smallResistance: 5 } })
    expect(high.current).toBeLessThan(low.current)
    expect(high.lampBrightness).toBeLessThan(low.lampBrightness)
    expect(high.lampLit).toBe(true)
  })
})


describe('关闭瞬间损坏后的持续过载', () => {
  it('可以先观察过载；后续热损坏只断表内支路，不改变开关和导线', () => {
    const initial = createPracticeState()
    const state = { ...initial, meterSettings: { ...initial.meterSettings!, smallResistance: 1 as const, overloadDamage: false }, edges: [{ from: 'battery+', to: 'ammeter-0.6' }] as CircuitEdge[] }
    const overloaded = connect(state, 'ammeter-neg', 'battery-').state
    expect(overloaded.meterDamaged).toBe(false)
    const burned = practiceController.reduce(overloaded, { type: 'damageMeter' })
    expect(burned.feedback.outcome).toBe('accepted')
    expect(burned.state.meterDamaged).toBe(true)
    expect(burned.state.meterSettings?.overloadDamage).toBe(false)
    expect(burned.state.edges).toBe(overloaded.edges)
    expect(burned.state.switchClosed).toBe(overloaded.switchClosed)
    expect(evaluatePracticeCircuit(burned.state).current).toBe(0)
  })
  it('解除过载后过期热损坏事件不能损坏正常电表', () => {
    const state = createPracticeState()
    expect(practiceController.reduce(state, { type: 'damageMeter' }).state).toBe(state)
  })
})
