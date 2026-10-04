// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SwitchHandle from './SwitchHandle'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController } from './practiceController'

function contains(polygon: Element, x: number, y: number) {
  const vertices = polygon.getAttribute('points')!.split(' ').map((pair) => pair.split(',').map(Number))
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [ax, ay] = vertices[i], [bx, by] = vertices[j]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}
function containsPost(post: Element, x: number, y: number) {
  const rx = Number(post.getAttribute('rx') ?? post.getAttribute('r'))
  const ry = Number(post.getAttribute('ry') ?? post.getAttribute('r'))
  return ((x - Number(post.getAttribute('cx'))) / rx) ** 2 + ((y - Number(post.getAttribute('cy'))) / ry) ** 2 < 1
}
const host = document.createElement('div')
let root = createRoot(host)
afterEach(() => { act(() => root.unmount()); root = createRoot(host) })

describe('金属闸刀和把手的实际点击区域', () => {
  it.each([true, false])('反向并旋转90度后，开合状态%s的真实把手仍可点击', (closed) => {
    act(() => root.render(<svg><SwitchHandle id="S1" x={0} y={0} closed={closed} reversed angle={90} onToggle={vi.fn()} /></svg>))
    const handle = host.querySelector('[data-switch-handle]')!
    expect(contains(handle, closed ? 7 : 30, closed ? -54 : -52)).toBe(true)
    expect(contains(handle, -22, 0)).toBe(false)
  })
  it.each([
    { closed: true, blade: [0, 0], grip: [54, -7] },
    { closed: false, blade: [0, -13], grip: [52, -30] },
  ])('开合状态$closed覆盖可见闸刀、把手，不覆盖底座', ({ closed, blade, grip }) => {
    act(() => root.render(<svg><SwitchHandle id="S1" x={0} y={0} closed={closed} onToggle={vi.fn()} /></svg>))
    const handle = host.querySelector('[data-switch-handle]')!
    // 点位由器材图片独立取样，避免只向一个原本已可用的小按钮发送点击。
    expect(contains(handle, blade[0], blade[1])).toBe(true)
    expect(contains(handle, grip[0], grip[1])).toBe(true)
    expect(contains(handle, 0, 22)).toBe(false)
  })
  it.each(['S1', 'S2'])('%s闭合把手不被过大的接线柱热区或导线选择层遮挡', (id) => {
    const state = { ...practiceController.createInitialState(), switchClosed: true, bypassClosed: true }
    act(() => root.render(<AmmeterScene state={state} dispatch={vi.fn()} />))
    const handle = host.querySelector(`[data-switch-handle="${id}"]`)!
    const post = host.querySelector(`[data-terminal="${id === 'S1' ? 'switch-b' : 'lamp2-b'}"]`)!
    const cx = Number(post.getAttribute('cx')), cy = Number(post.getAttribute('cy'))
    const x = cx - 9, y = cy - 7 // 黑色把手左上方，位于真实接线帽之外。
    expect(contains(handle, x, y)).toBe(true)
    expect(containsPost(post, x, y)).toBe(false)
    const lastWire = Array.from(host.querySelectorAll('[data-wire-selectable],[data-hit-target="wire-bend-handle"]')).at(-1)!
    expect(lastWire.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(handle.compareDocumentPosition(post) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})


describe('旋帽整颗可单独命中', () => {
  it.each([
    { owner: 'S1', left: 'switch-a', right: 'switch-b' },
    { owner: 'S2', left: 'lamp2-a', right: 'lamp2-b' },
  ])('$owner两颗旋帽的下半部分仍属于接线柱，而不是底座或导线', ({ owner, left, right }) => {
    act(() => root.render(<AmmeterScene state={practiceController.createInitialState()} dispatch={vi.fn()} />))
    const image = host.querySelector(`[data-apparatus="${owner}"] image`)!
    const sx = Number(image.getAttribute('width')) / 1774
    const sy = Number(image.getAttribute('height')) / 887
    for (const [id, sourceX] of [[left, 188], [right, 1588]] as const) {
      const post = host.querySelector(`[data-terminal="${id}"]`)!
      for (const [dx, sourceY] of [[-65, 660], [0, 660], [65, 660], [-65, 705], [0, 705], [65, 705]]) {
        const x = Number(image.getAttribute('x')) + (sourceX + dx) * sx
        const y = Number(image.getAttribute('y')) + sourceY * sy
        expect(containsPost(post, x, y)).toBe(true)
      }
    }
  })
})
