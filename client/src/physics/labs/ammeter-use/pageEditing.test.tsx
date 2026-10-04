// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ImmersiveLabStage from '../../runtime/immersive/ImmersiveLabStage'
import { AmmeterLab, AmmeterScene } from './CompetitorScene.tsx'
import { nearestTerminal } from './terminalHit'
import { textbookPhysicsExperiments } from '../../curriculum/catalog'
import { practiceController } from './practiceController'
import { AmmeterA1 } from './RealisticParts'
import { TERMINAL_OWNER } from './layout'
import { MeterCurrentGraph } from './MeterInspector'
import { createReferenceLayout } from './referenceLayout'
import { terminalPosition } from './layout'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers() })
function mountTitle() {
  act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" backTo="/physics" editableTitleStorageKey="test-lab-title"><div /></ImmersiveLabStage></MemoryRouter>))
}
function selectWire(index = 0) {
  const wire = host.querySelectorAll('[data-wire-selectable]')[index]
  expect(wire).toBeTruthy()
  act(() => wire.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function pressDelete(target: EventTarget = document) {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })))
}

describe('通电导线动态方向与删除后的命中区', () => {
  it('闭合时四根导线展示循环运动箭头；断开即移除', () => {
    const state = { ...practiceController.createInitialState(), switchClosed: true }
    act(() => root.render(<AmmeterScene state={state} dispatch={vi.fn()} />))
    expect(host.querySelectorAll('[data-wire-flow]')).toHaveLength(4)
    const motion = host.querySelector('animateMotion')!
    expect(motion.getAttribute('repeatCount')).toBe('indefinite')
    expect(motion.getAttribute('path')).toBe(host.querySelector('[data-wire] path')!.getAttribute('d'))
    expect(motion.getAttribute('rotate')).toBe('auto')
    act(() => root.render(<AmmeterScene state={{ ...state, switchClosed: false }} dispatch={vi.fn()} />))
    expect(host.querySelectorAll('[data-wire-flow]')).toHaveLength(0)
  })
  it('已删除电流表的端子不参与最近接线柱命中', () => {
    const layout = createReferenceLayout()
    const point = terminalPosition(layout, 'ammeter-neg')
    expect(nearestTerminal(layout, point)?.id).toBe('ammeter-neg')
    expect(nearestTerminal(layout, point, true)?.id).not.toMatch(/^ammeter-/)
  })
})

