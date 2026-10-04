// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController } from './practiceController'
import { COMPONENT_BODY_MARGIN, type LabComponentId } from './layout'
import { DEFAULT_SWITCH_SETTINGS } from './switchSettings'

let root: Root
let host: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.restoreAllMocks() })

function positions() {
  return Array.from(host.querySelectorAll('[data-component-drag]')).map(el => {
    const rect = el.querySelector('rect')!
    return {
      id: el.getAttribute('data-component-drag') as LabComponentId,
      x: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
      y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
    }
  })
}

describe('全部收回通过调整视野保留器材摆放', () => {
  it.each([[1155, 892, 0], [1375, 841, 90], [1920, 420, 45]])('%d×%d 开关旋转%d度后反复收回：器材位置不变且全部完整显示', (width, height, angle) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, height))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const dispatch = vi.fn()
    act(() => root.render(<AmmeterScene state={{ ...practiceController.createInitialState(), switchClosed: true, switches: { ...DEFAULT_SWITCH_SETTINGS, S2: { ...DEFAULT_SWITCH_SETTINGS.S2, angle } } }} dispatch={dispatch} />))
    const before = positions()
    const wires = Array.from(host.querySelectorAll('[data-wire] path')).map(el => el.getAttribute('d'))
    const stage = host.querySelector('[data-immersive-canvas]')!
    for (let attempt = 0; attempt < 2; attempt += 1) {
      act(() => stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1200, clientX: width / 2, clientY: height / 2 })))
      const recover = host.querySelector<HTMLButtonElement>('[aria-label="把拖出屏幕的器材收回可见范围"]')
      expect(recover).toBeTruthy()
      act(() => recover!.click())
      expect(positions()).toEqual(before)
      expect(Array.from(host.querySelectorAll('[data-wire] path')).map(el => el.getAttribute('d'))).toEqual(wires)
      expect(host.querySelector('[aria-label="把拖出屏幕的器材收回可见范围"]')).toBeNull()
      const world = host.querySelector<HTMLElement>('[data-canvas-gesture-layer] > div')!
      const [, tx, ty, scale] = world.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/)!
      for (const point of before) {
        const body = COMPONENT_BODY_MARGIN[point.id]
        const radians = (point.id === 'S2' ? angle : 0) * Math.PI / 180
        const margin = {
          x: body.x * Math.abs(Math.cos(radians)) + body.y * Math.abs(Math.sin(radians)),
          y: body.x * Math.abs(Math.sin(radians)) + body.y * Math.abs(Math.cos(radians)),
        }
        expect((point.x - margin.x) * Number(scale) + Number(tx)).toBeGreaterThanOrEqual(0)
        expect((point.x + margin.x) * Number(scale) + Number(tx)).toBeLessThanOrEqual(width)
        expect((point.y - margin.y) * Number(scale) + Number(ty)).toBeGreaterThanOrEqual(0)
        expect((point.y + margin.y) * Number(scale) + Number(ty)).toBeLessThanOrEqual(height)
      }
    }
    expect(dispatch).not.toHaveBeenCalled()
  })
})
