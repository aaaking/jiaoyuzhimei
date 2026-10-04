// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { textbookPhysicsExperiments } from '../../curriculum/catalog'
import PhysicsLabShell, { type PhysicsLabSceneProps } from '../../runtime/PhysicsLabShell'
import { browserPhysicsSessionRepository, PhysicsSessionRepository } from '../../sessions/repository'
import PhysicsReportPage from '../../sessions/PhysicsReportPage'
import PhysicsSessionsPage from '../../sessions/PhysicsSessionsPage'
import { practiceController, type PracticeState } from './practiceController'
import ReportDrawer from './ReportDrawer'

const experiment = textbookPhysicsExperiments.find(item => item.id === 'ammeter-use')!
let host: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks() })
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent === label)
  expect(button, label).toBeTruthy()
  act(() => button!.click())
}
function Scene({ onOpenReport }: PhysicsLabSceneProps<PracticeState>) {
  return <button onClick={onOpenReport}>实验报告</button>
}

it('报告内直接查看实验数据，工具栏状态同步且不完成会话', () => {
  const repository = new PhysicsSessionRepository(localStorage)
  act(() => root.render(<MemoryRouter><PhysicsLabShell experiment={experiment} controller={practiceController} Scene={Scene} ReportView={ReportDrawer} repository={repository} showFooter={false} /></MemoryRouter>))
  click('实验报告')
  const report = host.querySelector('aside[aria-label="实验报告"]')!
  expect(report).toBeTruthy()
  expect(report.textContent).not.toContain('完成实验')
  expect(report.textContent).not.toContain('查看测量报告')
  click('查看实验数据')
  expect(host.querySelector('aside[aria-label="实验报告"]')).toBeNull()
  expect(host.querySelector('aside[aria-label="实验结果数据"]')).toBeTruthy()
  expect(host.querySelector('[aria-label="实验数据"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(repository.list()[0].status).toBe('IN_PROGRESS')
  click('实验数据')
  expect(host.querySelector('aside[aria-label="实验结果数据"]')).toBeNull()
  click('实验报告')
  click('实验数据')
  expect(host.querySelector('aside[aria-label="实验报告"]')).toBeNull()
  expect(host.querySelector('aside[aria-label="实验结果数据"]')).toBeTruthy()
  click('实验报告')
  expect(host.querySelector('aside[aria-label="实验结果数据"]')).toBeNull()
  expect(host.querySelector('aside[aria-label="实验报告"]')).toBeTruthy()
})

it('电流表旧报告地址返回实验台，会话列表移除旧入口并保留数据', () => {
  const repository = new PhysicsSessionRepository(localStorage)
  const session = repository.create(experiment.id, experiment.title)
  repository.appendEvent(session.id, { id: 'saved-event', at: '2026-10-04T00:00:00Z', action: 'record', outcome: 'accepted', detail: '已有记录' })
  const saved = repository.get(session.id)!
  vi.spyOn(browserPhysicsSessionRepository, 'get').mockReturnValue(saved)
  vi.spyOn(browserPhysicsSessionRepository, 'list').mockReturnValue([saved])
  act(() => root.render(<MemoryRouter initialEntries={[`/physics/sessions/${session.id}/report`]}><Routes><Route path="/physics/sessions/:id/report" element={<PhysicsReportPage />} /><Route path="/physics/labs/ammeter-use" element={<h1>实验台</h1>} /></Routes></MemoryRouter>))
  expect(host.textContent).toBe('实验台')
  expect(repository.get(session.id)?.events).toEqual(saved.events)
  act(() => root.render(<MemoryRouter><PhysicsSessionsPage /></MemoryRouter>))
  expect(host.querySelector('a[href$="/report"]')).toBeNull()
  expect(host.querySelector('a[href="/physics/labs/ammeter-use"]')).toBeTruthy()
})