describe('实验报告的电路图和编辑', () => {
  function openReport() {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="实验报告"]')!.click())
    return host.querySelector<HTMLElement>('aside[aria-label="实验报告"]')!
  }
  it('默认只读，并在步骤2和步骤3之间显示串联电路图', () => {
    const report = openReport()
    expect(report.querySelector('input,textarea,[contenteditable="true"]')).toBeNull()
    const image = report.querySelector('img[alt*="串联电路图"]')!
    expect(image).toBeTruthy()
    expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(image.closest('figure')?.previousElementSibling?.textContent).toContain('2.按照电路图')
    expect(image.closest('figure')?.nextElementSibling?.textContent).toContain('3.断开开关')
  })
  it('保存的默认电路图旧地址自动恢复，同时保留报告文字、图片说明和上传图片', () => {
    const uploaded = 'data:image/png;base64,YQ=='
    localStorage.setItem('physics:ammeter-use:instruction-report:v1', JSON.stringify({
      title: '我的实验报告',
      sections: [{ id: 'section-3', title: '我的操作步骤', blocks: [
        { id: 'step-2', type: 'text', text: '2.按我的电路图接线' },
        { id: 'circuit', type: 'image', src: '/old-deployment/physics/ammeter/report-circuit.png', alt: '我的电路说明' },
        { id: 'uploaded', type: 'image', src: uploaded, alt: '课堂补充截图' },
        { id: 'step-3', type: 'text', text: '3.测量小量程电流' },
      ] }],
    }))
    let report = openReport()
    const circuit = report.querySelector<HTMLImageElement>('img[alt="我的电路说明"]')!
    expect(circuit.getAttribute('src')).toMatch(/^data:image\/png;base64,iVBOR/)
    expect(report.textContent).toContain('我的实验报告')
    expect(report.textContent).toContain('我的操作步骤')
    expect(report.textContent).toContain('2.按我的电路图接线')
    expect(report.textContent).toContain('3.测量小量程电流')
    expect(report.querySelector('img[alt="课堂补充截图"]')?.getAttribute('src')).toBe(uploaded)
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="编辑实验报告"]')!.click())
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="保存实验报告"]')!.click())
    act(() => root.unmount()); root = createRoot(host)
    report = openReport()
    expect(report.querySelector('img[alt="我的电路说明"]')?.getAttribute('src')).toBe(circuit.getAttribute('src'))
    expect(report.querySelector('img[alt="课堂补充截图"]')?.getAttribute('src')).toBe(uploaded)
  })
  it('编辑标题、章节和段落，删除电路图片，保存及重新挂载后保持修改', () => {
    let report = openReport()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="编辑实验报告"]')!.click())
    function input(label: string, value: string) {
      const el = report.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
      act(() => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })) })
    }
    input('报告标题', '我的实验报告')
    input('第1节标题', '实验目标')
    input('第1节第1段', '修改后的目标')
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="删除第4节第3块图片"]')!.click())
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="保存实验报告"]')!.click())
    expect(report.querySelector('input,textarea')).toBeNull()
    expect(report.textContent).toContain('修改后的目标')
    expect(report.querySelector('img')).toBeNull()
    act(() => root.unmount()); root = createRoot(host)
    report = openReport()
    expect(report.textContent).toContain('我的实验报告')
    expect(report.textContent).toContain('实验目标')
    expect(report.querySelector('img')).toBeNull()
  })
  it('可新增、删除文字块和图片，收起时保存且再打开默认只读', () => {
    const report = openReport()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="编辑实验报告"]')!.click())
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="为第1节添加文字"]')!.click())
    expect(report.querySelectorAll('textarea')).toHaveLength(12)
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="删除第1节第2块文字"]')!.click())
    expect(report.querySelectorAll('textarea')).toHaveLength(11)
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/png;base64,YQ==' })
      this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>)
    })
    const upload = report.querySelector<HTMLInputElement>('[aria-label="为第1节添加图片"]')!
    Object.defineProperty(upload, 'files', { value: [new File(['image'], 'test.png', { type: 'image/png' })] })
    act(() => upload.dispatchEvent(new Event('change', { bubbles: true })))
    expect(report.querySelector('img[src="data:image/png;base64,YQ=="]')).toBeTruthy()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="删除第1节第2块图片"]')!.click())
    expect(report.querySelector('img[src="data:image/png;base64,YQ=="]')).toBeNull()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="收起实验报告"]')!.click())
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="实验报告"]')!.click())
    expect(host.querySelector('aside input, aside textarea')).toBeNull()
  })
  it('使用说明、边做边看入口和名称深色背底已移除', () => {
    openReport()
    expect(host.textContent).not.toContain('全屏画布任意摆放')
    expect(host.querySelector('[aria-label="边做边看"]')).toBeNull()
    act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" backTo="/physics" editableTitleStorageKey="test-lab-title"><div /></ImmersiveLabStage></MemoryRouter>))
    const title = host.querySelector('[data-editable-lab-title]')!
    expect(title.className).not.toContain('bg-')
    expect(title.className).not.toContain('border-white')
    expect(title.querySelector('[aria-label="编辑实验标题"]')).toBeTruthy()
  })
  it('收起时保存失败会保留编辑内容和错误提示，恢复存储后可以保存收起', () => {
    const report = openReport()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="编辑实验报告"]')!.click())
    const input = report.querySelector<HTMLInputElement>('[aria-label="报告标题"]')!
    act(() => { input.value = '未保存的报告'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    const storage = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="收起实验报告"]')!.click())
    expect(host.querySelector('aside[aria-label="实验报告"]')).toBe(report)
    expect(report.querySelector<HTMLInputElement>('[aria-label="报告标题"]')?.value).toBe('未保存的报告')
    expect(report.querySelector('[role="status"]')?.textContent).toContain('未能保存到本机')
    storage.mockRestore()
    act(() => report.querySelector<HTMLButtonElement>('[aria-label="收起实验报告"]')!.click())
    expect(host.querySelector('aside[aria-label="实验报告"]')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="实验报告"]')!.click())
    expect(host.querySelector('aside')?.textContent).toContain('未保存的报告')
    expect(host.querySelector('aside input')).toBeNull()
  })
  it('场景报告入口使用外壳提供的统一报告动作，不另开本地报告', () => {
    const onOpenReport = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} onOpenReport={onOpenReport} />))
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="实验报告"]')!.click())
    expect(onOpenReport).toHaveBeenCalledOnce()
    expect(host.querySelector('aside[aria-label="实验报告"]')).toBeNull()
  })
  it('工具栏报告动作可以交给统一报告，不打开第二个内容面板', () => {
    const onOpen = vi.fn()
    act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" backTo="/physics" panels={[{ id: 'report', label: '实验报告', content: '另一个报告', onOpen }]}><div /></ImmersiveLabStage></MemoryRouter>))
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="实验报告"]')!.click())
    expect(onOpen).toHaveBeenCalledOnce()
    expect(host.querySelector('aside')).toBeNull()
  })
})

