// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { archimedesController as controller } from './controller'
import WaterEffects from './WaterEffects'
import { ApparatusDefs, CollectionBucket } from './Apparatus'

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

it.each([true, false])('排水被接住=%s时水线持续显示，漏接形成桌面积水；停止后水线消失', catching => {
  vi.useFakeTimers()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let state = controller.createInitialState()
  if (!catching) state = { ...state, positions: { ...state.positions, bucket: { x: 500, y: 378 } } }
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  state = controller.reduce(state, { type: 'move', payload: { subject: 'object', position: { x: 474, y: 334 } } }).state
  state = controller.reduce(state, { type: 'move', payload: { subject: 'meter', position: { x: 195, y: 86 } } }).state
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-stream="overflow"]')).toBeTruthy()
  if (catching) expect(host.querySelector('[data-water-stream="overflow"] path')?.getAttribute('d')).toMatch(/360 479\.25$/)
  const puddle = host.querySelector('[data-water-puddle]')
  expect(!!puddle).toBe(!catching)
  if (puddle) expect(puddle.getAttribute('cy')).toBe('490')
  state = { ...state, lastOverflow: 0 }
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-stream="overflow"]')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1800))
  expect(host.querySelector('[data-water-stream]')).toBeNull()
  if (!catching) expect(host.querySelector('[data-water-puddle]')).toBeTruthy()
  state = controller.createInitialState()
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-puddle]')).toBeNull()
  act(() => root.unmount())
})

it('少量接水流到桶底水面，桶底水位随收集量上升而非停在桶口', () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let state = controller.createInitialState()
  const render = () => act(() => root.render(<svg><ApparatusDefs /><CollectionBucket state={state} /><WaterEffects state={state} /></svg>))
  render()
  expect(host.querySelector('g[clip-path]')).toBeNull()
  for (const [volume, localY, worldY] of [[1.2, 108.95, 486.95], [10, 101.25, 479.25]]) {
    state = { ...state, collectedVolume: volume, liquidVolume: 90 - volume }
    render()
    const water = host.querySelector('g[clip-path]')!
    expect(water).toBeTruthy()
    expect(Number(water.querySelector('ellipse')?.getAttribute('cy'))).toBeCloseTo(localY)
    expect(Number(water.querySelector('rect')?.getAttribute('height'))).toBeGreaterThan(0)
    expect(Number(water.querySelector('rect')?.getAttribute('opacity'))).toBeGreaterThanOrEqual(.45)
    expect(host.querySelector('[data-water-stream="overflow"] path')?.getAttribute('d')).toMatch(new RegExp(`360 ${worldY}$`))
  }
  act(() => root.unmount())
})

it('倾倒产生水流与积水，移到桌外流向地面；删除杯子不冒充溢流', () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let state = { ...controller.createInitialState(), collectedVolume: 10, liquidVolume: 80 }
  state.positions.bucket = { x: 700, y: 300 }
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  state = controller.reduce(state, { type: 'startBucketPour' }).state
  for (let i = 0; i < 10; i++) state = controller.reduce(state, { type: 'advanceBucketPour', payload: .1 }).state
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-stream="pour"]')).toBeTruthy()
  expect(host.querySelector('[data-water-puddle]')?.getAttribute('cy')).toBe('714')
  const pouring = state
  state = { ...controller.createInitialState(), collectedVolume: 10, liquidVolume: 80 }
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-puddle]')).toBeNull()
  state = pouring
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  for (let i = 0; i < 16; i++) state = controller.reduce(state, { type: 'advanceBucketPour', payload: .1 }).state
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-stream="pour"]')).toBeNull()
  state = controller.reduce(state, { type: 'deleteCup' }).state
  act(() => root.render(<svg><WaterEffects state={state} /></svg>))
  expect(host.querySelector('[data-water-stream="overflow"]')).toBeNull()
  act(() => root.unmount())
})
