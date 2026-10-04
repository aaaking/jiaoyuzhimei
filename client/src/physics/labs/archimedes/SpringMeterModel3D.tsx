import { useEffect, useRef, useState } from 'react'
import { Box, RotateCcw, X } from 'lucide-react'
import * as THREE from 'three'
import { createSpringMeterModel } from './springMeterModel'
import { createSpringMeterRotation } from './springMeterRotation'

export default function SpringMeterModel3D({ onClose }: { onClose(): void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<ReturnType<typeof createSpringMeterModel> | null>(null)
  const rotationRef = useRef<ReturnType<typeof createSpringMeterRotation> | null>(null)
  const wasExploded = useRef(false)
  const [exploded, setExploded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let renderer: THREE.WebGLRenderer
    try {
      if (typeof WebGL2RenderingContext === 'undefined') throw new Error('WebGL unavailable')
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      queueMicrotask(() => { if (!disposed) setError('当前浏览器无法显示3D模型，请开启WebGL后重试。') })
      return () => { disposed = true }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-label', '拖动旋转弹簧测力计3D模型')
    host.append(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#515761')
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100)
    camera.position.set(3, 1.2, 10)
    const rotation = createSpringMeterRotation(camera, renderer.domElement)
    rotationRef.current = rotation
    const model = createSpringMeterModel()
    modelRef.current = model
    scene.add(model.root, new THREE.HemisphereLight('#ffffff', '#29333b', 2.5))
    const light = new THREE.DirectionalLight('#ffffff', 3)
    light.position.set(3, 5, 7)
    scene.add(light)
    const fill = new THREE.DirectionalLight('#a6c9ff', 2)
    fill.position.set(-4, 0, -5)
    scene.add(fill)
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      rotation.controls.handleResize()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    let frame = 0
    const render = () => {
      rotation.controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      rotation.dispose()
      model.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      modelRef.current = null
      rotationRef.current = null
    }
  }, [])

  useEffect(() => {
    modelRef.current?.setExploded(exploded)
    const controls = rotationRef.current?.controls
    if (controls && wasExploded.current !== exploded) {
      const shift = new THREE.Vector3(exploded ? .7 : -.7, 0, 0)
      controls.object.position.sub(controls.target).multiplyScalar(exploded ? 1.35 : 1 / 1.35).add(controls.target).add(shift)
      controls.target.add(shift)
      controls.update()
    }
    wasExploded.current = exploded
  }, [exploded])

  function reset() {
    wasExploded.current = false
    setExploded(false)
    rotationRef.current?.reset()
  }
  return <section aria-label="弹簧测力计3D模型" data-canvas-pan-block data-model-exploded={exploded} className="absolute left-3 top-[82px] z-40 h-[min(540px,calc(100%-94px))] w-[min(494px,calc(100%-24px))] overflow-hidden rounded-lg bg-[#515761] text-white shadow-xl">
    <header className="flex h-10 items-center justify-center bg-[#383d45] text-sm text-[#dedfe1]">弹簧测力计3D模型<button type="button" aria-label="关闭测力计3D模型" onClick={onClose} className="absolute right-2 top-2 grid size-6 place-items-center"><X size={20} /></button></header>
    <div ref={hostRef} className="absolute inset-x-0 bottom-0 top-10" />
    {error && <p role="alert" className="absolute inset-x-6 top-1/2 text-center text-sm">{error}</p>}
    <div className="absolute left-2 top-1/2 grid -translate-y-1/2 gap-2 rounded-lg bg-[#090d0e] p-2">
      <button type="button" aria-label="重置测力计3D模型" disabled={!!error} onClick={reset} className="grid justify-items-center gap-1 px-1 py-2 text-xs disabled:opacity-40"><RotateCcw size={23} />重置</button>
      <button type="button" aria-label={exploded ? '组装测力计3D模型' : '分解测力计3D模型'} aria-pressed={exploded} disabled={!!error} onClick={() => setExploded(!exploded)} className="grid justify-items-center gap-1 px-1 py-2 text-xs disabled:opacity-40"><Box size={23} />{exploded ? '组装' : '分解'}</button>
    </div>
    {!error && <div className="pointer-events-none absolute inset-x-2 bottom-2 text-center text-[11px] text-white/70">{exploded && <p className="mb-1">外壳 · 吊环 · 弹簧 · 指针与挂钩 · 刻度板 · 透明罩</p>}拖动任意旋转 · 滚轮缩放</div>}
  </section>
}