describe('器材接线与表针随动', () => {
  it('每根导线两端露出金属，接在柱帽下方；共用灯座接线柱的两根线分别保留裸线', () => {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    expect(host.querySelectorAll('[data-wire-bare-end]')).toHaveLength(12)
    for (const [terminal, shaftBelowHitCenter] of [
      ['battery-', 8.47], ['battery+', 8.47],
      ['switch-a', 6.96], ['switch-b', 6.96],
      ['lamp2-a', 6.96], ['lamp2-b', 6.96],
      ['lamp1-a', 10.26], ['lamp1-b', 10.26],
      ['ammeter-neg', 10.125], ['ammeter-3', 10.125],
    ] as const) {
      const ends = host.querySelectorAll(`[data-wire-bare-end="${terminal}"]`)
      expect(ends.length).toBeGreaterThan(0)
      const hit = host.querySelector(`[data-terminal="${terminal}"]`)!
      for (const end of ends) {
        const [x, y] = end.getAttribute('transform')!.match(/translate\(([^)]+)\)/)![1].split(' ').map(Number)
        expect(x).toBeCloseTo(Number(hit.getAttribute('cx')), 2)
        expect(y - Number(hit.getAttribute('cy'))).toBeCloseTo(shaftBelowHitCenter, 2)
      }
    }
    for (const post of ['lamp1-a', 'lamp1-b']) {
      const ends = host.querySelectorAll(`[data-wire-bare-end="${post}"]`)
      expect(ends).toHaveLength(2)
      expect(ends[0].querySelector('path')!.getAttribute('d')).not.toBe(ends[1].querySelector('path')!.getAttribute('d'))
    }
  })
  it('开关翻转并旋转90度后，裸线仍接金属柱，接线热区仍在柱帽上', () => {
    const initial = practiceController.createInitialState()
    const flipped = practiceController.reduce(initial, { type: 'flipSwitch', payload: 'S1' }).state
    const state = practiceController.reduce(flipped, { type: 'setSwitchSettings', payload: { id: 'S1', settings: { ...flipped.switches!.S1, angle: 90 } } }).state
    act(() => root.render(<AmmeterScene state={state} dispatch={vi.fn()} />))
    const end = host.querySelector('[data-wire-bare-end="switch-a"]')!
    const hit = host.querySelector('[data-terminal="switch-a"]')!
    const [x, y] = end.getAttribute('transform')!.match(/translate\(([^)]+)\)/)![1].split(' ').map(Number)
    expect(Number(hit.getAttribute('cx')) - x).toBeCloseTo(12.96, 2)
    expect(Number(hit.getAttribute('cy')) - y).toBeCloseTo(6, 2)
    expect(end.getAttribute('transform')).toContain('rotate(90)')
    expect(hit.getAttribute('transform')).toContain('rotate(90')
  })
  it('删除器材保留原有裸线，并把悬空端的拖线热区放在可见线头上', () => {
    const initial = practiceController.createInitialState()
    act(() => root.render(<AmmeterScene state={initial} dispatch={vi.fn()} />))
    const paths = () => [...host.querySelectorAll('[data-wire] path:first-child')].map(path => path.getAttribute('d'))
    const before = paths()
    const deleted = practiceController.reduce(initial, { type: 'deleteSwitch', payload: 'S1' }).state
    act(() => root.render(<AmmeterScene state={deleted} dispatch={vi.fn()} />))
    expect(paths()).toEqual(before)
    for (const id of ['switch-a', 'switch-b']) {
      const bare = host.querySelector(`[data-wire-bare-end="${id}"]`)!
      const [x, y] = bare.getAttribute('transform')!.match(/translate\(([^)]+)\)/)![1].split(' ').map(Number)
      const hit = host.querySelector(`[data-loose-terminal="${id}"]`)!
      expect(Number(hit.getAttribute('cx'))).toBeCloseTo(x, 2)
      expect(Number(hit.getAttribute('cy'))).toBeCloseTo(y, 2)
    }
  })
  it('五件器材的接线覆盖区域均在图片之后，包含金属接点，六根线都补齐前景接线段', () => {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    const contacts = host.querySelector('[data-wire-contacts]')!
    expect(contacts.querySelectorAll('[data-wire-contact]')).toHaveLength(6)
    for (const id of ['E1', 'S1', 'S2', 'L1', 'A1']) {
      const apparatus = host.querySelector(`[data-apparatus="${id}"]`)!
      expect(apparatus.compareDocumentPosition(contacts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const rect = host.querySelector(`[data-contact-owner="${id}"]`)!
      expect(rect).toBeTruthy()
      const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y'))
      const width = Number(rect.getAttribute('width')), height = Number(rect.getAttribute('height'))
      for (const terminal of host.querySelectorAll('[data-wire-bare-end]')) {
        if (TERMINAL_OWNER[terminal.getAttribute('data-wire-bare-end') as keyof typeof TERMINAL_OWNER] !== id) continue
        const [cx, cy] = terminal.getAttribute('transform')!.match(/translate\(([^)]+)\)/)![1].split(' ').map(Number)
        expect(cx).toBeGreaterThanOrEqual(x)
        expect(cx).toBeLessThanOrEqual(x + width)
        expect(cy).toBeGreaterThan(y)
        expect(cy).toBeLessThan(y + height)
      }
    }
  })
  it('拖动只平移表身，指针坐标/旋转中心保持本地固定，读数变化仍更新角度', () => {
    function render(x: number, y: number, reading = 0) {
      act(() => root.render(<svg><AmmeterA1 x={x} y={y} reading={reading} range="3A" /></svg>))
    }
    render(634, 285)
    const needle = host.querySelector('[data-part="ammeter-needle"]')!
    const rotation = needle.getAttribute('transform')
    const pivot = needle.parentElement!.getAttribute('transform')
    expect(needle.getAttribute('x1')).toBe('0')
    expect(needle.getAttribute('y1')).toBe('0')
    render(934, 485)
    expect(host.querySelector('[data-apparatus="A1"]')?.getAttribute('transform')).toBe('translate(934 485)')
    expect(needle.getAttribute('transform')).toBe(rotation)
    expect(needle.parentElement!.getAttribute('transform')).toBe(pivot)
    render(934, 485, 0.3)
    expect(needle.getAttribute('transform')).not.toBe(rotation)
    expect(needle.parentElement!.getAttribute('transform')).toBe(pivot)
  })
})

