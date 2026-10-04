// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ImmersiveLabStage from './ImmersiveLabStage'
import type { LabFeedback } from '../types'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })
function render(feedback: LabFeedback | null, autoDismissFeedback = true) {
  act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" backTo="/physics" feedback={feedback} autoDismissFeedback={autoDismissFeedback}><div role="alert">灯泡已烧坏</div></ImmersiveLabStage></MemoryRouter>))
}
function advance(ms: number) { act(() => vi.advanceTimersByTime(ms)) }

describe('底部操作提示时限', () => {
  it('其他实验不启用时保留原有反馈显示', () => {
    render({ outcome: 'accepted', message: '加热计时已更新' }, false)
    advance(6000)
    expect(host.querySelector('[role="status"]')?.textContent).toBe('加热计时已更新')
  })
  it('显示满 5 秒后消失，场景故障提示保留', () => {
    render({ outcome: 'accepted', message: '已调整导线连接' })
    advance(4999)
    expect(host.querySelector('[role="status"]')?.textContent).toBe('已调整导线连接')
    advance(1)
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('灯泡已烧坏')
  })
  it('相同提示的新操作重新计时，普通重渲染不延长时间', () => {
    const first: LabFeedback = { outcome: 'accepted', message: '已调整导线连接' }
    render(first)
    advance(4000)
    const next: LabFeedback = { ...first }
    render(next)
    advance(1000)
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    render(next)
    advance(3999)
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    advance(1)
    expect(host.querySelector('[role="status"]')).toBeNull()
    render({ ...first })
    expect(host.querySelector('[role="status"]')).not.toBeNull()
  })
  it('切换成由场景展示的反馈或卸载时取消操作提示计时', () => {
    render({ outcome: 'rejected', message: '请先断开开关再接线' })
    advance(2000)
    render({ outcome: 'accepted', message: '灯泡已烧坏', presentation: 'scene' })
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(vi.getTimerCount()).toBe(1)
    render(null)
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    root = createRoot(host)
  })
})
