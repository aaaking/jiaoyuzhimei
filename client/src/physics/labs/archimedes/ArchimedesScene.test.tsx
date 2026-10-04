// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ArchimedesLab, ArchimedesScene } from './ArchimedesScene'
import { archimedesController, readingsFor } from './controller'
import { rotatedLoadPosition } from './suspendedMotion'
import { createLabRuntime, reduceLabAction } from '../../runtime/reducer'
import { textbookPhysicsExperiments } from '../../curriculum/catalog'

afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('自动采样等待静止，取消计时或只读时不写数据，采样不增加撤销记录', () => {
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let runtime = createLabRuntime(archimedesController)
  runtime = reduceLabAction(runtime, { type: 'move', payload: { subject: 'object', position: { x: 474, y: 334 } } })
  const undoCount = runtime.past.length
  function render(readOnly = false) { root.render(<ArchimedesScene state={runtime.present} readOnly={readOnly} dispatch={action => { runtime = reduceLabAction(runtime, action); render() }} />) }
  act(() => render())
  act(() => vi.advanceTimersByTime(499))
  expect(runtime.present.samples.objectGravity).toBeNull()
  act(() => render(true))
  act(() => vi.advanceTimersByTime(1000))
  expect(runtime.present.samples.objectGravity).toBeNull()
  act(() => render())
  act(() => vi.advanceTimersByTime(500))
  expect(runtime.present.samples.objectGravity).toBe(.88)
  expect(runtime.past).toHaveLength(undoCount)
  act(() => root.unmount())
  expect(vi.getTimerCount()).toBe(0)
  runtime = reduceLabAction(runtime, { type: 'undo' })
  expect(runtime.present.samples.objectGravity).toBeNull()
  expect(runtime.present.attached).toBeNull()
})

it('测力计靠近页面顶部时读数仍在左上方，选择器材不会移到设置栏下', () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const state = archimedesController.createInitialState()
  state.positions.meter.y = 20
  act(() => root.render(<ArchimedesScene state={state} dispatch={() => {}} />))
  act(() => host.querySelector('[data-apparatus="meter"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  const label = host.querySelector('[data-meter-reading]')!
  expect(Number(label.getAttribute('x'))).toBeLessThan(-25)
  expect(Number(label.getAttribute('y'))).toBeLessThan(0)
  expect(label.getAttribute('text-anchor')).toBe('end')
  act(() => root.unmount())
})

it('小桶旁清空图标逐步倒水，动画期间不遮挡桶身，回正后恢复工具栏', () => {
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let state = { ...archimedesController.createInitialState(), collectedVolume: 10, liquidVolume: 80 }
  function render() { root.render(<ArchimedesScene state={state} dispatch={action => { state = archimedesController.reduce(state, action).state; render() }} />) }
  act(render)
  act(() => host.querySelector('[data-apparatus="bucket"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="倾倒清空小桶"]')!.click())
  act(() => vi.advanceTimersByTime(1000))
  expect(state.collectedVolume).toBeGreaterThan(0)
  expect(state.collectedVolume).toBeLessThan(10)
  expect(host.querySelector('[data-bucket-pour]')).toBeTruthy()
  expect(host.querySelector('button[aria-label="倾倒清空小桶"]')).toBeNull()
  expect(host.querySelector('[data-water-stream="pour"]')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1600))
  expect(state.bucketPour).toBeNull()
  expect(state.collectedVolume).toBe(0)
  expect(host.querySelector('[data-bucket-pour]')).toBeNull()
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="倾倒清空小桶"]')!.disabled).toBe(true)
  act(() => root.unmount())
  expect(vi.getTimerCount()).toBe(0)
})

