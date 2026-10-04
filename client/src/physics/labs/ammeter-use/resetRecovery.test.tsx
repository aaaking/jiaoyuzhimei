// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PhysicsLabShell from '../../runtime/PhysicsLabShell'
import { textbookPhysicsExperiments } from '../../curriculum/catalog'
import { PhysicsSessionRepository } from '../../sessions/repository'
import { synchronizeLabSession } from '../../runtime/sessionLifecycle'
import { AmmeterScene } from './CompetitorScene.tsx'
import { practiceController, type PracticeState } from './practiceController'
import { saveBatteryDefaults } from './batterySettings'

const experiment = textbookPhysicsExperiments.find(e => e.id === 'ammeter-use')!
let host: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks() })
function click(label: string) {
  const button = host.querySelector(`[aria-label="${label}"]`) ?? [...host.querySelectorAll('button')].find(b => b.textContent === label)!
  expect(button).toBeTruthy()
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function mount(state: PracticeState) {
  const repository = new PhysicsSessionRepository(localStorage)
  const session = repository.create(experiment.id, experiment.title)
  synchronizeLabSession(repository, session.id, { controller: practiceController, state, experiment })
  act(() => root.render(<MemoryRouter><PhysicsLabShell experiment={experiment} controller={practiceController} Scene={AmmeterScene} repository={repository} /></MemoryRouter>))
  return repository
}
function burned() {
  const closed = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
  return practiceController.reduce(closed, { type: 'setBatterySettings', payload: { ...closed.batterySettings!, voltage: 4.5 } }).state
}
function expectHealthy() {
  expect(host.querySelector('[data-lamp-fault="已烧坏"]')).toBeNull()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  click('闭合S1开关闸刀或把手')
  expect(host.querySelector('[data-lamp-glow]')).toBeTruthy()
  expect(Number(host.querySelector('[data-apparatus="A1"]')!.getAttribute('data-reading'))).toBeCloseTo(3 / 10.39)
}

it('过压烧坏后顶部重置更换器材，重新合闸恢复正常电流', () => {
  mount(burned())
  expect(host.querySelector('[data-lamp-fault="已烧坏"]')).toBeTruthy()
  click('重置实验')
  expectHealthy()
})
it('保存了过压电源默认值时，重置仍恢复实验初始参数，重新合闸不会再次烧坏', () => {
  const state = burned()
  saveBatteryDefaults(state.batterySettings!)
  mount(state)
  click('重置实验')
  expectHealthy()
})
it('已完成会话中的烧坏器材也可通过重置开始新的可操作实验', () => {
  let state = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
  state = practiceController.reduce(state, { type: 'setRange', payload: '0.6A' }).state
  state = practiceController.reduce(state, { type: 'setBatterySettings', payload: { ...state.batterySettings!, voltage: 4.5 } }).state
  expect(practiceController.completion(state).complete).toBe(true)
  const repository = mount(state)
  click('完成实验')
  click('重置实验')
  expectHealthy()
  expect(repository.list().some(session => session.status === 'COMPLETED')).toBe(true)
  expect(repository.list().some(session => session.status === 'IN_PROGRESS')).toBe(true)
})
it('烧坏只显示红色实验现象，正常开合闸仅通过器材呈现状态', () => {
  const initial = practiceController.createInitialState()
  const source = practiceController.reduce(initial, { type: 'setBatterySettings', payload: { ...initial.batterySettings!, voltage: 4.5 } }).state
  const repository = mount(source)
  click('闭合S1开关闸刀或把手')
  const message = host.querySelector('[role="alert"]')!.textContent!.replace('实验现象', '')
  expect([...host.querySelectorAll('[role="status"]')].some(e => e.textContent === message)).toBe(false)
  click('重置实验')
  click('闭合S1开关闸刀或把手')
  expect(host.querySelector('[data-lamp-glow]')).toBeTruthy()
  expect(repository.list()[0].runtimeSnapshot).toMatchObject({ switchClosed: true })
  expect([...host.querySelectorAll('[role="status"]')].some(e => e.textContent?.includes('S1主开关'))).toBe(false)
  click('断开S1开关闸刀或把手')
  expect(repository.list()[0].runtimeSnapshot).toMatchObject({ switchClosed: false })
  expect(host.querySelector('[data-lamp-glow]')).toBeNull()
  expect(Number(host.querySelector('[data-apparatus="A1"]')!.getAttribute('data-reading'))).toBe(0)
  expect([...host.querySelectorAll('[role="status"]')].some(e => e.textContent?.includes('S1主开关'))).toBe(false)
  click('闭合S2开关闸刀或把手')
  expect(repository.list()[0].runtimeSnapshot).toMatchObject({ bypassClosed: true })
  expect([...host.querySelectorAll('[role="status"]')].some(e => e.textContent?.includes('S2旁路开关'))).toBe(false)
  click('断开S2开关闸刀或把手')
  expect(repository.list()[0].runtimeSnapshot).toMatchObject({ bypassClosed: false })
  expect([...host.querySelectorAll('[role="status"]')].some(e => e.textContent?.includes('S2旁路开关'))).toBe(false)
})
