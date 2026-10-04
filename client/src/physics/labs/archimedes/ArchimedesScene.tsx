import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { FileText, MonitorUp, RotateCcw, Unlink } from 'lucide-react'
import type { TextbookPhysicsExperiment } from '../../curriculum/types'
import PhysicsLabShell, { type PhysicsLabSceneProps } from '../../runtime/PhysicsLabShell'
import { ImmersiveToolbarButton, ImmersiveToolbarSlot } from '../../runtime/immersive/ImmersiveLabStage'
import BucketInspector from './BucketInspector'
import CupInspector from './CupInspector'
import ObjectInspector from './ObjectInspector'
import SpringMeterInspector from './SpringMeterInspector'
import SpringMeterModel3D from './SpringMeterModel3D'
import MeasurementControls from './MeasurementControls'
import InfiniteCanvas from '../../runtime/immersive/InfiniteCanvas'
import ReportDrawer from '../ammeter-use/ReportDrawer'
import { archimedesController, automaticMeasurementReady, readingsFor, type ArchimedesState } from './controller'
import { projectMeterDrag } from './meterSettings'
import { GROUND_Y } from './gravity'
import { rotatedLoadPosition, useSuspendedSwing } from './suspendedMotion'
import { pourGeometry } from './waterMotion'
import WaterEffects from './WaterEffects'
import { APPARATUS_LABELS, REPORT_SECTIONS, HOOK_Y, CUP_BOTTOM, type Apparatus } from './definition'
import type { Position } from '../../runtime/types'
import { ApparatusDefs, CollectionBucket, MetalObject, OverflowCup, SpringMeter, WoodenBench } from './Apparatus'
import './archimedes.css'

const INITIAL_BOUNDS = { minX: 62, minY: 35, maxX: 607, maxY: 714 }
const PADDING = { top: 110, bottom: 128, left: 50, right: 74 }
interface Drag {
  pointerId: number
  started: boolean
  start: Position
  lastPoint: Position
  subject: Apparatus
  endpoint?: 'ring' | 'hook'
  offset: Position
  positions: Position[]
  preview: ArchimedesState
}

function ArchimedesReport(props: { open: boolean; onClose(): void; footer?: ReactNode }) {
  return <ReportDrawer {...props} storageKey="physics:archimedes-principle:instruction-report:v1" sections={REPORT_SECTIONS} />
}

