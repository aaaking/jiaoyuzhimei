// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { resetOrbitView } from './ammeterOrbitReset'

describe('real OrbitControls camera reset', () => {
  it('does not drift after resetting during a damped orbit', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(3.7, 2.55, 6.5)
    const controls = new OrbitControls(camera, document.createElement('div'))
    controls.target.set(0, -0.2, 0)
    controls.enableDamping = true
    controls.update()

    controls.rotateLeft(1)
    resetOrbitView(camera, controls, new THREE.Vector3(3.7, 2.55, 6.5), new THREE.Vector3(0, -0.2, 0))
    for (let frame = 0; frame < 120; frame++) controls.update()

    expect(camera.position.distanceTo(new THREE.Vector3(3.7, 2.55, 6.5))).toBeLessThan(0.001)
    expect(controls.target.distanceTo(new THREE.Vector3(0, -0.2, 0))).toBeLessThan(0.001)
    controls.dispose()
  })
})
