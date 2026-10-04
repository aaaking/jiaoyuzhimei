import type * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function resetOrbitView(camera: THREE.PerspectiveCamera, controls: OrbitControls, position: THREE.Vector3, target: THREE.Vector3) {
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  camera.position.copy(position)
  controls.target.copy(target)
  controls.update()
  controls.enableDamping = damping
}
