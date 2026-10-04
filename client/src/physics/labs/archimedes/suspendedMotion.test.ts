import { expect, it } from 'vitest'
import { createSwing, stepSwing, rotatedLoadPosition } from './suspendedMotion'

it.each([119, 111])('挂点移动激发长度%s的摆动，反向和停止后惯性回摆并衰减', length => {
  let swing = createSwing({ x: 0, y: 0 })
  swing = stepSwing(swing, { x: 4, y: 0 }, length, 1 / 60)
  expect(swing.angle).toBeGreaterThan(0)
  expect(swing.velocity).toBeGreaterThan(0)
  for (let i = 0; i < 10; i++) swing = stepSwing(swing, { x: 4 * (i + 2), y: 0 }, length, 1 / 60)
  const moving = swing.angle
  const pivot = swing.pivot
  for (let i = 0; i < 25; i++) swing = stepSwing(swing, pivot, length, 1 / 60)
  expect(swing.angle).not.toBe(moving)
  let negative = false
  for (let i = 0; i < 180; i++) { swing = stepSwing(swing, pivot, length, 1 / 60); negative ||= swing.angle < -.005 }
  expect(negative).toBe(true)
  for (let i = 0; i < 600; i++) swing = stepSwing(swing, pivot, length, 1 / 60)
  expect(Math.abs(swing.angle)).toBeLessThan(.001)
  expect(Math.abs(swing.velocity)).toBeLessThan(.001)
})

it('静止挂点不凭空起摆，垂直运动不生成横向摆动，镜像拖动左右对称', () => {
  let left = createSwing({ x: 0, y: 0 })
  let right = createSwing({ x: 0, y: 0 })
  let vertical = createSwing({ x: 0, y: 0 })
  for (let i = 1; i < 60; i++) {
    left = stepSwing(left, { x: -i * 3, y: 0 }, 119, 1 / 60)
    right = stepSwing(right, { x: i * 3, y: 0 }, 119, 1 / 60)
    vertical = stepSwing(vertical, { x: 0, y: i * 3 }, 119, 1 / 60)
    expect(left.angle).toBeCloseTo(-right.angle)
    expect(vertical.angle).toBe(0)
  }
})

it('绕挂点旋转后断开的位置和SVG几何一致，大幅拖动有界不发散', () => {
  const position = rotatedLoadPosition({ x: 100, y: 300 }, { x: 100, y: 220 }, Math.PI / 6)
  expect(position.x).toBeCloseTo(60)
  expect(position.y).toBeCloseTo(220 + 80 * Math.cos(Math.PI / 6))
  let swing = createSwing({ x: 0, y: 0 })
  for (let i = 0; i < 1000; i++) {
    swing = stepSwing(swing, { x: i % 2 ? 1000 : -1000, y: 0 }, 119, 1 / 60)
    expect(Number.isFinite(swing.angle)).toBe(true)
    expect(Math.abs(swing.angle)).toBeLessThanOrEqual(.45)
  }
})
