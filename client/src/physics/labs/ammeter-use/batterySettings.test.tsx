// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController, evaluatePracticeCircuit } from './practiceController'
import { DEFAULT_LAMP_SETTINGS } from './lampSettings'
import { currentWireDirections } from './currentFlow'
import { wireKey, terminalPosition } from './layout'
import { createReferenceLayout } from './referenceLayout'

const initial = { namePrefix: 'E', nameNumber: '1', resistance: 0.2, voltage: 3, angle: 0, reversed: false, removed: false }
const change = (state: ReturnType<typeof practiceController.createInitialState>, patch = {}) => practiceController.reduce(state, { type: 'setBatterySettings', payload: { ...initial, ...patch } }).state
beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('电池设置改变实际供电', () => {
  it.each([1.5, 3, 4.5, 6])('%sV实际改变电流，测量记录使用该电压', (voltage) => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    // 隔离电源标定；灯泡过压烧坏在 lampSettings.test.tsx 验证。
    const state = change({ ...on, lampSettings: { ...DEFAULT_LAMP_SETTINGS, burnVoltage: 10 } }, { voltage })
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(voltage / 10.39)
    expect(state.trials.at(-1)?.supplyVoltage).toBe(voltage)
  })
  it.each([0, 0.1, 0.2, 0.5, 1, 2])('%sΩ内阻参与求解，不只是修改设置文案', (resistance) => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(change(on, { resistance })).current).toBeCloseTo(3 / (10.19 + resistance))
  })
  it('0Ω理想电源在开路和短路下均可计算，短路电流由导线电阻决定', () => {
    const state = change(practiceController.createInitialState(), { resistance: 0 })
    const open = evaluatePracticeCircuit(state)
    expect(open.sourceCurrent).toBe(0)
    expect(open.wireCurrents.every(current => current === 0)).toBe(true)
    const short = evaluatePracticeCircuit({ ...state, edges: [{ from: 'battery+', to: 'battery-' }], activeRange: null })
    expect(short.sourceCurrent).toBeCloseTo(150)
    expect(short.wireCurrents[0]).toBeCloseTo(150)
  })
  it('翻转电池保留接线和机械开关状态，电流及箭头方向反转，灯泡仍亮', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const reversed = practiceController.reduce(on, { type: 'flipBattery' }).state
    expect(reversed.edges).toEqual(on.edges)
    expect(reversed.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(reversed).current).toBeCloseTo(-3 / 10.39)
    expect(evaluatePracticeCircuit(reversed).sourceCurrent).toBeCloseTo(3 / 10.39)
    expect(evaluatePracticeCircuit(reversed).lampLit).toBe(true)
    expect(currentWireDirections(reversed).get(wireKey('battery+', 'switch-a'))).toBe(-1)
    expect(evaluatePracticeCircuit(practiceController.reduce(reversed, { type: 'flipBattery' }).state).current).toBeCloseTo(3 / 10.39)
  })
  it('删除电池保留所有导线和开关状态，电流归零，快照不会复活电池', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const result = practiceController.reduce(on, { type: 'deleteBattery' })
    expect(result.feedback.outcome).toBe('accepted')
    expect(result.state.edges).toEqual(on.edges)
    expect(result.state.switchClosed).toBe(true)
    expect(result.state.batterySettings?.removed).toBe(true)
    expect(evaluatePracticeCircuit(result.state).sourceCurrent).toBe(0)
    expect(evaluatePracticeCircuit(result.state).lampLit).toBe(false)
    expect(practiceController.restore(practiceController.snapshot(result.state)).batterySettings?.removed).toBe(true)
  })
  it('恢复旧快照采用原实验设置，无效电压与内阻不会污染状态', () => {
    const state = practiceController.createInitialState()
    const snapshot = practiceController.snapshot(state) as Record<string, unknown>
    delete snapshot.batterySettings
    expect(practiceController.restore(snapshot).batterySettings).toEqual(initial)
    for (const patch of [{ voltage: 12 }, { resistance: -1 }, { angle: Infinity }]) {
      const result = practiceController.reduce(state, { type: 'setBatterySettings', payload: { ...initial, ...patch } })
      expect(result.feedback.outcome).toBe('rejected')
      expect(result.state).toBe(state)
    }
  })
  it('删除后不能接入不存在的接线柱，但原悬空端可以重接到其他器材', () => {
    const deleted = practiceController.reduce(practiceController.createInitialState(), { type: 'deleteBattery' }).state
    expect(practiceController.reduce(deleted, { type: 'connect', payload: { from: 'battery+', to: 'lamp1-a' } }).feedback.outcome).toBe('rejected')
    expect(practiceController.reduce(deleted, { type: 'rewire', payload: { edge: deleted.edges[1], endpoint: 'switch-b', target: 'battery-' } }).feedback.outcome).toBe('rejected')
    const rewired = practiceController.reduce(deleted, { type: 'rewire', payload: { edge: deleted.edges[0], endpoint: 'battery+', target: 'lamp1-a' } })
    expect(rewired.feedback.outcome).toBe('accepted')
    expect(rewired.state.edges[0]).toEqual({ from: 'lamp1-a', to: 'switch-a' })
    expect(rewired.state.edges).toHaveLength(deleted.edges.length)
  })
  it('使用初始设置不会修复已损坏电池，0Ω反接仍遵从实际电流方向', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    expect(evaluatePracticeCircuit(change(on, { resistance: 0, reversed: true })).current).toBeCloseTo(-3 / 10.19)
    const damaged = change({ ...on, sourceDamaged: true }, { voltage: 6 })
    expect(damaged.sourceDamaged).toBe(true)
    expect(evaluatePracticeCircuit(damaged).sourceCurrent).toBe(0)
  })
  it('电池旋转90度带动两颗接线柱，保留不对称的真实素材偏移', () => {
    const layout = { ...createReferenceLayout(), componentAngles: { E1: 90 } }
    expect(terminalPosition(layout, 'battery-').x).toBeCloseTo(284)
    expect(terminalPosition(layout, 'battery-').y).toBeCloseTo(497.03)
    expect(terminalPosition(layout, 'battery+').x).toBeCloseTo(284)
    expect(terminalPosition(layout, 'battery+').y).toBeCloseTo(679.08)
  })
})

