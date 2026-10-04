import { Vector3, type PerspectiveCamera } from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'

export function createSpringMeterRotation(camera: PerspectiveCamera, canvas: HTMLCanvasElement) {
  const initialPosition = camera.position.clone()
  const initialUp = camera.up.clone()
  function create(target = new Vector3()) {
    const next = new TrackballControls(camera, canvas)
    next.staticMoving = true
    next.noPan = true
    next.rotateSpeed = 2
    next.minDistance = 5
    next.maxDistance = 24
    next.keys = ['', '', '']
    next.target.copy(target)
    next.update()
    return next
  }
  let controls = create()
  let pointerId: number | null = null
  const start = (event: PointerEvent) => { pointerId = event.pointerId }
  const end = (event: PointerEvent) => { if (event.pointerId === pointerId) pointerId = null }
  function cancel() {
    if (pointerId === null) return
    const id = pointerId
    pointerId = null
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    controls.update()
    const target = controls.target.clone()
    // TrackballControls取消手势后仍保留旋转状态；重建输入控制，保留相机视角。
    controls.dispose()
    controls = create(target)
  }
  canvas.addEventListener('pointerdown', start)
  document.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', cancel)
  canvas.addEventListener('lostpointercapture', cancel)
  window.addEventListener('blur', cancel)
  return {
    get controls() { return controls },
    reset() {
      cancel()
      controls.dispose()
      camera.position.copy(initialPosition)
      camera.up.copy(initialUp)
      controls = create()
    },
    dispose() {
      canvas.removeEventListener('pointerdown', start)
      document.removeEventListener('pointerup', end)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('blur', cancel)
      cancel()
      controls.dispose()
    },
  }
}
