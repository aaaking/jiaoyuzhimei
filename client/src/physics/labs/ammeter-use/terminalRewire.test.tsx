// @vitest-environment happy-dom
import { act, useState, type ReactNode, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController, evaluatePracticeCircuit } from './practiceController'
import type { AmmeterTerminalId } from './definition'

// 固定相机只隔离画布动画，保留场景真实指针处理、命中测试及文档选择监听。
vi.mock('../../runtime/immersive/InfiniteCanvas', () => ({
  default: ({ children, stageRef }: { children: ReactNode; stageRef: RefObject<HTMLDivElement> }) => <div ref={stageRef}>{children}</div>,
  PERSPECTIVE_DEPTH: 1600,
}))
let host: HTMLDivElement
let root: Root
const dispatch = vi.fn()
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 960, 540))
  Object.defineProperties(SVGElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  })
  dispatch.mockClear()
  act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers() })
function terminal(id: AmmeterTerminalId) { return host.querySelector(`[data-terminal="${id}"]`)! }
function emit(element: Element, type: string, point: { x: number; y: number }, options = {}) {
  act(() => element.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: point.x, clientY: point.y, bubbles: true, ...options })))
}
function point(element: Element) { return { x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')) } }
function drag(from: AmmeterTerminalId, to: AmmeterTerminalId, options = {}) {
  const source = terminal(from)
  emit(source, 'pointerdown', point(source), options)
  emit(source, 'pointermove', point(terminal(to)))
  emit(source, 'pointerup', point(terminal(to)))
}
describe('接线柱拖动重接', () => {
  it.each(['battery+', 'battery-', 'switch-a', 'switch-b', 'ammeter-neg', 'ammeter-3', 'lamp2-a', 'lamp2-b'] as AmmeterTerminalId[])('%s上的单根导线直接重接，不新增导线', (from) => {
    drag(from, 'ammeter-0.6')
    const edge = practiceController.createInitialState().edges.find((edge) => edge.from === from || edge.to === from)!
    expect(dispatch).toHaveBeenCalledWith({ type: 'rewire', payload: { edge, endpoint: from, target: 'ammeter-0.6' } }, 'rewire-wire')
    expect(dispatch.mock.calls.some(([action]) => action.type === 'connect')).toBe(false)
  })
  it('多线柱未选线时不擅自挪线，选中后只重接所选导线', () => {
    drag('lamp1-b', 'ammeter-0.6')
    expect(dispatch).not.toHaveBeenCalled()
    expect(host.textContent).toContain('请先点选')
    const wire = host.querySelector('[data-wire-hit="ammeter-neg::lamp1-b"]')!
    act(() => wire.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    drag('lamp1-b', 'ammeter-0.6')
    expect(dispatch).toHaveBeenCalledWith({ type: 'rewire', payload: { edge: { from: 'ammeter-neg', to: 'lamp1-b' }, endpoint: 'lamp1-b', target: 'ammeter-0.6' } }, 'rewire-wire')
  })
  it.each(['ammeter-3', 'lamp1-b'] as AmmeterTerminalId[])('Shift从%s拖动新增导线，原线仍在', (from) => {
    drag(from, 'ammeter-0.6', { shiftKey: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'connect', payload: { from, to: 'ammeter-0.6' } }, 'connect-wire')
    expect(dispatch.mock.calls.some(([action]) => action.type === 'rewire')).toBe(false)
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
  })
  it.each(['pointerup', 'pointercancel'])('空白落点或取消%s恢复原线，释放捕获且不拆线', (end) => {
    const source = terminal('ammeter-3')
    emit(source, 'pointerdown', point(source))
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
    emit(source, 'pointermove', { x: 910, y: 500 })
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(5)
    emit(source, end, { x: 910, y: 500 })
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'dragCancel' }), 'cancel-wire')
    expect(source.releasePointerCapture).toHaveBeenCalledWith(1)
  })
})


describe('未接线的各器材接线柱独立拉出新导线', () => {
  it.each(['battery+', 'battery-', 'switch-a', 'switch-b', 'lamp1-a', 'lamp1-b', 'lamp2-a', 'lamp2-b', 'ammeter-neg', 'ammeter-0.6', 'ammeter-3'] as AmmeterTerminalId[])('%s可以单独点选，再按住左键向其他柱接线', (from) => {
    act(() => root.render(<AmmeterScene state={{ ...practiceController.createInitialState(), edges: [], activeRange: null }} dispatch={dispatch} />))
    const source = terminal(from)
    emit(source, 'pointerdown', point(source))
    emit(source, 'pointerup', point(source))
    expect(source.getAttribute('aria-pressed')).toBe('true')
    dispatch.mockClear()
    const target = from === 'ammeter-neg' ? 'battery-' : 'ammeter-neg'
    drag(from, target)
    expect(dispatch).toHaveBeenCalledWith({ type: 'connect', payload: { from, to: target } }, 'connect-wire')
    expect(dispatch.mock.calls.some(([action]) => action.type === 'rewire')).toBe(false)
  })
})


