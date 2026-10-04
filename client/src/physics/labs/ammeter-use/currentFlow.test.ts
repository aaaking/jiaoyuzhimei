import { describe, expect, it } from 'vitest'
import { createPracticeState, practiceController } from './practiceController'
import { currentWireDirections } from './currentFlow'
import { wireKey } from './layout'

describe('导线电流方向', () => {
  it('断路不播放；闭合S1时从正极经电表和灯泡流向负极，S2悬空导线不播放', () => {
    const initial = createPracticeState()
    expect(currentWireDirections(initial).size).toBe(0)
    const closed = practiceController.reduce(initial, { type: 'setSwitch', payload: 'closed' }).state
    const flows = currentWireDirections(closed)
    expect(flows.size).toBe(4)
    for (const edge of closed.edges.slice(0, 4)) expect(flows.get(wireKey(edge.from, edge.to))).toBe(1)
    expect(flows.has(wireKey('lamp2-a', 'lamp1-a'))).toBe(false)
    expect(currentWireDirections({ ...closed, switchClosed: false }).size).toBe(0)
  })
  it('导线端点记录倒序不改变真实电流方向', () => {
    const state = { ...createPracticeState(), switchClosed: true }
    state.edges = state.edges.map(({ from, to }) => ({ from: to, to: from }))
    expect([...currentWireDirections(state).values()]).toEqual([-1, -1, -1, -1])
  })
  it('小量程换线后同步方向；删除和损坏时断路不播放；尚未损坏的过载回路仍播放', () => {
    const initial = createPracticeState()
    const small = practiceController.reduce(initial, { type: 'setRange', payload: '0.6A' }).state
    const closed = { ...small, switchClosed: true }
    expect(currentWireDirections(closed).get(wireKey('switch-b', 'ammeter-0.6'))).toBe(1)
    expect(currentWireDirections({ ...closed, meterDamaged: true }).size).toBe(0)
    expect(currentWireDirections(practiceController.reduce(closed, { type: 'deleteMeter' }).state).size).toBe(0)
    expect(currentWireDirections({ ...closed, bypassClosed: true }).size).toBeGreaterThan(0)
  })
})
