import { expect, it } from 'vitest'
import { projectMeterDrag } from './meterSettings'

it.each([
  ['right', { x: 120, y: 200 }, { x: 90, y: 210 }, { x: 92, y: 220 }, { x: 122, y: 200 }],
  ['left', { x: 80, y: 200 }, { x: 110, y: 210 }, { x: 108, y: 220 }, { x: 78, y: 200 }],
  ['up', { x: 100, y: 80 }, { x: 110, y: 110 }, { x: 120, y: 108 }, { x: 100, y: 78 }],
  ['down', { x: 100, y: 120 }, { x: 110, y: 90 }, { x: 120, y: 92 }, { x: 100, y: 122 }],
] as const)('%s单向拖动反向后再正向2像素立即响应，不必追回历史最远位置', (direction, position, previousPointer, nextPointer, expected) => {
  expect(projectMeterDrag(position, previousPointer, nextPointer, direction)).toEqual(expected)
  expect(projectMeterDrag(position, nextPointer, previousPointer, direction)).toEqual(position)
})