it('断开图标固定在挂钩旁，选中无关器材不改变位置，右下角不显示采样读数', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state = archimedesController.createInitialState()
  state = archimedesController.reduce(state, { type: 'move', payload: { subject: 'bucket', position: { x: 474, y: 375 } } }).state
  act(() => root.render(<ArchimedesScene state={state} dispatch={() => {}} />))
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="断开挂钩"]')!
  const position = button.style.cssText
  for (const subject of ['object', 'cup', 'bucket', 'meter']) {
    act(() => host.querySelector(`[data-apparatus="${subject}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(button.style.cssText).toBe(position)
  }
  expect(host.textContent).not.toContain('G物')
  expect(host.textContent).not.toContain('G空桶')
  act(() => root.unmount())
})

it.each(['object', 'bucket'] as const)('悬挂%s随测力计移动起摆，断开采用可见位置且清理摆动帧', subject => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++nextId, fn); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  function tick(time: number) { act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)) }) }
  let state = archimedesController.createInitialState()
  state = archimedesController.reduce(state, { type: 'move', payload: { subject, position: { x: 474, y: subject === 'object' ? 334 : 375 } } }).state
  const initialReading = readingsFor(state).force
  function render() { root.render(<ArchimedesScene state={state} dispatch={action => { state = archimedesController.reduce(state, action).state; render() }} />) }
  act(render)
  tick(0)
  act(() => host.querySelector('[data-apparatus="meter"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  tick(1000 / 60)
  const load = host.querySelector(`[data-suspended-load="${subject}"]`)!
  const transform = load.getAttribute('transform')!
  const angle = Number(transform.match(/rotate\(([^ ]+)/)![1]) * Math.PI / 180
  expect(angle).toBeGreaterThan(0)
  expect(host.querySelector(`[data-apparatus="${subject}"]`)!.getAttribute('transform')).toBe(transform)
  expect(readingsFor(state).force).toBe(initialReading)
  const visible = rotatedLoadPosition(state.positions[subject], { x: state.positions.meter.x, y: state.positions.meter.y + 220 }, angle)
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="断开挂钩"]')!.click())
  expect(state.positions[subject]).toEqual(visible)
  expect(frames.size).toBe(0)
  state = archimedesController.reduce(state, { type: 'move', payload: { subject, position: { x: state.positions.meter.x, y: state.positions.meter.y + (subject === 'object' ? 234 : 275) } } }).state
  act(render)
  expect(host.querySelector(`[data-suspended-load="${subject}"]`)!.getAttribute('transform')).toMatch(/^rotate\(0 /)
  act(() => root.unmount())
  expect(frames.size).toBe(0)
})

it('关闭允许晃动或锁定小桶时不运行摆动，断开按钮在只读时禁用', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const raf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  for (const subject of ['object', 'bucket'] as const) {
    let state = archimedesController.createInitialState()
    state = archimedesController.reduce(state, { type: 'move', payload: { subject, position: { x: 474, y: subject === 'object' ? 334 : 375 } } }).state
    state = { ...state, bucketLocked: true, objectSettings: { ...state.objectSettings, sway: false } }
    act(() => root.render(<ArchimedesScene state={state} dispatch={() => {}} />))
    expect(raf).not.toHaveBeenCalled()
    act(() => root.render(<ArchimedesScene state={state} readOnly dispatch={() => {}} />))
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="断开挂钩"]')!.disabled).toBe(true)
  }
  act(() => root.unmount())
})

it.each(['object', 'bucket'] as const)('悬挂%s时显示断开标识，点击断开后标识消失并开始下落', subject => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state = archimedesController.createInitialState()
  state = archimedesController.reduce(state, { type: 'move', payload: { subject, position: { x: 474, y: subject === 'object' ? 334 : 375 } } }).state
  function render() { root.render(<ArchimedesScene state={state} dispatch={action => { state = archimedesController.reduce(state, action).state; render() }} />) }
  act(render)
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="断开挂钩"]')
  expect(button).toBeTruthy()
  const position = { ...state.positions[subject] }
  act(() => button!.click())
  expect(state.attached).toBeNull()
  expect(state.positions[subject]).toEqual(position)
  expect(state.falling[subject]).toBe(0)
  expect(host.querySelector('button[aria-label="断开挂钩"]')).toBeNull()
  act(() => root.unmount())
})

it('选中测力计后从3D按钮打开左侧模型，关闭查看不改变实验状态', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const state = archimedesController.createInitialState()
  const dispatch = vi.fn()
  act(() => root.render(<ArchimedesScene state={state} dispatch={dispatch} />))
  expect(host.querySelector('button[aria-label="打开弹簧测力计3D模型"]')).toBeNull()
  act(() => host.querySelector('[data-apparatus="meter"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  const open = host.querySelector<HTMLButtonElement>('button[aria-label="打开弹簧测力计3D模型"]')
  expect(open).toBeTruthy()
  act(() => open!.click())
  expect(host.querySelector('[aria-label="弹簧测力计3D模型"]')).toBeTruthy()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="关闭测力计3D模型"]')!.click())
  expect(host.querySelector('[aria-label="弹簧测力计3D模型"]')).toBeNull()
  expect(dispatch).not.toHaveBeenCalled()
  act(() => root.unmount())
})

it('实验数据自动记录，面板保留摘下、补水与下一组入口，移除手动记录和重做', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="实验数据"]')!.click())
  expect(host.querySelector('button[aria-label="记录测力计示数"]')).toBeNull()
  expect(host.querySelector('button[aria-label="重做"]')).toBeNull()
  expect(host.textContent).not.toContain('记录本组数据')
  expect(host.querySelector('button[aria-label="摘下器材"]')).toBeTruthy()
  expect(host.querySelector('button[aria-label="溢水杯加满水"]')).toBeTruthy()
  expect(host.querySelector('button[aria-label="开始下一组实验"]')).toBeTruthy()
  expect(host.textContent).toContain('物体重 G物')
  expect(host.textContent).toContain('液中示数 F示')
  act(() => root.unmount())
})

it('真实场景四步拖动自动保存浮力等于排液重力，无需手动采样', () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  const svg = host.querySelector('svg[aria-label="阿基米德原理实验台"]')!
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } matrixTransform() { return this } })
  function drag(subject: string, from: number[], to: number[]) {
    const el = host.querySelector(`[data-apparatus="${subject}"]`)!
    Object.assign(el, { setPointerCapture() {}, hasPointerCapture: () => false })
    act(() => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: from[0], clientY: from[1] })))
    act(() => el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: to[0], clientY: to[1] })))
    act(() => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: to[0], clientY: to[1] })))
  }
  function click(label: string) { act(() => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()) }
  click('实验数据')
  drag('object', [474, 430], [474, 349])
  act(() => vi.advanceTimersByTime(600))
  drag('meter', [474, 100], [195, 86])
  expect(host.textContent).toContain('10.0 mL')
  act(() => vi.advanceTimersByTime(600))
  drag('meter', [195, 86], [474, 100])
  click('摘下器材')
  drag('bucket', [363, 378], [474, 375])
  act(() => vi.advanceTimersByTime(600))
  click('倒空小桶')
  act(() => vi.advanceTimersByTime(2600))
  act(() => vi.advanceTimersByTime(600))
  expect(host.textContent).toContain('排液完整收集，物体未碰底')
  const rows = Array.from(host.querySelectorAll('tr')).map(el => el.textContent)
  expect(rows).toContain('浮力 F浮0.1 N计算值')
  expect(rows).toContain('排液重力 G排0.1 N计算值')
  click('开始下一组实验')
  expect(host.textContent).toContain('第 1 组')
  expect(host.querySelector('[aria-label="本组测量"]')?.textContent).not.toContain('0.88 N')
  act(() => root.unmount())
})

it('器材拖到桌外松手会启动下落，指针取消不会提交下落', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const state = archimedesController.createInitialState()
  let runtime = createLabRuntime(archimedesController, state)
  act(() => root.render(<ArchimedesScene state={state} dispatch={action => { runtime = reduceLabAction(runtime, action) }} onOpenReport={() => {}} />))
  const svg = host.querySelector('svg[aria-label="阿基米德原理实验台"]')!
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } matrixTransform() { return this } })
  const object = host.querySelector('[data-apparatus="object"]')!
  Object.assign(object, { setPointerCapture() {}, hasPointerCapture: () => false })
  for (const endType of ['pointercancel', 'pointerup']) {
    act(() => object.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: 474, clientY: 430 })))
    act(() => object.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 700, clientY: 430 })))
    act(() => object.dispatchEvent(new PointerEvent(endType, { bubbles: true, pointerId: 1, clientX: 700, clientY: 430 })))
    if (endType === 'pointercancel') expect(runtime.past).toHaveLength(0)
  }
  act(() => root.unmount())
  expect(runtime.present.falling.object).toBe(0)
  expect(runtime.past).toHaveLength(1)
})

it('从实验台打开独立的可编辑报告，并保留实验目的及操作步骤', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  expect(host.querySelector('svg[aria-label="阿基米德原理实验台"]')).toBeTruthy()
  expect(host.querySelectorAll('[data-apparatus]')).toHaveLength(4)
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="实验报告"]')!.click())
  expect(host.querySelector('aside')?.textContent).toContain('称重法')
  expect(host.querySelector('aside')?.textContent).toContain('溢水口')
  expect(host.querySelector('aside')?.textContent).not.toContain('电流表串联')
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="编辑实验报告"]')!.click())
  const input = host.querySelector<HTMLInputElement>('input[aria-label="报告标题"]')!
  act(() => { input.value = '我的浮力实验'; input.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="保存实验报告"]')!.click())
  expect(localStorage.getItem('physics:archimedes-principle:instruction-report:v1')).toContain('我的浮力实验')
  expect(localStorage.getItem('physics:ammeter-use:instruction-report:v1')).toBeNull()
  act(() => root.unmount())
})

it('选中物块切换材质会更新绘制；删除后器材复位恢复且设置保留', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  act(() => host.querySelector('[data-apparatus="object"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(host.querySelector('button[aria-label="金属块设置"]')).toBeTruthy()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="金属块设置"]')!.click())
  const type = host.querySelector<HTMLSelectElement>('select[aria-label="物块类型"]')!
  act(() => { type.value = 'iron'; type.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.querySelector('[data-object-material="iron"]')).toBeTruthy()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="物块刻度线"]')!.click())
  expect(host.querySelector('[data-object-scale]')).toBeTruthy()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="删除金属块"]')!.click())
  expect(host.querySelector('[data-apparatus="object"]')).toBeNull()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="复位器材摆位"]')!.click())
  expect(host.querySelector('[data-apparatus="object"]')).toBeTruthy()
  expect(host.querySelector('[data-object-material="iron"]')).toBeTruthy()
  act(() => root.unmount())
})

it.each([
  { label: '先正向后反向', points: [494, 464, 466], expectedX: 496 },
  { label: '先反向再回到起点附近', points: [470, 472], expectedX: 476 },
])('$label：单向指针拖动立即响应正向2像素，一次撤销恢复原位', ({ points, expectedX }) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state = archimedesController.createInitialState()
  state = archimedesController.reduce(state, { type: 'setMeterSettings', payload: { ...state.meterSettings, direction: 'right' } }).state
  let runtime = createLabRuntime(archimedesController, state)
  act(() => root.render(<ArchimedesScene state={state} dispatch={action => { runtime = reduceLabAction(runtime, action) }} onOpenReport={() => {}} />))
  // happy-dom不实现SVG坐标与指针捕获；使用单位坐标映射，保留实际场景事件与控制器。
  const svg = host.querySelector('svg[aria-label="阿基米德原理实验台"]')!
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } matrixTransform() { return this } })
  const meter = host.querySelector('[data-apparatus="meter"]')!
  Object.assign(meter, { setPointerCapture() {}, hasPointerCapture: () => false })
  function pointer(type: string, x: number) { act(() => meter.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: 200 }))) }
  pointer('pointerdown', 474)
  for (const x of points) pointer('pointermove', x)
  const previewX = host.querySelector('[data-apparatus="meter"] rect')?.getAttribute('x')
  const handX = host.querySelector('[data-meter-grip-hand]')?.getAttribute('x')
  pointer('pointerup', points.at(-1)!)
  act(() => root.unmount())
  expect(previewX).toBe(String(expectedX - 29))
  expect(handX).toBe(String(expectedX - 24))
  expect(runtime.present.positions.meter).toEqual({ x: expectedX, y: 100 })
  expect(runtime.past).toHaveLength(1)
  runtime = reduceLabAction(runtime, { type: 'undo' })
  expect(runtime.present.positions.meter).toEqual({ x: 474, y: 100 })
})

it('小桶设置可锁定、删除，复位后保留锁定且能解锁', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  act(() => host.querySelector('[data-apparatus="bucket"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  expect(host.querySelector('button[aria-label="小桶设置"]')).toBeTruthy()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="小桶设置"]')!.click())
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="锁定小桶"]')!.click())
  act(() => host.querySelector('[data-apparatus="bucket"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  expect(host.querySelector('[data-apparatus="bucket"] rect')?.getAttribute('x')).toBe('311')
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="删除小桶"]')!.click())
  expect(host.querySelector('[data-apparatus="bucket"]')).toBeNull()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="复位器材摆位"]')!.click())
  act(() => host.querySelector('[data-apparatus="bucket"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="小桶设置"]')!.click())
  expect(host.querySelector('[aria-label="锁定小桶"]')?.getAttribute('aria-checked')).toBe('true')
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="锁定小桶"]')!.click())
  act(() => host.querySelector('[data-apparatus="bucket"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  expect(host.querySelector('[data-apparatus="bucket"] rect')?.getAttribute('x')).toBe('316')
  act(() => root.unmount())
})

it.each([['up', 310, 90], ['down', 330, 110]] as const)('都不锁定时拖挂钩向%s不跳跃，测力计只移动10像素', (direction, pointerY, meterY) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let state = archimedesController.createInitialState()
  state = archimedesController.reduce(state, { type: 'setMeterSettings', payload: { ...state.meterSettings, direction, lockMode: 'none' } }).state
  let result = state
  act(() => root.render(<ArchimedesScene state={state} dispatch={action => { result = archimedesController.reduce(result, action).state }} onOpenReport={() => {}} />))
  const svg = host.querySelector('svg[aria-label="阿基米德原理实验台"]')!
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } matrixTransform() { return this } })
  const hook = host.querySelector('[aria-label="拖动测力计挂钩"]')!
  Object.assign(hook, { setPointerCapture() {}, hasPointerCapture: () => false })
  act(() => hook.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: 474, clientY: 320 })))
  act(() => hook.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, button: 0, clientX: 474, clientY: pointerY })))
  act(() => hook.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0, clientX: 474, clientY: pointerY })))
  act(() => root.unmount())
  expect(result.positions.meter).toEqual({ x: 474, y: meterY })
})

it('溢水杯可改名、切换杯底绳、恢复水位与删除，摆位复位保留名称和开关', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const experiment = textbookPhysicsExperiments.find(e => e.id === 'archimedes-principle')!
  act(() => root.render(<MemoryRouter><ArchimedesLab experiment={experiment} /></MemoryRouter>))
  act(() => host.querySelector('[data-apparatus="cup"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="溢水杯设置"]')!.click())
  const input = host.querySelector<HTMLInputElement>('input[aria-label="溢水杯名称"]')!
  act(() => { input.value = '实验杯'; input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
  expect(host.querySelector('[data-cup-name]')?.textContent).toBe('实验杯')
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="底部用绳子连接物体"]')!.click())
  act(() => host.querySelector('[data-apparatus="cup"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="恢复溢水杯默认水位"]')!.click())
  expect(host.querySelector('[data-apparatus="cup"] rect')?.getAttribute('x')).toBe('90')
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="删除溢水杯"]')!.click())
  expect(host.querySelector('[data-apparatus="cup"]')).toBeNull()
  expect(host.querySelector('[data-cup-name]')).toBeNull()
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="复位器材摆位"]')!.click())
  act(() => host.querySelector('[data-apparatus="cup"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="溢水杯设置"]')!.click())
  expect(host.querySelector('[data-cup-name]')?.textContent).toBe('实验杯')
  expect(host.querySelector('[aria-label="底部用绳子连接物体"]')?.getAttribute('aria-checked')).toBe('true')
  act(() => root.unmount())
})

it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'blur'])('按住测力计即显示顶部手势，%s清除手势且不增加实验记录', endType => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const state = archimedesController.createInitialState()
  let runtime = createLabRuntime(archimedesController, state)
  act(() => root.render(<ArchimedesScene state={state} dispatch={action => { runtime = reduceLabAction(runtime, action) }} onOpenReport={() => {}} />))
  const svg = host.querySelector('svg[aria-label="阿基米德原理实验台"]')!
  Object.defineProperty(svg, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y } matrixTransform() { return this } })
  const meter = host.querySelector('[data-apparatus="meter"]')!
  Object.assign(meter, { setPointerCapture() {}, hasPointerCapture: () => false })
  act(() => meter.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: 474, clientY: 200 })))
  const handVisible = !!host.querySelector('[data-meter-grip-hand]')
  act(() => {
    if (endType === 'blur') window.dispatchEvent(new Event('blur'))
    else meter.dispatchEvent(new PointerEvent(endType, { bubbles: true, pointerId: 1, clientX: 474, clientY: 200 }))
  })
  const handHidden = !host.querySelector('[data-meter-grip-hand]')
  act(() => root.unmount())
  expect(handVisible).toBe(true)
  expect(handHidden).toBe(true)
  expect(runtime.past).toHaveLength(0)
})
