import { describe, expect, it } from 'vitest'
import { practiceController, evaluatePracticeCircuit } from './practiceController'

describe('截图中的单灯双开关电流表实验', () => {
  it('默认六根真实导线、3A量程，两只开关断开且读数为零', () => {
    const state = practiceController.createInitialState()
    expect(state.edges).toHaveLength(6)
    expect(state.activeRange).toBe('3A')
    expect(state.switchClosed).toBe(false)
    expect(state.bypassClosed).toBe(false)
    expect(evaluatePracticeCircuit(state).current).toBe(0)
  })

  it('只闭合S1即可测到3V电源和10Ω单灯的实际电流', () => {
    const result = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' })
    expect(result.feedback.outcome).toBe('accepted')
    expect(result.state.switchClosed).toBe(true)
    expect(result.state.bypassClosed).toBe(false)
    expect(evaluatePracticeCircuit(result.state).current).toBeCloseTo(3 / 10.39)
    expect(evaluatePracticeCircuit(result.state).lampLit).toBe(true)
    expect(result.state.trials.at(-1)?.reading).toBeCloseTo(0.3)
  })

  it('断开S1后实时电流与灯泡立即归零，历史测量仍保留', () => {
    const closed = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const opened = practiceController.reduce(closed, { type: 'setSwitch', payload: 'open' }).state
    expect(evaluatePracticeCircuit(opened).current).toBe(0)
    expect(evaluatePracticeCircuit(opened).lampLit).toBe(false)
    expect(opened.activeTrialId).toBeNull()
    expect(opened.trials).toHaveLength(1)
  })

  it('S2能独立闭合，主开关断开时没有电流', () => {
    const result = practiceController.reduce(practiceController.createInitialState(), { type: 'setBypassSwitch', payload: 'closed' })
    expect(result.state.bypassClosed).toBe(true)
    expect(result.state.switchClosed).toBe(false)
    expect(evaluatePracticeCircuit(result.state).current).toBe(0)
  })

  it.each(['main-first', 'bypass-first'])('无论闭合顺序%s，均允许闭合并由电表过载产生损坏', (order) => {
    const first = order === 'main-first' ? 'setSwitch' : 'setBypassSwitch'
    const second = order === 'main-first' ? 'setBypassSwitch' : 'setSwitch'
    const state = practiceController.reduce(practiceController.createInitialState(), { type: first, payload: 'closed' }).state
    const result = practiceController.reduce(state, { type: second, payload: 'closed' })
    expect(result.feedback.outcome).toBe('accepted')
    expect(result.state.switchClosed).toBe(true)
    expect(result.state.bypassClosed).toBe(true)
    expect(result.state.meterDamaged).toBe(true)
  })

  it('断电换量程会将实际导线换到0.6A柱，再闭合可以精读', () => {
    const next = practiceController.reduce(practiceController.createInitialState(), { type: 'setRange', payload: '0.6A' }).state
    expect(next.edges).toHaveLength(6)
    expect(next.edges.some((edge) => edge.from === 'ammeter-3' || edge.to === 'ammeter-3')).toBe(false)
    expect(next.edges.some((edge) => edge.from === 'ammeter-0.6' || edge.to === 'ammeter-0.6')).toBe(true)
    const closed = practiceController.reduce(next, { type: 'setSwitch', payload: 'closed' }).state
    expect(closed.trials.at(-1)?.range).toBe('0.6A')
    expect(closed.trials.at(-1)?.reading).toBeCloseTo(0.3)
  })

  it('通电时仍允许换量程、拆线和接线', () => {
    const state = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    for (const action of [
      { type: 'setRange', payload: '0.6A' },
      { type: 'disconnect', payload: state.edges[0] },
      { type: 'connect', payload: { from: 'battery+', to: 'lamp1-a' } },
    ]) {
      const result = practiceController.reduce(state, action)
      expect(result.feedback.outcome).toBe('accepted')
      expect(result.state.switchClosed).toBe(true)
    }
  })

  it('可拆掉再接回一根导线，断路时零电流，接回后恢复测量', () => {
    const initial = practiceController.createInitialState()
    const wire = initial.edges[0]
    const unplugged = practiceController.reduce(initial, { type: 'disconnect', payload: wire }).state
    const openCircuit = practiceController.reduce(unplugged, { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(openCircuit).current).toBe(0)
    const off = practiceController.reduce(openCircuit, { type: 'setSwitch', payload: 'open' }).state
    const restored = practiceController.reduce(off, { type: 'connect', payload: wire }).state
    expect(restored.edges).toHaveLength(6)
    const on = practiceController.reduce(restored, { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(on).current).toBeGreaterThan(0)
  })

  it('电表反接允许合闸并呈现负读数和发光', () => {
    const state = practiceController.createInitialState()
    state.edges = state.edges.map((edge) => ({
      from: edge.from === 'ammeter-neg' ? 'ammeter-3' : edge.from === 'ammeter-3' ? 'ammeter-neg' : edge.from,
      to: edge.to === 'ammeter-neg' ? 'ammeter-3' : edge.to === 'ammeter-3' ? 'ammeter-neg' : edge.to,
    }))
    const result = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' })
    expect(result.feedback.outcome).toBe('accepted')
    expect(result.feedback.message).toMatch(/反接/)
    expect(result.state.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(result.state).current).toBeLessThan(0)
    expect(evaluatePracticeCircuit(result.state).lampLit).toBe(true)
  })

  it('实验快照可恢复单灯测量和两只开关的独立状态', () => {
    const state = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    expect(practiceController.restore(practiceController.snapshot(state))).toEqual(state)
    expect(practiceController.restore({ schema: 'ammeter-practice-v1', edges: 'invalid' })).toEqual(practiceController.createInitialState())
  })
})

 describe('自由接线的物理结果与完成顺序', () => {
  it('导线搭桥S1后立即通电并记录实验结果', () => {
    const state = practiceController.createInitialState()
    const result = practiceController.reduce(state, { type: 'connect', payload: { from: 'switch-a', to: 'switch-b' } })
    expect(result.feedback.outcome).toBe('accepted')
    expect(result.state.switchClosed).toBe(false)
    expect(evaluatePracticeCircuit(result.state).current).toBeGreaterThan(0)
    expect(result.state.trials).toHaveLength(1)
  })
  it('S2独立通电回路可带电换线换量程，清空仍可主动断电', () => {
    const state = practiceController.createInitialState()
    // 自定义接线：S2串联，S1被导线旁路；闭合S2是真实通电路径。
    state.edges = [
      { from: 'battery+', to: 'lamp2-a' }, { from: 'lamp2-b', to: 'ammeter-3' },
      { from: 'ammeter-neg', to: 'lamp1-b' }, { from: 'lamp1-a', to: 'battery-' },
    ]
    const on = practiceController.reduce(state, { type: 'setBypassSwitch', payload: 'closed' }).state
    expect(on.switchClosed).toBe(false)
    expect(on.trials).toHaveLength(1)
    expect(evaluatePracticeCircuit(on).current).toBeGreaterThan(0)
    expect(practiceController.reduce(on, { type: 'setRange', payload: '0.6A' }).feedback.outcome).toBe('accepted')
    expect(practiceController.reduce(on, { type: 'disconnect', payload: on.edges[0] }).feedback.outcome).toBe('accepted')
    const cleared = practiceController.reduce(on, { type: 'resetTrial' }).state
    expect(evaluatePracticeCircuit(cleared).current).toBe(0)
    expect(cleared.bypassClosed).toBe(false)
    expect(cleared.edges).toHaveLength(0)
    expect(cleared.trials).toHaveLength(1)
  })
  it('必须先大量程试触，再小量程精读，颠倒顺序不算完成', () => {
    let state = practiceController.createInitialState()
    for (const range of ['0.6A', '3A']) {
      state = practiceController.reduce(state, { type: 'setRange', payload: range }).state
      state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
      state = practiceController.reduce(state, { type: 'setSwitch', payload: 'open' }).state
    }
    expect(practiceController.completion(state).complete).toBe(false)
    state = practiceController.reduce(state, { type: 'setRange', payload: '0.6A' }).state
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
    expect(practiceController.completion(state).complete).toBe(true)
  })
})

describe('电流表设置与器材生命周期', () => {
  const settings = { namePrefix: 'I', nameNumber: '2', overloadDamage: true, showGraph: true, smallResistance: 5, decimals: 3 }
  it('小量程内阻影响真实电流、记录及测量值，通电更新生效，大量程仍使用0.1Ω', () => {
    let state = practiceController.reduce(practiceController.createInitialState(), { type: 'setMeterSettings', payload: settings }).state
    state = practiceController.reduce(state, { type: 'setRange', payload: '0.6A' }).state
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(0.2)
    expect(state.trials.at(-1)?.reading).toBeCloseTo(0.2)
    expect(practiceController.deriveMeasurements(state).find((item) => item.key === 'current')?.value).toBeCloseTo(0.2)
    state = practiceController.reduce(state, { type: 'setMeterSettings', payload: { ...settings, smallResistance: 0 } }).state
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(3 / 10.281)
    expect(state.trials.at(-1)?.reading).toBeCloseTo(0.3)
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'open' }).state
    state = practiceController.reduce(state, { type: 'setRange', payload: '3A' }).state
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(3 / 10.39)
  })
  it.each([NaN, Infinity, -1, 0.1, '5'])('拒绝非法小量程内阻%s，原状态不变', (smallResistance) => {
    const state = practiceController.createInitialState()
    const next = practiceController.reduce(state, { type: 'setMeterSettings', payload: { ...settings, smallResistance } })
    expect(next.feedback.outcome).toBe('rejected')
    expect(next.state).toBe(state)
  })
  it('删除移除电表和对应导线，不自动改变开关，清空实验不会复活', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const removed = practiceController.reduce(on, { type: 'deleteMeter' }).state
    expect(removed.meterRemoved).toBe(true)
    expect(removed.activeRange).toBeNull()
    expect(removed.switchClosed).toBe(true)
    expect(removed.bypassClosed).toBe(false)
    expect(removed.edges).toHaveLength(4)
    expect(removed.edges.some((edge) => [edge.from, edge.to].some((id) => id.startsWith('ammeter')))).toBe(false)
    expect(evaluatePracticeCircuit(removed).current).toBe(0)
    expect(removed.trials).toHaveLength(1)
    expect(practiceController.reduce(removed, { type: 'resetTrial' }).state.meterRemoved).toBe(true)
    expect(practiceController.reduce(removed, { type: 'setRange', payload: '3A' }).feedback.outcome).toBe('rejected')
    expect(practiceController.reduce(removed, { type: 'connect', payload: { from: 'battery+', to: 'ammeter-neg' } }).feedback.outcome).toBe('rejected')
    expect(practiceController.restore(practiceController.snapshot(removed))).toEqual(removed)
    expect(practiceController.createInitialState().meterRemoved).toBe(false)
  })
  it.each([true, false])('电表经S1直接跨电源时，3A有限电流超过0.6A并遵守损坏开关%s', (overloadDamage) => {
    let state = practiceController.reduce(practiceController.createInitialState(), { type: 'resetTrial' }).state
    state = practiceController.reduce(state, { type: 'setMeterSettings', payload: { ...settings, overloadDamage, smallResistance: 1 } }).state
    for (const payload of [
      { from: 'battery+', to: 'switch-a' }, { from: 'switch-b', to: 'ammeter-0.6' }, { from: 'ammeter-neg', to: 'battery-' },
    ]) state = practiceController.reduce(state, { type: 'connect', payload }).state
    const powered = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' })
    expect(powered.feedback.outcome).toBe('accepted')
    expect(powered.state.meterDamaged).toBe(overloadDamage)
    expect(powered.state.overRangeWarning).toMatch(/超过|过载/)
    expect(evaluatePracticeCircuit(powered.state).current).toBeCloseTo(overloadDamage ? 0 : 3 / 1.27)
    if (overloadDamage) {
      expect(practiceController.reduce(powered.state, { type: 'resetTrial' }).state.meterDamaged).toBe(true)
      expect(practiceController.restore(practiceController.snapshot(powered.state))).toEqual(powered.state)
    } else expect(powered.state.trials.at(-1)?.overRange).toBe(true)
  })
  it('设置可往返快照，旧v1快照补齐兼容默认值', () => {
    const updated = practiceController.reduce(practiceController.createInitialState(), { type: 'setMeterSettings', payload: settings }).state
    expect(practiceController.restore(practiceController.snapshot(updated))).toEqual(updated)
    const legacy = practiceController.snapshot(practiceController.createInitialState()) as Record<string, unknown>
    delete legacy.meterSettings
    delete legacy.meterRemoved
    delete legacy.meterDamaged
    const restored = practiceController.restore(legacy)
    expect(restored.meterSettings).toEqual({ namePrefix: 'A', nameNumber: '1', overloadDamage: true, showGraph: false, smallResistance: 0, decimals: 2 })
    expect(restored.meterRemoved).toBe(false)
    expect(restored.meterDamaged).toBe(false)
  })
})

