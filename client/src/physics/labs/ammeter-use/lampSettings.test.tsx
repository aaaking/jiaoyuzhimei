// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController, evaluatePracticeCircuit, type PracticeState } from './practiceController'

const initial = { namePrefix: 'L', nameNumber: '1', ratedVoltage: 3, burnVoltage: 3.13, ratedPower: 0.9, broken: false, shorted: false, angle: 0, reversed: false, removed: false }
const change = (state: PracticeState, patch = {}) => practiceController.reduce(state, { type: 'setLampSettings', payload: { ...initial, ...patch } })
const on = () => practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('灯泡设置的物理效果', () => {
  it.each([2.5, 3, 3.8, 6, 10])('%sV额定电压改变灯丝电阻，记录与亮度使用实际参数', ratedVoltage => {
    const state = change(on(), { ratedVoltage, burnVoltage: 100 }).state
    const resistance = ratedVoltage ** 2 / 0.9
    const current = 3 / (resistance + 0.39)
    const live = evaluatePracticeCircuit(state)
    expect(live.current).toBeCloseTo(current)
    expect(Math.abs(live.lampVoltage)).toBeCloseTo(current * resistance)
    expect(live.lampBrightness).toBeCloseTo(Math.min(1, current ** 2 * resistance / 0.9))
    expect(state.trials.at(-1)?.lampResistance).toBeCloseTo(resistance)
  })
  it.each([0.75, 0.9, 3.6, 10])('%sW额定功率改变实际回路电流', ratedPower => {
    expect(evaluatePracticeCircuit(change(on(), { ratedPower }).state).current).toBeCloseTo(3 / (9 / ratedPower + 0.39))
  })
  it('移开灯泡使灯座断路，装回后恢复电流，导线和开关不变', () => {
    const original = on()
    const detached = practiceController.reduce(original, { type: 'detachBulb' }).state
    expect(detached.bulbDetached).toBe(true)
    expect(detached.edges).toEqual(original.edges)
    expect(detached.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(detached).sourceCurrent).toBeCloseTo(0)
    expect(evaluatePracticeCircuit(detached).lampLit).toBe(false)
    const mounted = practiceController.reduce(detached, { type: 'attachBulb' }).state
    expect(mounted.bulbDetached).toBe(false)
    expect(evaluatePracticeCircuit(mounted).current).toBeCloseTo(3 / 10.39)
  })
  it('断路切断灯丝；灯座短路绕过灯丝，不发光且产生过流', () => {
    const original = { ...on(), meterSettings: { ...on().meterSettings!, overloadDamage: false } }
    expect(evaluatePracticeCircuit(change(original, { broken: true }).state).sourceCurrent).toBeCloseTo(0)
    const shorted = change(original, { shorted: true }).state
    expect(evaluatePracticeCircuit(shorted).sourceCurrent).toBeCloseTo(3 / 0.4)
    expect(evaluatePracticeCircuit(shorted).lampLit).toBe(false)
    expect(shorted.edges).toEqual(original.edges)
    expect(evaluatePracticeCircuit(practiceController.reduce(shorted, { type: 'detachBulb' }).state).sourceCurrent).toBeCloseTo(3 / 0.4)
  })
  it.each([false, true])('实际灯泡电压超过阈值会烧断灯丝，正反方向均适用（反向%s）', reversed => {
    const original = on()
    const burned = practiceController.reduce(original, { type: 'setBatterySettings', payload: { ...original.batterySettings!, voltage: 4.5, reversed } }).state
    expect(burned.lampDamaged).toBe(true)
    expect(burned.edges).toEqual(original.edges)
    expect(burned.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(burned).sourceCurrent).toBeCloseTo(0)
    expect(evaluatePracticeCircuit(burned).lampLit).toBe(false)
    expect(change(burned).state.lampDamaged).toBe(true)
    const detached = practiceController.reduce(burned, { type: 'detachBulb' }).state
    expect(practiceController.reduce(detached, { type: 'attachBulb' }).state.lampDamaged).toBe(true)
    expect(practiceController.restore(practiceController.snapshot(detached)).lampDamaged).toBe(true)
  })
  it('烧坏按灯泡两端实际电压判断，电源电压较高而负载分压低时仍正常', () => {
    const original = change(practiceController.createInitialState(), { burnVoltage: 3.13 }).state
    const source = practiceController.reduce(original, { type: 'setBatterySettings', payload: { ...original.batterySettings!, voltage: 4.5, resistance: 2 } }).state
    const withResistance = { ...source, meterSettings: { ...source.meterSettings!, smallResistance: 5 as const }, activeRange: '0.6A' as const, edges: source.edges.map(e => ({ from: e.from === 'ammeter-3' ? 'ammeter-0.6' as const : e.from, to: e.to === 'ammeter-3' ? 'ammeter-0.6' as const : e.to })) }
    const closed = practiceController.reduce(withResistance, { type: 'setSwitch', payload: 'closed' }).state
    expect(closed.lampDamaged).toBe(false)
    expect(Math.abs(evaluatePracticeCircuit(closed).lampVoltage)).toBeLessThan(3.13)
    expect(evaluatePracticeCircuit(closed).lampLit).toBe(true)
  })
  it('删除灯泡和灯座保留导线及机械状态，旧快照有默认值，无效参数不污染状态', () => {
    const original = on()
    const deleted = practiceController.reduce(original, { type: 'deleteLamp' }).state
    expect(deleted.lampSettings?.removed).toBe(true)
    expect(deleted.edges).toEqual(original.edges)
    expect(deleted.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(deleted).lampLit).toBe(false)
    expect(practiceController.restore(practiceController.snapshot(deleted)).lampSettings?.removed).toBe(true)
    const snapshot = practiceController.snapshot(original) as Record<string, unknown>
    delete snapshot.lampSettings; delete snapshot.lampDamaged; delete snapshot.bulbDetached
    expect(practiceController.restore(snapshot).lampSettings).toEqual(initial)
    for (const patch of [{ ratedVoltage: 0 }, { ratedPower: -1 }, { burnVoltage: NaN }, { angle: Infinity }]) {
      const result = change(original, patch)
      expect(result.feedback.outcome).toBe('rejected')
      expect(result.state).toBe(original)
    }
  })
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1080, 892))
  Object.defineProperties(SVGElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() }, hasPointerCapture: { configurable: true, value: () => true }, releasePointerCapture: { configurable: true, value: vi.fn() },
  })
})
afterEach(() => { act(() => root.unmount()); host.remove() })
function Harness() {
  const [state, setState] = useState(on)
  return <AmmeterScene state={state} dispatch={action => setState(previous => practiceController.reduce(previous, action).state)} />
}
function click(selector: string) {
  const element = host.querySelector(selector)
  expect(element, selector).toBeTruthy()
  act(() => element!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
describe('灯座完整交互', () => {
  it('光晕随实际电压的功率亮度变化，断电、移开、断路、短路和烧坏时消失', () => {
    const nominal = on()
    const render = (state: PracticeState) => act(() => root.render(<AmmeterScene state={state} dispatch={vi.fn()} />))
    render(nominal)
    const bright = host.querySelector('[data-lamp-glow]')!
    expect(bright).toBeTruthy()
    const opacity = Number(bright.getAttribute('opacity')), radius = Number(bright.getAttribute('r'))
    expect(opacity).toBeCloseTo(evaluatePracticeCircuit(nominal).lampBrightness)
    const lower = practiceController.reduce(nominal, { type: 'setBatterySettings', payload: { ...nominal.batterySettings!, voltage: 1.5 } }).state
    render(lower)
    expect(Number(host.querySelector('[data-lamp-glow]')!.getAttribute('opacity'))).toBeLessThan(opacity)
    expect(Number(host.querySelector('[data-lamp-glow]')!.getAttribute('r'))).toBeLessThan(radius)
    for (const state of [
      practiceController.reduce(nominal, { type: 'setSwitch', payload: 'open' }).state,
      practiceController.reduce(nominal, { type: 'detachBulb' }).state,
      change(nominal, { broken: true }).state,
      change(nominal, { shorted: true }).state,
      practiceController.reduce(nominal, { type: 'setBatterySettings', payload: { ...nominal.batterySettings!, voltage: 4.5 } }).state,
    ]) {
      render(state)
      expect(host.querySelector('[data-lamp-glow]')).toBeNull()
    }
  })

  it('选中、整体翻转、编辑额定参数与默认值、恢复初始、删除且留下悬空导线', () => {
    act(() => root.render(<Harness />))
    click('[data-component-drag="L1"]')
    expect(host.querySelector('[aria-label="移除灯泡"]')).toBeTruthy()
    const x = (post: string) => Number(host.querySelector(`[data-terminal="${post}"]`)!.getAttribute('cx'))
    const black = x('lamp1-a'), red = x('lamp1-b')
    click('[aria-label="切换灯座方向"]')
    expect(x('lamp1-a')).toBe(red); expect(x('lamp1-b')).toBe(black)
    expect(host.querySelector('[data-apparatus="L1"]')?.getAttribute('data-reversed')).toBe('true')
    click('[aria-label="灯泡设置"]')
    const voltage = host.querySelector<HTMLSelectElement>('[aria-label="灯泡额定电压"]')!
    const power = host.querySelector<HTMLSelectElement>('[aria-label="灯泡额定功率"]')!
    expect([...voltage.options].map(o => o.value)).toEqual(['2.5', '3', '3.8', '6', '10'])
    expect([...power.options].map(o => o.value)).toEqual(['0.75', '0.9', '3.6', '10'])
    act(() => { voltage.value = '6'; voltage.dispatchEvent(new Event('change', { bubbles: true })) }); act(() => { power.value = '3.6'; power.dispatchEvent(new Event('change', { bubbles: true })) })
    const name = host.querySelector<HTMLInputElement>('[aria-label="灯泡名称字母"]')!
    act(() => { name.value = 'B'; name.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector('[data-apparatus="L1"]')!.textContent).toContain('B1')
    const angle = host.querySelector<HTMLInputElement>('[aria-label="灯座旋转角度"]')!
    act(() => { angle.value = '90'; angle.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector('[data-lamp-body]')?.getAttribute('transform')).toContain('rotate(90')
    click('[aria-label="灯泡作为默认"]')
    expect(practiceController.createInitialState().lampSettings).toEqual({ ...initial, namePrefix: 'B', ratedVoltage: 6, ratedPower: 3.6, angle: 90, reversed: true })
    click('[aria-label="灯泡使用初始值"]')
    expect(power.value).toBe('0.9'); expect(voltage.value).toBe('3'); expect(angle.value).toBe('0')
    click('[aria-label="灯泡断路设置"]')
    expect(host.querySelector('[data-lamp-fault="断路"]')).toBeTruthy()
    expect(host.querySelector('[data-apparatus="A1"]')?.getAttribute('data-reading')).toBe('0')
    const paths = [...host.querySelectorAll('[data-wire]')].map(w => w.querySelector('path')!.getAttribute('d'))
    click('[aria-label="删除灯泡和灯座"]')
    expect(host.querySelector('[data-apparatus="L1"]')).toBeNull()
    expect(host.querySelector('[data-component-drag="L1"]')).toBeNull()
    expect([...host.querySelectorAll('[data-wire]')].map(w => w.querySelector('path')!.getAttribute('d'))).toEqual(paths)
    expect(host.querySelectorAll('[data-loose-terminal]')).toHaveLength(2)
  })
  it('移出灯泡后可独立拖动，装回后灯泡恢复通电', () => {
    act(() => root.render(<Harness />))
    click('[data-component-drag="L1"]'); click('[aria-label="移除灯泡"]')
    expect(host.querySelector('[data-lamp-empty]')).toBeTruthy()
    const bulb = host.querySelector('[data-detached-bulb]')!
    expect(bulb).toBeTruthy()
    expect(host.querySelector('[data-apparatus="A1"]')?.getAttribute('data-reading')).toBe('0')
    const before = bulb.getAttribute('transform')
    for (const [type, clientX, clientY] of [['pointerdown', 350, 240], ['pointermove', 430, 310], ['pointerup', 430, 310]] as const) act(() => bulb.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX, clientY })))
    expect(bulb.getAttribute('transform')).not.toBe(before)
    click('[aria-label="装回灯泡"]')
    expect(host.querySelector('[data-detached-bulb]')).toBeNull()
    expect(host.querySelector('[data-lamp-empty]')).toBeNull()
    expect(Number(host.querySelector('[data-apparatus="A1"]')?.getAttribute('data-reading'))).toBeCloseTo(3 / 10.39)
  })
})