describe('精简后的实验操作区', () => {
  it('电流图记录实时数据，暂停不采样，继续恢复，清除和时间缩放生效', () => {
    vi.useFakeTimers()
    act(() => root.render(<MeterCurrentGraph current={0.3} decimals={3} point={{ x: 700, y: 200 }} meterLeft={500} viewport={{ width: 1080, height: 892 }} onClose={vi.fn()} />))
    act(() => vi.advanceTimersByTime(1000))
    const graph = host.querySelector('[data-current-samples]')!
    expect(graph.getAttribute('data-current-samples')).toBe('10')
    expect(host.textContent).toContain('0.300 A')
    function click(text: string) { act(() => Array.from(host.querySelectorAll('button')).find((button) => button.textContent === text)!.click()) }
    click('暂停')
    act(() => vi.advanceTimersByTime(1000))
    expect(graph.getAttribute('data-current-samples')).toBe('10')
    click('继续')
    act(() => vi.advanceTimersByTime(200))
    expect(graph.getAttribute('data-current-samples')).toBe('12')
    click('+')
    expect(host.textContent).toContain('20s')
    click('清除')
    expect(graph.getAttribute('data-current-samples')).toBe('0')
  })
  it('点击电流表显示3D、设置、删除，设置内阻与精度派发真实实验操作', () => {
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    act(() => host.querySelector<SVGGElement>('[data-component-drag="A1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelector('[aria-label="查看电流表3D"]')).toBeTruthy()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="电流表设置"]')!.click())
    const resistance = host.querySelector<HTMLSelectElement>('[aria-label="小量程内阻"]')!
    expect(Array.from(resistance.options).map((option) => option.value)).toEqual(['0', '0.5', '1', '2', '5'])
    act(() => { resistance.value = '0.5'; resistance.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'setMeterSettings', payload: expect.objectContaining({ smallResistance: 0.5 }) }), 'meter-settings')
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="保留3位小数"]')!.click())
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'setMeterSettings', payload: expect.objectContaining({ decimals: 3 }) }), 'meter-settings')
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="删除电流表"]')!.click())
    expect(dispatch).toHaveBeenCalledWith({ type: 'deleteMeter' }, 'delete-meter')
  })
  it('返回按钮是操作栏内的首个按钮，电流表报告只保留右上入口', () => {
    const experiment = textbookPhysicsExperiments.find((item) => item.id === 'ammeter-use')!
    act(() => root.render(<MemoryRouter><AmmeterLab experiment={experiment} /></MemoryRouter>))
    const toolbar = host.querySelector('[data-lab-toolbar]')!
    expect(toolbar.querySelector('button')?.getAttribute('aria-label')).toBe('返回实验列表')
    expect(toolbar.querySelector('[aria-label="实验报告"]')).toBeNull()
    const reports = host.querySelectorAll<HTMLButtonElement>('button[aria-label="实验报告"]')
    expect(reports).toHaveLength(1)
    act(() => reports[0].click())
    expect(host.querySelector('aside[aria-label="实验报告"]')).toBeTruthy()
  })
  it('内层场景允许器材超出 SVG 边界，只有整页画布裁剪屏幕外内容', () => {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    const scene = host.querySelector<SVGSVGElement>('svg[aria-label="练习使用电流表实验台"]')!
    expect(scene.style.overflow).toBe('visible')
    expect(host.querySelector('[data-immersive-canvas]')?.classList.contains('overflow-hidden')).toBe(true)
  })
  it('操作名称常显，转图和摆位复位并入顶部工具栏，保留功能', () => {
    const state = practiceController.createInitialState()
    act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" backTo="/physics" editableTitleStorageKey="test-lab-title" showActionLabels actions={[{ id: 'undo', label: '撤销', icon: <svg />, onClick: vi.fn() }]}><AmmeterScene state={state} dispatch={vi.fn()} /></ImmersiveLabStage></MemoryRouter>))
    const toolbar = host.querySelector('[data-lab-toolbar]')!
    expect(toolbar.querySelector('[aria-label="撤销"]')?.textContent).toBe('撤销')
    const switchView = toolbar.querySelector<HTMLButtonElement>('[aria-label="转电路图"]')!
    expect(switchView).toBeTruthy()
    expect(toolbar.querySelector('[aria-label="复位器材摆位"]')?.textContent).toContain('复位')
    act(() => switchView.click())
    expect(host.querySelectorAll('[data-schematic-wire]')).toHaveLength(6)
    expect(toolbar.querySelector('[aria-label="回到实物图"]')).toBeTruthy()
  })
  it('隐藏右侧缩放操作，导线终端绘制在电流表图像上方', () => {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    expect(host.querySelector('[aria-label="放大"]')).toBeNull()
    const meter = host.querySelector('[data-apparatus="A1"]')!
    const wire = host.querySelector('[data-wire-contact="ammeter-neg:lamp1-b"]')!
    expect(meter.compareDocumentPosition(wire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('标题双击编辑与本地自动保存', () => {
  it('双击标题编辑，离开输入框保存，重新挂载恢复名称', () => {
    mountTitle()
    const title = host.querySelector('[data-editable-lab-title]')!
    expect(title.textContent).toContain('练习使用电流表')
    act(() => title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const input = host.querySelector<HTMLInputElement>('input[aria-label="实验标题"]')!
    expect(input).toBeTruthy()
    input.value = '我的电流表实验'
    act(() => input.blur())
    expect(localStorage.getItem('test-lab-title')).toBe('我的电流表实验')
    act(() => root.unmount())
    root = createRoot(host)
    mountTitle()
    expect(host.querySelector('[data-editable-lab-title]')?.textContent).toContain('我的电流表实验')
  })
  it('中文输入法的确认回车不结束编辑，完成合成后才可保存', () => {
    mountTitle()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="编辑实验标题"]')!.click())
    const input = host.querySelector<HTMLInputElement>('input')!
    input.value = 'zhong'
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })))
    expect(host.querySelector('input')).toBe(input)
    expect(localStorage.getItem('test-lab-title')).toBeNull()
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })))
    expect(host.querySelector('input')).toBe(input)
    input.value = '中文电流表实验'
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(localStorage.getItem('test-lab-title')).toBe('中文电流表实验')
  })
  it('铅笔按钮可编辑，Escape取消，空标题保留已有名称', () => {
    mountTitle()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="编辑实验标题"]')!.click())
    let input = host.querySelector<HTMLInputElement>('input')!
    input.value = '不保存的名字'
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(localStorage.getItem('test-lab-title')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="编辑实验标题"]')!.click())
    input = host.querySelector<HTMLInputElement>('input')!
    input.value = '  '
    act(() => input.blur())
    expect(host.textContent).toContain('练习使用电流表')
  })
})

