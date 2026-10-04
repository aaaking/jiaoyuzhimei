// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController, evaluatePracticeCircuit } from './practiceController'
import { createReferenceLayout } from './referenceLayout'
import { terminalPosition, wirePathD } from './layout'

const settings = (number = '1') => ({ namePrefix: 'S', nameNumber: number, reversed: false, broken: false, angle: 0, removed: false })
function change(state: ReturnType<typeof practiceController.createInitialState>, id: 'S1' | 'S2', patch = {}) {
  return practiceController.reduce(state, { type: 'setSwitchSettings', payload: { id, settings: { ...settings(id.slice(1)), ...patch } } }).state
}

describe('独立闸刀设置的实际电学效果', () => {
  it('S1设置断路后，闭合闸刀也不导通；解除断路即恢复电流', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const broken = change(on, 'S1', { broken: true })
    expect(broken.switchClosed).toBe(true)
    expect(evaluatePracticeCircuit(broken).current).toBe(0)
    expect(evaluatePracticeCircuit(broken).lampLit).toBe(false)
    expect(evaluatePracticeCircuit(change(broken, 'S1')).current).toBeCloseTo(3 / 10.39)
  })
  it('S2断路只切断旁路，S1和灯泡回路继续工作', () => {
    let state = practiceController.createInitialState()
    state.meterSettings = { ...state.meterSettings!, overloadDamage: false }
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
    state = change(state, 'S2', { broken: true })
    state = practiceController.reduce(state, { type: 'setBypassSwitch', payload: 'closed' }).state
    expect(state.bypassClosed).toBe(true)
    expect(evaluatePracticeCircuit(state).current).toBeCloseTo(3 / 10.39)
    expect(evaluatePracticeCircuit(state).lampLit).toBe(true)
  })
  it.each(['S1', 'S2'] as const)('删除%s保留所有导线，只移除该开关的导通支路', (id) => {
    let state = practiceController.createInitialState()
    state.meterSettings = { ...state.meterSettings!, overloadDamage: false }
    state = practiceController.reduce(state, { type: 'setSwitch', payload: 'closed' }).state
    state = practiceController.reduce(state, { type: 'setBypassSwitch', payload: 'closed' }).state
    const removed = practiceController.reduce(state, { type: 'deleteSwitch', payload: id })
    expect(removed.feedback.outcome).toBe('accepted')
    expect(removed.state.edges).toEqual(state.edges)
    expect(removed.state.switches?.[id].removed).toBe(true)
    expect(practiceController.restore(practiceController.snapshot(removed.state)).switches?.[id].removed).toBe(true)
    expect(removed.state.switches?.[id === 'S1' ? 'S2' : 'S1'].removed).toBe(false)
    expect(evaluatePracticeCircuit(removed.state).current).toBeCloseTo(id === 'S1' ? 0 : 3 / 10.39)
  })
  it('名称、方向、角度及断路状态分别持久化，翻转不会改变电流', () => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    const changed = change(on, 'S1', { namePrefix: 'K', nameNumber: '7', angle: -90 })
    const flipped = practiceController.reduce(changed, { type: 'flipSwitch', payload: 'S1' }).state
    expect(flipped.switches?.S1.reversed).toBe(true)
    expect(flipped.switches?.S2).toEqual(settings('2'))
    expect(evaluatePracticeCircuit(flipped).current).toBeCloseTo(evaluatePracticeCircuit(on).current)
    const restored = practiceController.restore(practiceController.snapshot(change(flipped, 'S2', { broken: true })))
    expect(restored.switches?.S1).toEqual({ ...settings(), namePrefix: 'K', nameNumber: '7', angle: -90, reversed: true })
    expect(restored.switches?.S2.broken).toBe(true)
  })
  it('旧快照恢复默认开关设置；无效角度拒绝且不污染状态', () => {
    const state = practiceController.createInitialState()
    const snapshot = practiceController.snapshot(state) as Record<string, unknown>
    delete snapshot.switches
    expect(practiceController.restore(snapshot).switches?.S1).toEqual(settings())
    const invalid = practiceController.reduce(state, { type: 'setSwitchSettings', payload: { id: 'S1', settings: { ...settings(), angle: Infinity } } })
    expect(invalid.feedback.outcome).toBe('rejected')
    expect(invalid.state).toBe(state)
  })
  it('旋转90度后，接线柱和导线端点一起落在真实器材的新位置', () => {
    const layout = { ...createReferenceLayout(), componentAngles: { S1: 90 } }
    expect(terminalPosition(layout, 'switch-a')).toEqual({ x: 571, y: 528 })
    expect(terminalPosition(layout, 'switch-b')).toEqual({ x: 571, y: 654 })
    expect(wirePathD(layout, 'battery+', 'switch-a').match(/-?\d+(?:\.\d+)?/g)!.map(Number).slice(-2)).toEqual([571, 528])
  })
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1080, 892))
  Object.defineProperties(SVGElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  })
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
function Harness({ unwired = false }: { unwired?: boolean }) {
  const [state, setState] = useState(() => ({ ...practiceController.createInitialState(), switchClosed: true, ...(unwired ? { edges: [], activeRange: null } : {}) }))
  return <AmmeterScene state={state} dispatch={(action) => setState(previous => practiceController.reduce(previous, action).state)} />
}
function click(selector: string) {
  const element = host.querySelector(selector)
  expect(element, selector).toBeTruthy()
  act(() => element!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

describe('两只开关的完整设置与删除路径', () => {
  it.each([['S1', 0], ['S2', 0], ['S1', 90], ['S2', 90]] as const)('%s在%s度时整体翻转，接线柱和已接导线一起移动，往返恢复原状', (id, angleValue) => {
    act(() => root.render(<Harness />))
    click(`[data-component-drag="${id}"]`)
    if (angleValue) {
      click(`[aria-label="${id}开关设置"]`)
      const angle = host.querySelector<HTMLInputElement>('[aria-label="开关旋转角度"]')!
      act(() => { angle.value = String(angleValue); angle.dispatchEvent(new Event('input', { bubbles: true })) })
    }
    const black = id === 'S1' ? 'switch-a' : 'lamp2-a'
    const red = id === 'S1' ? 'switch-b' : 'lamp2-b'
    const point = (post: string) => { const element = host.querySelector(`[data-terminal="${post}"]`)!; return [Number(element.getAttribute('cx')), Number(element.getAttribute('cy'))] }
    const wires = () => [...host.querySelectorAll('[data-wire]')].map(e => ({ id: e.getAttribute('data-wire')!, path: e.querySelector('path')!.getAttribute('d')! }))
    const blackBefore = point(black), redBefore = point(red), wiresBefore = wires()
    const reading = host.querySelector('[data-apparatus="A1"]')!.getAttribute('data-reading')
    click(`[aria-label="切换${id}开关方向"]`)
    expect(point(black)).toEqual(redBefore)
    expect(point(red)).toEqual(blackBefore)
    const wiresAfter = wires()
    expect(wiresAfter.map(e => e.id)).toEqual(wiresBefore.map(e => e.id))
    for (const [index, wire] of wiresBefore.entries()) {
      if (wire.id.includes(black) || wire.id.includes(red)) expect(wiresAfter[index].path).not.toEqual(wire.path)
      else expect(wiresAfter[index].path).toEqual(wire.path)
    }
    expect(host.querySelector('[data-apparatus="A1"]')!.getAttribute('data-reading')).toBe(reading)
    const mirroredBody = host.querySelector(`[data-switch-body="${id}"]`)!
    expect(mirroredBody.querySelectorAll('image')).toHaveLength(1)
    expect(mirroredBody.querySelector('[clip-path]')).toBeNull()
    click(`[aria-label="切换${id}开关方向"]`)
    expect(point(black)).toEqual(blackBefore)
    expect(point(red)).toEqual(redBefore)
    expect(wires()).toEqual(wiresBefore)
  })
  it.each(['S1', 'S2'])('%s未接线时翻转交换两柱位置，不生成导线', (id) => {
    act(() => root.render(<Harness unwired />))
    const black = id === 'S1' ? 'switch-a' : 'lamp2-a'
    const red = id === 'S1' ? 'switch-b' : 'lamp2-b'
    const x = (post: string) => Number(host.querySelector(`[data-terminal="${post}"]`)!.getAttribute('cx'))
    const blackBefore = x(black), redBefore = x(red)
    click(`[data-component-drag="${id}"]`)
    click(`[aria-label="切换${id}开关方向"]`)
    expect(x(black)).toBe(redBefore)
    expect(x(red)).toBe(blackBefore)
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(0)
  })
  it('删除开关留下的悬空线端仍可拖到其他接线柱重接', () => {
    act(() => root.render(<Harness />))
    click('[data-component-drag="S2"]')
    click('[aria-label="删除S2开关"]')
    const source = host.querySelector('[data-loose-terminal="lamp2-a"]')!
    const target = host.querySelector('[data-terminal="ammeter-0.6"]')!
    const point = (element: Element) => ({ clientX: Number(element.getAttribute('cx')), clientY: Number(element.getAttribute('cy')) })
    for (const [type, element] of [['pointerdown', source], ['pointermove', target], ['pointerup', target]] as const) {
      act(() => source.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, bubbles: true, ...point(element) })))
    }
    expect(host.querySelector('[data-wire="ammeter-0.6:lamp1-a"]')).toBeTruthy()
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
    expect(host.querySelectorAll('[data-loose-terminal]')).toHaveLength(1)
  })
  it.each(['S1', 'S2'])('%s选中后显示三项操作，方向可往返切换，设置只修改当前开关', (id) => {
    act(() => root.render(<Harness />))
    click(`[data-component-drag="${id}"]`)
    click(`[aria-label="切换${id}开关方向"]`)
    expect(host.querySelector(`[data-apparatus="${id}"]`)?.getAttribute('data-reversed')).toBe('true')
    click(`[aria-label="切换${id}开关方向"]`)
    expect(host.querySelector(`[data-apparatus="${id}"]`)?.getAttribute('data-reversed')).toBe('false')
    click(`[aria-label="${id}开关设置"]`)
    const name = host.querySelector<HTMLInputElement>('[aria-label="开关名称字母"]')!
    act(() => { name.value = 'K'; name.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector(`[data-apparatus="${id}"]`)?.textContent).toContain(`K${id.slice(1)}`)
    click('[aria-label="开关断路设置"]')
    expect(host.querySelector(`[data-switch-broken="${id}"]`)).toBeTruthy()
    expect(host.querySelector(`[data-switch-broken="${id === 'S1' ? 'S2' : 'S1'}"]`)).toBeNull()
    const angle = host.querySelector<HTMLInputElement>('[aria-label="开关旋转角度"]')!
    act(() => { angle.value = '90'; angle.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(host.querySelector(`[data-switch-body="${id}"]`)?.getAttribute('transform')).toContain('rotate(90')
    const wirePaths = () => Array.from(host.querySelectorAll('[data-wire]')).map(wire => wire.querySelector('path')!.getAttribute('d'))
    const pathsBeforeDeletion = wirePaths()
    click(`[aria-label="删除${id}开关"]`)
    expect(host.querySelector(`[data-apparatus="${id}"]`)).toBeNull()
    expect(host.querySelector(`[data-component-drag="${id}"]`)).toBeNull()
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
    expect(wirePaths()).toEqual(pathsBeforeDeletion)
    expect(host.querySelectorAll('[data-loose-terminal]')).toHaveLength(2)
    expect(host.querySelector(`[data-terminal="${id === 'S1' ? 'switch-a' : 'lamp2-a'}"]`)).toBeNull()
    const other = id === 'S1' ? 'S2' : 'S1'
    click(`[data-component-drag="${other}"]`)
    expect(host.querySelector(`[aria-label="${other}开关设置"]`)).toBeTruthy()
    expect(host.querySelector(`[data-apparatus="${other}"]`)).toBeTruthy()
  })
})