describe('导线端点原子重接', () => {
  it.each(['from', 'to'] as const)('可移动原导线的%s端，替换一根线且量程同步', (side) => {
    const state = practiceController.createInitialState()
    const original = state.edges[1]
    const edge = side === 'from' ? { from: original.to, to: original.from } : original
    const next = practiceController.reduce(state, { type: 'rewire', payload: { edge, endpoint: 'ammeter-3', target: 'ammeter-0.6' } })
    expect(next.feedback.outcome).toBe('accepted')
    expect(next.state.edges).toHaveLength(state.edges.length)
    expect(next.state.edges[1]).toEqual({ from: 'switch-b', to: 'ammeter-0.6' })
    expect(next.state.activeRange).toBe('0.6A')
    expect(state.edges[1]).toEqual(original)
  })
  it('只移动指定导线，保留同一柱的另一根导线', () => {
    const state = practiceController.createInitialState()
    const edge = state.edges[2]
    const next = practiceController.reduce(state, { type: 'rewire', payload: { edge, endpoint: 'lamp1-b', target: 'lamp2-a' } })
    expect(next.feedback.outcome).toBe('accepted')
    expect(next.state.edges[2]).toEqual({ from: 'ammeter-neg', to: 'lamp2-a' })
    expect(next.state.edges[5]).toEqual(state.edges[5])
  })
  it.each([
    { endpoint: 'ammeter-3', target: 'switch-b' },
    { endpoint: 'battery-', target: 'lamp1-a' },
    { endpoint: 'ammeter-3', target: 'invalid' },
  ])('非法端点/落点保留全部原连接：%o', (change) => {
    const state = practiceController.createInitialState()
    const next = practiceController.reduce(state, { type: 'rewire', payload: { edge: state.edges[1], ...change } })
    expect(next.feedback.outcome).toBe('rejected')
    expect(next.state).toBe(state)
  })
  it('带电重接可生效，重复路径合并；不存在的端子不能接线', () => {
    const initial = practiceController.createInitialState()
    const closed = { ...initial, switchClosed: true }
    const request = { type: 'rewire', payload: { edge: initial.edges[1], endpoint: 'ammeter-3', target: 'ammeter-0.6' } }
    expect(practiceController.reduce(closed, request).state.activeRange).toBe('0.6A')
    expect(practiceController.reduce(closed, request).state.switchClosed).toBe(true)
    const duplicate = practiceController.reduce(initial, { type: 'rewire', payload: { edge: initial.edges[2], endpoint: 'ammeter-neg', target: 'lamp2-b' } })
    expect(duplicate.feedback.outcome).toBe('accepted')
    expect(duplicate.state.edges).toHaveLength(5)
    expect(duplicate.state.edges).toContainEqual(initial.edges[5])
    const removed = practiceController.reduce(initial, { type: 'deleteMeter' }).state
    const next = practiceController.reduce(removed, { type: 'rewire', payload: { edge: removed.edges[0], endpoint: 'switch-a', target: 'ammeter-3' } })
    expect(next.feedback.outcome).toBe('rejected')
    expect(next.state).toBe(removed)
  })
})

