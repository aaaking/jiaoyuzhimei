import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { getPartOffset, nextModelState, type ModelPart, type ModelState } from './ammeterModelState'
import { resetOrbitView } from './ammeterOrbitReset'

type Props = { onClose: () => void }

const initialCamera = new THREE.Vector3(3.7, 2.55, 6.5)
const initialTarget = new THREE.Vector3(0, -0.2, 0)
const partNames: ModelPart[] = ['case', 'mechanism', 'dial', 'glass', 'terminals']

function drawFallbackDial(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = 1024
  canvas.height = 680
  ctx.fillStyle = '#f5f3ed'
  ctx.fillRect(0, 0, 1024, 680)
  ctx.strokeStyle = '#262626'
  ctx.fillStyle = '#202020'
  ctx.textAlign = 'center'
  ctx.font = '42px Arial'
  for (let i = 0; i <= 30; i++) {
    const angle = Math.PI * (1.14 + (0.72 * i) / 30)
    const inner = i % 10 === 0 ? 335 : i % 5 === 0 ? 347 : 359
    const outer = 388
    ctx.lineWidth = i % 10 === 0 ? 7 : 3
    ctx.beginPath()
    ctx.moveTo(512 + Math.cos(angle) * inner, 620 + Math.sin(angle) * inner)
    ctx.lineTo(512 + Math.cos(angle) * outer, 620 + Math.sin(angle) * outer)
    ctx.stroke()
    if (i % 10 === 0) {
      ctx.fillText(String(i / 10), 512 + Math.cos(angle) * 435, 620 + Math.sin(angle) * 435)
    }
  }
  ctx.font = 'bold 110px Arial'
  ctx.fillText('A', 512, 520)
  ctx.font = '34px Arial'
  ctx.fillText('0—0.6 A / 0—3 A', 512, 580)
}