describe('点选与实际拖线分开，拖线不自动断电', () => {
  it.each(['switch-a', 'lamp2-a', 'battery+', 'lamp1-a', 'ammeter-3'] as AmmeterTerminalId[])('通电时单击%s只选中，小幅抖动也不会开关或拆线', (id) => {
    const on = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    act(() => root.render(<AmmeterScene state={on} dispatch={dispatch} />))
    const source = terminal(id), start = point(source)
    emit(source, 'pointerdown', start)
    emit(source, 'pointermove', { x: start.x + 1, y: start.y + 1 })
    emit(source, 'pointerup', start)
    expect(source.getAttribute('aria-pressed')).toBe('true')
    expect(dispatch).not.toHaveBeenCalled()
    expect(host.querySelectorAll('[data-wire]')).toHaveLength(6)
  })
  it.each(['open', 'on', 'closed-incomplete'])('%s状态下可从接线柱拖线，带电重接不扳开关；取消保留原线', (mode) => {
    const initial = practiceController.createInitialState()
    const prepared = mode === 'open' ? initial : practiceController.reduce(initial, { type: 'setSwitch', payload: 'closed' }).state
    let current = mode === 'closed-incomplete' ? { ...prepared, edges: prepared.edges.slice(1) } : prepared
    const original = current.edges
    function LiveScene() {
      const [state, setState] = useState(current)
      return <AmmeterScene state={state} dispatch={(action, reason) => {
        dispatch(action, reason)
        setState(previous => { current = practiceController.reduce(previous, action).state; return current })
      }} />
    }
    act(() => root.render(<LiveScene />))
    const source = terminal('ammeter-3')
    emit(source, 'pointerdown', point(source))
    expect(current.switchClosed).toBe(mode !== 'open')
    emit(source, 'pointermove', { x: 910, y: 500 })
    expect(host.querySelector('[data-reading]')!.getAttribute('data-reading')).toBe('0')
    expect(current.switchClosed).toBe(mode !== 'open')
    expect(evaluatePracticeCircuit(current).current > 0).toBe(mode === 'on')
    emit(source, 'pointercancel', { x: 910, y: 500 })
    expect(current.edges).toEqual(original)
    expect(Number(host.querySelector('[data-reading]')!.getAttribute('data-reading')) > 0).toBe(mode === 'on')
    drag('ammeter-3', 'ammeter-0.6')
    expect(current.switchClosed).toBe(mode !== 'open')
    expect(current.activeRange).toBe('0.6A')
    expect(current.edges).toHaveLength(original.length)
    expect(current.edges.some(edge => edge.from === 'ammeter-3' || edge.to === 'ammeter-3')).toBe(false)
  })
})


describe('持续电池过流损坏的浏览器时序', () => {
  it('持续过流3秒会损坏；及时拆线不会触发过期损坏', () => {
    vi.useFakeTimers()
    const short = { ...practiceController.createInitialState(), edges: [{ from: 'battery+', to: 'battery-' }] as const, activeRange: null }
    act(() => root.render(<AmmeterScene state={short} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(2999))
    expect(dispatch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(dispatch).toHaveBeenCalledWith({ type: 'damageSource' }, 'source-overheat')
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    dispatch.mockClear()
    act(() => root.render(<AmmeterScene state={short} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(1000))
    act(() => root.render(<AmmeterScene state={{ ...short, edges: [] }} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(4000))
    expect(dispatch).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})


describe('电表持续过载的可观察延迟', () => {
  it('关闭瞬间损坏时1500ms后热损坏，提前拆线取消损坏', () => {
    vi.useFakeTimers()
    const initial = practiceController.createInitialState()
    const short = { ...initial, activeRange: '0.6A' as const, edges: [{ from: 'battery+', to: 'ammeter-0.6' }, { from: 'ammeter-neg', to: 'battery-' }] as const, meterSettings: { ...initial.meterSettings!, overloadDamage: false, smallResistance: 1 as const } }
    act(() => root.render(<AmmeterScene state={short} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(1499))
    expect(dispatch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(dispatch).toHaveBeenCalledWith({ type: 'damageMeter' }, 'meter-overheat')
    act(() => root.render(<AmmeterScene state={initial} dispatch={dispatch} />))
    dispatch.mockClear()
    act(() => root.render(<AmmeterScene state={short} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(1000))
    act(() => root.render(<AmmeterScene state={{ ...short, edges: [] }} dispatch={dispatch} />))
    act(() => vi.advanceTimersByTime(2000))
    expect(dispatch).not.toHaveBeenCalled()
  })
})