export function ArchimedesScene({ state, dispatch, onOpenReport, readOnly = false }: PhysicsLabSceneProps<ArchimedesState>) {
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<ArchimedesState | null>(null)
  const [meterHeld, setMeterHeld] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [selectedApparatus, setSelectedApparatus] = useState<Apparatus | null>(null)
  const meterSelected = selectedApparatus === 'meter'
  const [pushHint, setPushHint] = useState(false)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const current = preview ?? state
  const hook = { x: current.positions.meter.x, y: current.positions.meter.y + HOOK_Y }
  const reading = readingsFor(current)
  const inCup = current.attached === 'object' && reading.submergedVolume > 0
  const swingEnabled = !readOnly && (current.attached === 'bucket' ? !current.bucketLocked && !current.bucketPour : current.objectSettings.sway)
  const swingLimit = reading.bottomContact && current.attached === 'object' ? 0 : inCup ? Math.min(.45, Math.max(0, (54 - Math.abs(current.positions.object.x - current.positions.cup.x)) / 158)) : .45
  const swingAngle = useSuspendedSwing(current.attached, hook, swingEnabled, swingLimit, inCup ? 5 : 1.7)
  const swingTransform = `rotate(${swingAngle * 180 / Math.PI} ${hook.x} ${hook.y})`
  const detachOffset = 48
  const bucketTransform = current.bucketPour ? pourGeometry(current).transform : current.attached === 'bucket' ? swingTransform : undefined
  const pouring = !!state.bucketPour
  useEffect(() => {
    if (readOnly || preview || meterHeld || !automaticMeasurementReady(state)) return
    const timer = window.setTimeout(() => dispatch({ type: 'autoMeasure' }), 500)
    return () => window.clearTimeout(timer)
  }, [state, preview, meterHeld, dispatch, readOnly])
  useEffect(() => {
    if (readOnly || !pouring) return
    const timer = window.setInterval(() => dispatch({ type: 'advanceBucketPour', payload: 1 / 60 }), 1000 / 60)
    return () => window.clearInterval(timer)
  }, [dispatch, readOnly, pouring])
  const falling = Object.keys(state.falling ?? {}).length > 0
  useEffect(() => {
    if (readOnly || !falling) return
    const timer = window.setInterval(() => { if (!drag.current) dispatch({ type: 'advanceGravity', payload: 1 / 60 }) }, 1000 / 60)
    return () => window.clearInterval(timer)
  }, [dispatch, readOnly, falling])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => { const rect = stage.getBoundingClientRect(); setViewport({ width: rect.width, height: rect.height }) }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [layoutEpoch])
  useEffect(() => {
    if (readOnly || state.meterRemoved || state.meterDamaged || state.meterSettings.speed === 0) return
    const timer = window.setInterval(() => { if (!drag.current) dispatch({ type: 'advanceMeter', payload: .1 }) }, 100)
    return () => window.clearInterval(timer)
  }, [dispatch, readOnly, state.meterRemoved, state.meterDamaged, state.meterSettings.speed])
  useEffect(() => {
    if (!pushHint) return
    const timer = window.setTimeout(() => setPushHint(false), 3000)
    return () => window.clearTimeout(timer)
  }, [pushHint])
  useEffect(() => {
    if (!meterHeld) return
    const cancel = () => { drag.current = null; setPreview(null); setMeterHeld(false) }
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [meterHeld])

  function worldPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>): Position | null {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: p.x, y: p.y }
  }
  function begin(event: PointerEvent<SVGGElement>, subject: Apparatus, endpoint?: 'ring' | 'hook') {
    setSelectedApparatus(subject)
    if (readOnly || (subject === 'bucket' && (state.bucketLocked || state.bucketPour)) || (subject === 'meter' && state.attached === 'bucket' && state.bucketPour) || event.button !== 0 || drag.current) return
    const p = worldPoint(event)
    if (!p) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (subject === 'meter') setMeterHeld(true)
    drag.current = { pointerId: event.pointerId, started: false, start: { x: event.clientX, y: event.clientY }, subject, endpoint, lastPoint: p, offset: { x: p.x - state.positions[subject].x, y: p.y - state.positions[subject].y - (endpoint === 'hook' ? HOOK_Y + state.pullExtension : 0) }, positions: [], preview: state }
  }
  function update(event: PointerEvent<SVGGElement>) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.subject === 'meter' && active.preview.attached === 'bucket' && active.preview.bucketLocked) return
    if (!active.started && Math.hypot(event.clientX - active.start.x, event.clientY - active.start.y) < 3) return
    active.started = true
    const p = worldPoint(event)
    if (!p) return
    const base = active.preview.positions[active.subject]
    const anchor = active.endpoint === 'hook' ? { x: base.x, y: base.y + HOOK_Y + active.preview.pullExtension } : base
    const direction = active.preview.meterSettings.direction
    const meterMoves = active.subject === 'meter' || active.subject === active.preview.attached
    const directional = meterMoves && direction !== 'none' && (!active.endpoint || active.preview.meterSettings.lockMode === 'none')
    const position = directional ? projectMeterDrag(anchor, active.lastPoint, p, direction) : { x: p.x - active.offset.x, y: p.y - active.offset.y }
    active.lastPoint = p
    if (position.x === anchor.x && position.y === anchor.y) return
    active.positions.push(position)
    active.preview = archimedesController.reduce(active.preview, active.endpoint ? { type: 'previewPullMeter', payload: { endpoint: active.endpoint, position } } : { type: 'previewMove', payload: { subject: active.subject, position } }).state
    setPreview(active.preview)
  }
  function end(event: PointerEvent<SVGGElement>, cancel = false) {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    if (!cancel) update(event)
    drag.current = null
    setMeterHeld(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setPreview(null)
    if (!cancel && active.positions.length) dispatch(active.endpoint ? { type: 'pullMeterPath', payload: { endpoint: active.endpoint, positions: active.positions } } : { type: active.subject === 'meter' ? 'movePath' : 'dropPath', payload: { subject: active.subject, positions: active.positions } })
  }
  function hit(subject: Apparatus, x: number, y: number, width: number, height: number) {
    const position = current.positions[subject]
    return <g key={subject} transform={subject === 'bucket' ? bucketTransform : current.attached === subject ? swingTransform : undefined} data-apparatus={subject} data-canvas-pan-block data-hit-target="archimedes-apparatus" tabIndex={readOnly ? -1 : 0} role="button" aria-disabled={readOnly} aria-label={`拖动${APPARATUS_LABELS[subject]}`} className={readOnly ? 'cursor-default outline-none' : 'cursor-grab outline-none active:cursor-grabbing'}
      onPointerDown={event => begin(event, subject)} onPointerMove={update} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setSelectedApparatus(subject); return }
        if (readOnly || (subject === 'bucket' && state.bucketLocked) || (subject === 'meter' && state.attached === 'bucket' && state.bucketLocked)) return
        const delta = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[event.key]
        if (!delta) return
        event.preventDefault()
        dispatch({ type: subject === 'meter' ? 'move' : 'dropMove', payload: { subject, position: { x: position.x + delta[0], y: position.y + delta[1] } } })
      }}>
      <title>{APPARATUS_LABELS[subject]}：拖动移动，方向键微调</title>
      <rect x={position.x + x} y={position.y + y} width={width} height={height} fill="transparent" stroke="transparent" strokeWidth="2" className="focus-within:stroke-[#8fb3ff]" />
    </g>
  }
  return <div className="relative h-full w-full bg-[#343941] text-[#e6ebf1]" onPointerDown={event => { if (!(event.target as Element).closest('[data-canvas-pan-block]')) setSelectedApparatus(null) }}>
    <InfiniteCanvas key={layoutEpoch} stageRef={stageRef} onCameraChange={setCamera} content={INITIAL_BOUNDS} padding={PADDING} tilt={0} showToolbar={false}>
      <svg ref={svgRef} width="100%" height="100%" style={{ overflow: 'visible' }} aria-label="阿基米德原理实验台">
        <ApparatusDefs />
        <rect data-experiment-ground x="-100000" y={GROUND_Y} width="200000" height="100000" fill="#2b2f36" pointerEvents="none" />
        <WoodenBench />
        {!current.cupRemoved && <OverflowCup state={current} selected={selectedApparatus === 'cup'} />}
        {current.cupTetherLength !== null && <line data-cup-tether x1={current.positions.cup.x} y1={current.positions.cup.y + CUP_BOTTOM} x2={current.positions.object.x} y2={current.positions.object.y - 14} stroke="#d4d0bb" strokeWidth="1.5" pointerEvents="none" />}
        {!current.objectRemoved && <g data-suspended-load={current.attached === 'object' ? 'object' : undefined} transform={current.attached === 'object' ? swingTransform : undefined}><MetalObject state={current} selected={selectedApparatus === 'object'} /></g>}
        {!current.cupRemoved && <OverflowCup state={current} front />}
        {!current.bucketRemoved && <g data-bucket-pour={current.bucketPour?.elapsed} data-suspended-load={current.attached === 'bucket' ? 'bucket' : undefined} transform={bucketTransform}><CollectionBucket state={current} selected={selectedApparatus === 'bucket'} showVolume={!current.bucketPour} /></g>}
        {current.bucketPour && <text x={current.positions.bucket.x + 165} y={current.positions.bucket.y + 40} fill="#f4f5f3" fontSize="16" pointerEvents="none">{current.collectedVolume.toFixed(1)} mL</text>}
        {current.meterSettings.showTrace && current.meterTrace.length > 1 && <polyline data-meter-trace points={current.meterTrace.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#54a8fa" strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />}
        {!current.meterRemoved && <SpringMeter state={current} selected={meterSelected} />}
        {meterHeld && !current.meterRemoved && <image data-meter-grip-hand aria-hidden="true" href="/physics/apparatus/meter-grip-hand.png" x={current.positions.meter.x - 24} y={current.positions.meter.y - 96} width="218" height="109" pointerEvents="none" />}
        <WaterEffects state={current} />
        {!current.cupRemoved && hit('cup', -110, -5, 220, 287)}
        {!current.bucketRemoved && hit('bucket', -52, -57, 104, 173)}
        {!current.objectRemoved && hit('object', -25, -24, 50, 104)}
        {!current.meterRemoved && <>
          {hit('meter', -29, -30, 58, 263 + current.pullExtension)}
          {(['ring', 'hook'] as const).map(endpoint => <g key={endpoint} data-canvas-pan-block role="button" tabIndex={readOnly ? -1 : 0} aria-label={`拖动测力计${endpoint === 'ring' ? '吊环' : '挂钩'}`} onPointerDown={event => begin(event, 'meter', endpoint)} onPointerMove={update} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)} onKeyDown={event => {
            if (readOnly) return
            const delta = { ArrowUp: -5, ArrowDown: 5 }[event.key]
            if (!delta) return
            event.preventDefault()
            event.stopPropagation()
            dispatch({ type: 'pullMeter', payload: { endpoint, position: { x: current.positions.meter.x, y: current.positions.meter.y + (endpoint === 'hook' ? HOOK_Y + current.pullExtension : 0) + delta } } })
          }}>
            <rect x={current.positions.meter.x - 18} y={current.positions.meter.y + (endpoint === 'ring' ? -30 : 205 + current.pullExtension)} width="36" height="30" fill="transparent" className="cursor-ns-resize" />
          </g>)}
        </>}
      </svg>
    </InfiniteCanvas>
    <ImmersiveToolbarSlot><ImmersiveToolbarButton label="复位器材摆位" showLabel disabled={readOnly} onClick={() => { dispatch({ type: 'resetLayout' }); setPreview(null); setSelectedApparatus(null); setLayoutEpoch(value => value + 1) }}><RotateCcw className="size-4" /></ImmersiveToolbarButton></ImmersiveToolbarSlot>
    <div data-canvas-pan-block className="archimedes-collaboration absolute right-3 top-3 z-30 flex gap-3">
      <button type="button" aria-label="实验报告" onClick={onOpenReport} className="archimedes-report-button flex flex-col items-center gap-1.5 px-2 py-2 text-[11px] text-[#a8b1bc] hover:text-white"><FileText className="size-4" /><span>实验报告</span></button>
      <button type="button" aria-label="推送学生端打开" onClick={() => setPushHint(true)} className="archimedes-report-button flex flex-col items-center gap-1.5 px-2 py-2 text-[11px] text-[#a8b1bc] hover:text-white"><MonitorUp className="size-4" /><span>推送学生端打开</span></button>
    </div>
    {pushHint && <p role="status" className="absolute right-3 top-16 z-40 rounded bg-[#22262c]/95 px-3 py-2 text-xs text-amber-200">敬请期待</p>}
    {current.attached && !current.meterRemoved && <button type="button" aria-label="断开挂钩" title="断开挂钩" data-canvas-pan-block disabled={readOnly || meterHeld || (current.attached === 'bucket' && !!current.bucketPour)} onClick={() => dispatch({ type: 'detach', payload: { position: rotatedLoadPosition(current.positions[current.attached!], hook, swingAngle) } })} className="absolute z-20 grid size-11 place-items-center rounded-full bg-white text-[#343941] shadow-md hover:bg-[#eef3fb] disabled:opacity-50" style={{ left: camera.x + (current.positions.meter.x + detachOffset) * camera.scale, top: camera.y + (current.positions.meter.y + HOOK_Y + 8) * camera.scale }}><Unlink size={24} /></button>}
    {meterSelected && !meterHeld && !current.meterRemoved && <SpringMeterInspector onOpen3D={() => setModelOpen(true)} settings={current.meterSettings} disabled={readOnly} point={{ x: camera.x + (current.positions.meter.x + 43) * camera.scale + 6, y: camera.y + (current.positions.meter.y - 106) * camera.scale }} viewport={viewport} onChange={settings => dispatch({ type: 'setMeterSettings', payload: settings })} onDelete={() => { dispatch({ type: 'deleteMeter' }); setSelectedApparatus(null) }} onMove={(dx, dy) => dispatch({ type: 'move', payload: { subject: 'meter', position: { x: state.positions.meter.x + dx, y: state.positions.meter.y + dy } } })} />}
    {selectedApparatus === 'bucket' && !current.bucketRemoved && !current.bucketPour && <BucketInspector pouring={!!current.bucketPour} locked={current.bucketLocked} empty={current.collectedVolume <= .001} disabled={readOnly} point={{ x: camera.x + (current.positions.bucket.x + (current.attached === 'bucket' ? 140 : 66)) * camera.scale + 6, y: camera.y + (current.positions.bucket.y - 62) * camera.scale }} viewport={viewport} onLock={locked => dispatch({ type: 'setBucketLocked', payload: locked })} onClear={() => dispatch({ type: 'startBucketPour' })} onDelete={() => { dispatch({ type: 'deleteBucket' }); setSelectedApparatus(null) }} />}
    {selectedApparatus === 'cup' && !current.cupRemoved && <CupInspector name={current.cupName} tether={current.cupTether} disabled={readOnly} point={{ x: camera.x + (current.positions.cup.x + 180) * camera.scale + 6, y: camera.y + (current.positions.cup.y - 16) * camera.scale }} viewport={viewport} onName={name => dispatch({ type: 'setCupName', payload: name })} onTether={tether => dispatch({ type: 'setCupTether', payload: tether })} onReset={() => dispatch({ type: 'resetCup' })} onDelete={() => { dispatch({ type: 'deleteCup' }); setSelectedApparatus(null) }} />}
    {selectedApparatus === 'object' && !current.objectRemoved && <ObjectInspector settings={current.objectSettings} disabled={readOnly} point={{ x: camera.x + (current.positions.object.x + (current.attached === 'object' ? 130 : 30)) * camera.scale + 6, y: camera.y + (current.positions.object.y - 30) * camera.scale }} viewport={viewport} onChange={settings => dispatch({ type: 'setObjectSettings', payload: settings })} onDelete={() => { dispatch({ type: 'deleteObject' }); setSelectedApparatus(null) }} />}
    {modelOpen && !current.meterRemoved && <SpringMeterModel3D onClose={() => setModelOpen(false)} />}
    {current.meterSettings.magnifier && !current.meterRemoved && <aside aria-label="测力计放大镜" data-canvas-pan-block className="absolute bottom-16 left-4 z-20 rounded-xl border border-white/15 bg-[#22262c]/95 p-3"><svg width="160" height="260" viewBox="-30 15 60 170"><SpringMeter state={{ ...current, positions: { ...current.positions, meter: { x: 0, y: 0 } } }} showReading={false} /></svg></aside>}
    {current.meterDamaged && <p role="alert" className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-[#442b2b] px-4 py-2 text-xs text-red-200">已超出弹性限度，测力计失准；重置实验可恢复。</p>}
  </div>
}

export function ArchimedesLab({ experiment }: { experiment: TextbookPhysicsExperiment }) {
  return <div className="archimedes-lab"><PhysicsLabShell experiment={experiment} controller={archimedesController} Scene={ArchimedesScene} ReportView={ArchimedesReport} MeasurementControls={MeasurementControls} recordAction={{ type: 'recordTrial' }} editableTitleStorageKey={`physics:lab-title:${experiment.id}`} showActionLabels measurementLabel="实验数据" showFooter={false} /></div>
}