export default function AmmeterModel3D({ onClose }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null)
  const sceneParts = useRef<Record<ModelPart, THREE.Group> | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const wasExploded = useRef(false)
  const [modelState, setModelState] = useState<ModelState>({ exploded: false, cameraRevision: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    const host = canvasHost.current
    if (!host) return
    let disposed = false
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      queueMicrotask(() => {
        if (!disposed) setError('当前浏览器无法启动 3D 图形。请开启 WebGL 后重试。')
      })
      return () => { disposed = true }
    }

    let frame = 0
    let dialImage: HTMLImageElement | null = null
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#515761')
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100)
    camera.position.copy(initialCamera)
    camera.lookAt(0, -0.2, 0)
    cameraRef.current = camera
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -0.2, 0)
    controls.enableDamping = true
    controls.minDistance = 3
    controls.maxDistance = 15
    controls.update()
    controlsRef.current = controls

    const ambient = new THREE.HemisphereLight('#ffffff', '#28303a', 2.2)
    scene.add(ambient)
    const key = new THREE.DirectionalLight('#ffffff', 3)
    key.position.set(2, 5, 7)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#a9c9ff', 1.2)
    fill.position.set(-5, 1, -3)
    scene.add(fill)

    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const textures: THREE.Texture[] = []
    const mat = (color: string, metalness = 0, roughness = 0.55) => {
      const material = new THREE.MeshStandardMaterial({ color, metalness, roughness })
      materials.push(material)
      return material
    }
    const charcoal = mat('#24272b', 0.04, 0.82)
    const edge = mat('#111418', 0.1, 0.67)
    const steel = mat('#b9bec1', 0.8, 0.25)
    const brass = mat('#bca376', 0.8, 0.28)
    const red = mat('#bf2025', 0.08, 0.38)
    const black = mat('#15171b', 0.06, 0.47)
    const copper = mat('#a56431', 0.72, 0.37)
    const white = mat('#f0eee8', 0, 0.86)
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#d8e7f1', transparent: true, opacity: 0.16, metalness: 0, roughness: 0.07, depthWrite: false, side: THREE.DoubleSide })
    materials.push(glassMaterial)

    const root = new THREE.Group()
    root.rotation.x = -0.11
    root.rotation.y = -0.12
    scene.add(root)
    const parts = {} as Record<ModelPart, THREE.Group>
    for (const name of partNames) {
      parts[name] = new THREE.Group()
      root.add(parts[name])
    }
    sceneParts.current = parts

    const box = (parent: THREE.Group, size: [number, number, number], at: [number, number, number], material: THREE.Material) => {
      const geometry = new THREE.BoxGeometry(...size)
      geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...at)
      parent.add(mesh)
      return mesh
    }
    const cylinder = (parent: THREE.Group, radius: number, height: number, at: [number, number, number], material: THREE.Material, axis: 'y' | 'z' = 'z') => {
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32)
      geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      if (axis === 'z') mesh.rotation.x = Math.PI / 2
      mesh.position.set(...at)
      parent.add(mesh)
      return mesh
    }

    // The solid rear case remains visible when the cover and dial move away.
    box(parts.case, [3.42, 2.62, 0.72], [0, -0.02, -0.18], charcoal)
    box(parts.case, [3.64, 0.65, 1.16], [0, -1.63, 0.12], charcoal)
    box(parts.case, [3.72, 0.14, 1.25], [0, -1.98, 0.12], edge)
    box(parts.case, [3.46, 0.14, 0.12], [0, 1.24, 0.24], edge)
    box(parts.case, [0.14, 2.43, 0.12], [-1.66, -0.02, 0.24], edge)
    box(parts.case, [0.14, 2.43, 0.12], [1.66, -0.02, 0.24], edge)

    // Visible internal moving-coil mechanism: two pole pieces, copper coil and axle.
    box(parts.mechanism, [1.45, 1.13, 0.19], [0, -0.2, 0.19], steel)
    cylinder(parts.mechanism, 0.46, 0.14, [0, -0.22, 0.24], copper)
    cylinder(parts.mechanism, 0.26, 0.12, [0, -0.22, 0.29], charcoal)
    cylinder(parts.mechanism, 0.11, 0.12, [0, -0.22, 0.3], steel)
    box(parts.mechanism, [0.34, 0.9, 0.2], [-0.63, -0.22, 0.27], black)
    box(parts.mechanism, [0.34, 0.9, 0.2], [0.63, -0.22, 0.27], black)

    box(parts.dial, [3.2, 2.31, 0.07], [0, 0, 0.42], white)
    const dialCanvas = document.createElement('canvas')
    drawFallbackDial(dialCanvas)
    const dialTexture = new THREE.CanvasTexture(dialCanvas)
    dialTexture.colorSpace = THREE.SRGBColorSpace
    textures.push(dialTexture)
    const dialMaterial = new THREE.MeshBasicMaterial({ map: dialTexture })
    materials.push(dialMaterial)
    const dialGeometry = new THREE.PlaneGeometry(3.08, 2.17)
    geometries.push(dialGeometry)
    const dial = new THREE.Mesh(dialGeometry, dialMaterial)
    dial.position.set(0, 0.03, 0.462)
    parts.dial.add(dial)
    const needle = box(parts.mechanism, [0.018, 1.35, 0.012], [-0.35, -0.29, 0.49], red)
    needle.rotation.z = 0.55
    cylinder(parts.mechanism, 0.09, 0.06, [0, -0.86, 0.5], steel)

    box(parts.glass, [3.25, 2.35, 0.035], [0, 0, 0.53], glassMaterial)
    box(parts.glass, [3.44, 0.09, 0.13], [0, 1.18, 0.54], steel)
    box(parts.glass, [3.44, 0.09, 0.13], [0, -1.18, 0.54], steel)
    box(parts.glass, [0.1, 2.43, 0.13], [-1.67, 0, 0.54], steel)
    box(parts.glass, [0.1, 2.43, 0.13], [1.67, 0, 0.54], steel)
    for (const x of [-1.57, 1.57]) for (const y of [-1.08, 1.08]) {
      cylinder(parts.glass, 0.036, 0.015, [x, y, 0.62], steel)
    }

    for (const [x, cap] of [[-1.12, black], [0, red], [1.12, red]] as const) {
      cylinder(parts.terminals, 0.18, 0.08, [x, -1.52, 0.62], brass, 'y')
      cylinder(parts.terminals, 0.13, 0.2, [x, -1.36, 0.62], steel, 'y')
      cylinder(parts.terminals, 0.2, 0.21, [x, -1.2, 0.62], cap, 'y')
      cylinder(parts.terminals, 0.1, 0.012, [x, -1.086, 0.62], edge, 'y')
    }
    for (const [x, label] of [[-1.12, '−'], [0, '0.6A'], [1.12, '3A']] as const) {
      const labelCanvas = document.createElement('canvas')
      labelCanvas.width = 256
      labelCanvas.height = 90
      const ctx = labelCanvas.getContext('2d')
      if (!ctx) continue
      ctx.fillStyle = '#e5e5e5'
      ctx.textAlign = 'center'
      ctx.font = '56px Arial'
      ctx.fillText(label, 128, 67)
      const labelTexture = new THREE.CanvasTexture(labelCanvas)
      textures.push(labelTexture)
      const labelMaterial = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true })
      materials.push(labelMaterial)
      const geometry = new THREE.PlaneGeometry(0.7, 0.25)
      geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, labelMaterial)
      mesh.position.set(x, -1.8, 0.713)
      parts.terminals.add(mesh)
    }

    dialImage = new Image()
    dialImage.onload = () => {
      if (disposed) return
      const ctx = dialCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, dialCanvas.width, dialCanvas.height)
      // Crop only the scale, not the source image's casing or terminal caps.
      ctx.drawImage(dialImage!, 200, 170, 900, 610, 0, 0, dialCanvas.width, dialCanvas.height)
      dialTexture.needsUpdate = true
    }
    dialImage.src = '/physics/ammeter/ammeter.png'

    const resize = () => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(host)
    window.addEventListener('resize', resize)
    resize()
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      if (dialImage) dialImage.onload = null
      controls.dispose()
      controlsRef.current = null
      cameraRef.current = null
      sceneParts.current = null
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      textures.forEach(texture => texture.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const parts = sceneParts.current
    if (!parts) return
    for (const name of partNames) parts[name].position.set(...getPartOffset(name, modelState.exploded))
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (camera && controls && wasExploded.current !== modelState.exploded) {
      camera.position.sub(controls.target).multiplyScalar(modelState.exploded ? 1.4 : 1 / 1.4).add(controls.target)
      controls.update()
    }
    wasExploded.current = modelState.exploded
  }, [modelState.exploded])

  useEffect(() => {
    if (!modelState.cameraRevision) return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (camera && controls) {
      resetOrbitView(camera, controls, initialCamera, initialTarget)
    }
  }, [modelState.cameraRevision])

  return (
    <section aria-label="标准电流表3D模型" data-meter-ui style={{ position: 'absolute', top: 74, left: 0, width: 'min(494px, calc(100vw - 16px))', height: 'min(500px, calc(100vh - 90px))', zIndex: 40, background: '#515761', color: '#fff', boxShadow: '0 12px 35px #0007', overflow: 'hidden' }}>
      <header style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#383d45', fontSize: 14, color: '#dedfe1' }}>
        标准电流表3D模型
        <button type="button" onClick={onClose} aria-label="关闭3D模型" style={{ position: 'absolute', right: 10, top: 3, border: 0, background: 'transparent', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: '32px' }}>×</button>
      </header>
      <div ref={canvasHost} style={{ position: 'absolute', inset: '40px 0 0 0', touchAction: 'none' }} />
      {error && <div role="alert" style={{ position: 'absolute', top: '48%', left: 24, right: 24, textAlign: 'center', fontSize: 14 }}>{error}</div>}
      <div style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', display: 'grid', gap: 6, padding: '10px 6px', borderRadius: 8, background: '#070809' }}>
        <button type="button" onClick={() => setModelState(state => nextModelState(state, 'reset'))} style={{ border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, padding: '7px 5px' }}><span aria-hidden="true" style={{ display: 'block', fontSize: 25 }}>↶</span>重置</button>
        <button type="button" onClick={() => setModelState(state => nextModelState(state, 'toggle'))} style={{ border: 0, background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, padding: '7px 5px' }}><span aria-hidden="true" style={{ display: 'block', fontSize: 23 }}>⬡</span>{modelState.exploded ? '组装' : '分解'}</button>
      </div>
      {!error && <span style={{ position: 'absolute', right: 12, bottom: 8, color: '#ffffffa6', fontSize: 11, pointerEvents: 'none' }}>拖动旋转 · 滚轮缩放</span>}
    </section>
  )
}