let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
function Harness() {
  const [state, setState] = useState<ReturnType<typeof practiceController.createInitialState>>(() => ({ ...practiceController.createInitialState(), lampSettings: { ...DEFAULT_LAMP_SETTINGS, burnVoltage: 10 }, switchClosed: true }))
  return <AmmeterScene state={state} dispatch={action => setState(previous => practiceController.reduce(previous, action).state)} />
}
function click(selector: string) {
  const element = host.querySelector(selector)
  expect(element, selector).toBeTruthy()
  act(() => element!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
describe('电池组操作的完整用户路径', () => {
  it('选中、翻转、编辑、保存默认、恢复初始及仅删除电池组', () => {
    act(() => root.render(<Harness />))
    click('[data-component-drag="E1"]')
    const paths = () => [...host.querySelectorAll('[data-wire]')].map(wire => wire.querySelector('path')!.getAttribute('d'))
    const beforeFlip = paths()
    click('[aria-label="切换电池组方向"]')
    expect(host.querySelector('[data-apparatus="E1"]')?.getAttribute('data-reversed')).toBe('true')
    expect(paths()).toEqual(beforeFlip)
    expect(host.querySelector('[data-apparatus="A1"]')?.getAttribute('data-reading')).toMatch(/^-/)
    click('[aria-label="电池组设置"]')
    const resistance = host.querySelector<HTMLSelectElement>('[aria-label="电池组内阻"]')!
    expect([...resistance.options].map(option => option.value)).toEqual(['0', '0.1', '0.2', '0.5', '1', '2'])
    act(() => { resistance.value = '1'; resistance.dispatchEvent(new Event('change', { bubbles: true })) })
    click('[aria-label="电池组电压4.5V"]')
    const name = host.querySelector<HTMLInputElement>('[aria-label="电池组名称字母"]')!
    act(() => { name.value = 'U'; name.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector('[data-apparatus="E1"]')?.textContent).toContain('U1')
    const angle = host.querySelector<HTMLInputElement>('[aria-label="电池组旋转角度"]')!
    act(() => { angle.value = '90'; angle.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector('[data-battery-body]')?.getAttribute('transform')).toContain('rotate(90')
    click('[aria-label="电池组作为默认"]')
    expect(practiceController.createInitialState().batterySettings).toEqual({ ...initial, namePrefix: 'U', resistance: 1, voltage: 4.5, angle: 90, reversed: true })
    click('[aria-label="电池组使用初始值"]')
    expect(host.querySelector('[data-apparatus="E1"]')?.getAttribute('data-reversed')).toBe('false')
    expect(resistance.value).toBe('0.2')
    expect(angle.value).toBe('0')
    expect(Number(host.querySelector('[data-apparatus="A1"]')?.getAttribute('data-reading'))).toBeCloseTo(3 / 10.39)
    const beforeDelete = paths()
    click('[aria-label="删除电池组"]')
    expect(host.querySelector('[data-apparatus="E1"]')).toBeNull()
    expect(host.querySelector('[data-component-drag="E1"]')).toBeNull()
    expect(paths()).toEqual(beforeDelete)
    expect(host.querySelectorAll('[data-loose-terminal]')).toHaveLength(2)
    expect(host.querySelector('[data-terminal="battery+"]')).toBeNull()
    expect(host.querySelector('[data-apparatus="S1"]')).toBeTruthy()
  })
})