describe('导线选择和删除', () => {
  it.each([0, 1, 2, 3, 4, 5])('第%d根导线可以选中并用删除键拆下', (index) => {
    const dispatch = vi.fn()
    const state = practiceController.createInitialState()
    act(() => root.render(<AmmeterScene state={state} dispatch={dispatch} />))
    selectWire(index)
    expect(host.querySelectorAll('[data-wire][data-selected="true"]')).toHaveLength(1)
    pressDelete()
    expect(dispatch).toHaveBeenCalledWith({ type: 'disconnect', payload: state.edges[index] }, 'disconnect-wire')
  })
  it('点击页面其他位置，包括画布外的工具栏，取消选择且不删除', () => {
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    selectWire()
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(host.querySelector('[data-wire][data-selected="true"]')).toBeNull()
    pressDelete()
    expect(dispatch).not.toHaveBeenCalled()
    outside.remove()
  })
  it('编辑文字时删除键不影响导线', () => {
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    selectWire()
    const input = document.createElement('input')
    document.body.append(input)
    pressDelete(input)
    expect(dispatch).not.toHaveBeenCalled()
    input.remove()
  })
})


describe('闸刀开关的把手与底座分工', () => {
  it.each(['S1', 'S2'])('%s底座只选中，把手才切换开关', (id) => {
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    act(() => host.querySelector(`[data-component-drag="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(dispatch).not.toHaveBeenCalled()
    expect(host.querySelector(`[data-switch-selection="${id}"]`)).toBeTruthy()
    const handle = host.querySelector(`[data-switch-handle="${id}"]`)!
    expect(handle).toBeTruthy()
    act(() => handle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(dispatch).toHaveBeenCalledWith({ type: id === 'S1' ? 'setSwitch' : 'setBypassSwitch', payload: 'closed' }, id === 'S1' ? 'toggle-main-switch' : 'toggle-bypass-switch')
  })
  it('按住把手拖动、右键点击和取消手势均不切换开关', () => {
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={dispatch} />))
    const handle = host.querySelector('[data-switch-handle="S1"]')!
    const emit = (type: string, options = {}) => act(() => handle.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 10, clientY: 10, ...options })))
    emit('pointerdown')
    emit('pointermove', { clientX: 30 })
    emit('pointerup', { clientX: 30 })
    act(() => handle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    emit('pointerdown')
    emit('pointercancel')
    act(() => handle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => handle.dispatchEvent(new MouseEvent('click', { button: 2, bubbles: true })))
    expect(dispatch).not.toHaveBeenCalled()
  })
})
