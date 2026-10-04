// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import * as THREE from 'three'
import { createSpringMeterModel } from './springMeterModel'
import { createSpringMeterRotation } from './springMeterRotation'

it.each(['pointercancel', 'lostpointercapture', 'blur'])('旋转中断%s后停止跟随，并可重新拖动', (type) => {
  const el = document.createElement('canvas')
  document.body.append(el)
  Object.assign(el, { setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 500 }) })
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(3, 1.2, 10)
  const rotation = createSpringMeterRotation(camera, el)
  function pointer(type: string, x: number, y: number) {
    const event = new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
    Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } })
    return event
  }
  el.dispatchEvent(pointer('pointerdown', 200, 200))
  document.dispatchEvent(pointer('pointermove', 250, 240))
  rotation.controls.update()
  const beforeCancel = camera.quaternion.clone()
  if (type === 'blur') window.dispatchEvent(new Event('blur'))
  else el.dispatchEvent(pointer(type, 250, 240))
  expect(camera.quaternion.angleTo(beforeCancel)).toBeLessThan(.00001)
  document.dispatchEvent(pointer('pointermove', 340, 280))
  rotation.controls.update()
  expect(camera.quaternion.angleTo(beforeCancel)).toBeLessThan(.00001)
  el.dispatchEvent(pointer('pointerdown', 200, 200))
  document.dispatchEvent(pointer('pointermove', 300, 200))
  rotation.controls.update()
  document.dispatchEvent(pointer('pointerup', 300, 200))
  expect(camera.quaternion.angleTo(beforeCancel)).toBeGreaterThan(.1)
  rotation.reset()
  for (let i = 0; i < 20; i++) rotation.controls.update()
  expect(camera.position.distanceTo(new THREE.Vector3(3, 1.2, 10))).toBeLessThan(.001)
  rotation.dispose()
  const disposedView = camera.quaternion.clone()
  el.dispatchEvent(pointer('pointerdown', 200, 200))
  document.dispatchEvent(pointer('pointermove', 400, 400))
  expect(camera.quaternion.equals(disposedView)).toBe(true)
  el.remove()
})

it('拆解分离真实三维部件，组装恢复原位且不改变模型整体朝向', () => {
  const model = createSpringMeterModel()
  expect(Object.keys(model.parts)).toEqual(['case', 'ring', 'spring', 'pointer', 'scale', 'cover'])
  model.root.rotation.set(.3, .8, -.2)
  const rotation = model.root.quaternion.clone()
  model.setExploded(true)
  const positions = Object.values(model.parts).map(part => part.position.toArray().join(','))
  expect(new Set(positions).size).toBe(6)
  expect(model.parts.spring.children[0]).toBeInstanceOf(THREE.Mesh)
  expect(new THREE.Box3().setFromObject(model.parts.case).intersectsBox(new THREE.Box3().setFromObject(model.parts.scale))).toBe(false)
  expect(model.root.quaternion.equals(rotation)).toBe(true)
  model.setExploded(false)
  expect(Object.values(model.parts).every(part => part.position.length() === 0)).toBe(true)
  model.dispose()
})

it('真实Trackball鼠标控制可越过顶部并在分解状态旋转，重置后无残余移动', () => {
  const el = document.createElement('canvas')
  document.body.append(el)
  Object.assign(el, { setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 500 }) })
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(3, 1.2, 10)
  const initial = camera.position.clone()
  const rotation = createSpringMeterRotation(camera, el)
  function drag(dx: number, dy: number) {
    function pointer(type: string, x: number, y: number) {
      const event = new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
      // happy-dom缺少浏览器从client坐标计算的page坐标。
      Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } })
      return event
    }
    el.dispatchEvent(pointer('pointerdown', 200, 200))
    document.dispatchEvent(pointer('pointermove', 200 + dx, 200 + dy))
    rotation.controls.update()
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse' }))
  }
  drag(0, 450)
  expect(camera.up.y).toBeLessThan(0)
  const model = createSpringMeterModel()
  model.setExploded(true)
  const rotated = camera.quaternion.clone()
  drag(120, 0)
  expect(camera.quaternion.equals(rotated)).toBe(false)
  rotation.reset()
  for (let i = 0; i < 20; i++) rotation.controls.update()
  expect(camera.position.distanceTo(initial)).toBeLessThan(.001)
  expect(camera.up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(.001)
  rotation.dispose()
  model.dispose()
  el.remove()
})