describe('持续过载的设置切换', () => {
  it('已在有限过载回路中，开启瞬间损坏后立即熔断而不是等待再合闸', () => {
    let state = practiceController.createInitialState()
    state = practiceController.reduce(state, { type: 'setMeterSettings', payload: { ...state.meterSettings, overloadDamage: false, smallResistance: 1 } }).state
    state = {
      ...state, activeRange: '0.6A', switchClosed: true,
      edges: [{ from: 'battery+', to: 'switch-a' }, { from: 'switch-b', to: 'ammeter-0.6' }, { from: 'ammeter-neg', to: 'battery-' }],
    }
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(3 / 1.27)
    const changed = practiceController.reduce(state, { type: 'setMeterSettings', payload: { ...state.meterSettings, overloadDamage: true } })
    expect(changed.state.meterDamaged).toBe(true)
    expect(evaluatePracticeCircuit(changed.state).current).toBe(0)
    expect(changed.feedback.message).toMatch(/损坏/)
  })
})


describe('拖线不自动改变开关', () => {
  it.each(['main', 'bypass'])('%s开关闭合后开始拉线保留开关、接线和历史', (mode) => {
    const action = mode === 'main' ? 'setSwitch' : 'setBypassSwitch'
    const state = practiceController.reduce(practiceController.createInitialState(), { type: action, payload: 'closed' }).state
    const next = practiceController.reduce(state, { type: 'dragStart', payload: { subject: 'ammeter-3' } })
    expect(next.feedback.outcome).toBe('accepted')
    expect(next.state).toBe(state)
  })
})
