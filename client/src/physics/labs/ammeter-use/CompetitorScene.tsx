/**
 * 「练习使用电流表」实验页面 —— 按竞品（NB 物理实验，s.nobook.com?id=402785）1:1 复原。
 *
 * 版式与交互对齐竞品：
 *   · 顶部深色标题栏（左侧工具条：保存/清空/重置/撤销/恢复/设置，电路图/表格；右侧协作入口）
 *   · 深色画布（#343941），实物器材 + 手绘红色导线，可自由拖动接线柱连线
 *   · 左上角「转电路图」浮层按钮，一键切换实物图 / 原理图
 *   · 右上角「实验报告 / 推送学生端打开」
 *   · 右侧「实验报告」抽屉：目的/原理/器材/步骤/结论/补充（文案取自竞品原文）
 */
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import {
  FileText,
  Grid3x3,
  MonitorUp,
  RotateCcw,
  Unplug,
} from 'lucide-react'
import type { TextbookPhysicsExperiment } from '../../curriculum/types'
import PhysicsLabShell, { type PhysicsLabSceneProps } from '../../runtime/PhysicsLabShell'
import InfiniteCanvas, {
  PERSPECTIVE_DEPTH,
} from '../../runtime/immersive/InfiniteCanvas'
import { ImmersiveToolbarButton, ImmersiveToolbarSlot } from '../../runtime/immersive/ImmersiveLabStage'
import { projectPerspective } from '../../runtime/immersive/canvas'
import { usePointerDrag } from '../../runtime/usePointerDrag'
import type { LabAction, Position } from '../../runtime/types'
import {
  CIRCUIT_TERMINALS,
  type AmmeterTerminalId,
  type CircuitTerminalId,
} from './definition'
import { practiceController, evaluatePracticeCircuit, type PracticeState as AmmeterLabState } from './practiceController'
import { SOURCE_DAMAGE_CURRENT, SOURCE_DAMAGE_DELAY, METER_DAMAGE_DELAY } from './freeCircuit'
import { currentWireDirections } from './currentFlow'
import type { CircuitEdge } from './controller'
import SwitchHandle from './SwitchHandle'
import { nearestTerminal, terminalAt } from './terminalHit'
import { AmmeterA1, BatteryHolderE1, KnifeSwitch, LampHolderL1, DetachedLampBulb, PART_GEOMETRY } from './RealisticParts'
import { switchBodyBounds } from './switchGeometry'
import { createReferenceLayout } from './referenceLayout'
import { exposedWireEnd, METAL_POST_GEOMETRY, wireAppearance } from './wireAppearance'
import WireBareEnd from './WireBareEnd'
import { COMPETITOR_BACKGROUND } from './competitorScene'
import { TERMINAL_DRAW_ORDER } from './competitorGeometry'
import {
  COMPONENT_HIT_RADIUS,
  COMPONENT_LABELS,
  LAB_COMPONENT_IDS,
  TERMINAL_OWNER,
  componentBodyRect,
  fitLayoutToStage,
  fitPaddingWithinSafeArea,
  layoutBounds,
  layoutOutOfControls,
  offCanvasComponents,
  perspectiveStageWithin,
  resolveViewport,
  screenToCanvasWithinViewport,
  terminalPosition,
  usableStageRect,
  visibleScreenArea,
  wireHandlePosition,
  wireKey,
  wirePathPoints,
  type CanvasViewport,
  type LabComponentId,
  type LabLayout,
} from './layout'
import { useLabLayoutDrag } from './useLabLayoutDrag'
import { AmmeterSchematic } from './SchematicView'
import ReportDrawer from './ReportDrawer'
import MeterInspector, { MeterCurrentGraph } from './MeterInspector'
import { DEFAULT_METER_SETTINGS } from './meterSettings'
import SwitchInspector from './SwitchInspector'
import LampInspector from './LampInspector'
import { lampSettingsFor } from './lampSettings'
import BatteryInspector from './BatteryInspector'
import { batterySettingsFor } from './batterySettings'
import { switchSettingsFor } from './switchSettings'

const AmmeterModel3D = lazy(() => import('./AmmeterModel3D'))


/**
 * 3D 透视舞台参数（与 InfiniteCanvas 的 CSS 保持同一套常量）。
 *
 * `perspective-origin: 50% 58%` 是**相对舞台**的百分比，
 * 因此必须按舞台实际尺寸换算成像素再交给反投影。
 */
function perspectiveOf(width: number, height: number) {
  return {
    tilt: 0,
    perspective: PERSPECTIVE_DEPTH,
    originX: width * 0.5,
    originY: height * 0.58,
  }
}

/**
 * 视口尺寸（SSR 安全）。
 *
 * 服务端渲染时没有 `window`；测试又是在 Node 里直接 `renderToString`。
 * 直接读 `window.innerWidth` 会当场抛 `window is not defined`（实测 14 条测试全挂）。
 * 回落值取竞品原始坐标系（960×540）——那正是"没有视口信息时"最合理的摆放依据，
 * 而且与旧行为一致；真实浏览器里这个值随后会被 `ResizeObserver` 量到的真实尺寸覆盖。
 */
function viewportWidth(): number {
  return typeof window === 'undefined' ? 960 : window.innerWidth
}

function viewportHeight(): number {
  return typeof window === 'undefined' ? 540 : window.innerHeight
}

/**
 * 初始构图：**先按"能摆器材的那块"等比摆放，再把每一件推到浮层之外**。
 *
 * 两步都不可少：
 *   1. `fitLayoutToStage(..., usableStageRect(...))` 保证整体尺度合适；
 *   2. `layoutOutOfControls(...)` 保证**没有一件器材被控件压住**。
 *      只做第 1 步是不够的 —— 实测 1375×782 下 `S2` 的下缘仍会压在
 *      底部读数条下面 80px（画布坐标看着贴边，投影到屏幕就压住了）。
 *
 * 投影与反投影都用与场景**同一套**相机 / 透视参数（`resolveViewport` + `projectPerspective`），
 * 因此"摆到哪"与"判据说在哪"永远一致。
 */
function initialLayoutFor(width: number, height: number): LabLayout {
  const fitted = fitLayoutToStage(createReferenceLayout(), usableStageRect(width, height))
  const viewport = resolveViewport(visibleScreenArea(width, height), { scale: 1, x: 0, y: 0 }, perspectiveOf(width, height))
  if (viewport === null) return fitted
  const stage = perspectiveStageWithin(viewport.camera, viewport.perspective ?? {
    tilt: 0,
    perspective: 0,
    originX: 0,
    originY: 0,
    stage: { width, height },
  })
  return layoutOutOfControls(
    fitted,
    width,
    height,
    (rect) => {
      const points = [
        projectPerspective({ x: rect.left, y: rect.top }, stage),
        projectPerspective({ x: rect.right, y: rect.top }, stage),
        projectPerspective({ x: rect.left, y: rect.bottom }, stage),
        projectPerspective({ x: rect.right, y: rect.bottom }, stage),
      ]
      return {
        left: Math.min(...points.map((p) => p.x)),
        right: Math.max(...points.map((p) => p.x)),
        top: Math.min(...points.map((p) => p.y)),
        bottom: Math.max(...points.map((p) => p.y)),
      }
    },
    (delta) => ({ dx: delta.dx / (viewport.camera.scale || 1), dy: delta.dy / (viewport.camera.scale || 1) }),
  )
}

/** 聚焦测量的取样点：每件器材本体外接矩形的四角 */
function probesOf(layout: LabLayout, ids: readonly LabComponentId[] = LAB_COMPONENT_IDS): Position[] {
  const points: Position[] = []
  for (const id of ids) {
    const center = layout.components[id]
    const rect = componentBodyRect(id, center)
    const angle = (layout.componentAngles?.[id] ?? 0) * Math.PI / 180
    points.push(...[
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.left, y: rect.bottom },
      { x: rect.right, y: rect.bottom },
    ].map(point => ({
      x: center.x + (point.x - center.x) * Math.cos(angle) - (point.y - center.y) * Math.sin(angle),
      y: center.y + (point.x - center.x) * Math.sin(angle) + (point.y - center.y) * Math.cos(angle),
    })))
  }
  return points
}

/** 竞品画布上的器材参考点（世界坐标已映射到视图坐标） */
const canvasBackground = COMPETITOR_BACKGROUND

function isPosition(value: unknown): value is Position {
  if (typeof value !== 'object' || value === null) return false
  const point = value as Partial<Position>
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function terminalLabel(id: CircuitTerminalId): string {
  return id === 'lamp2-a' ? '开关 S₂ 左接线柱' : id === 'lamp2-b' ? '开关 S₂ 右接线柱' : CIRCUIT_TERMINALS[id].label
}

function terminalHasWire(state: AmmeterLabState, id: CircuitTerminalId): boolean {
  return state.edges.some((edge) => edge.from === id || edge.to === id)
}

interface TerminalProps {
  id: AmmeterTerminalId
  state: AmmeterLabState
  /** 接线柱坐标（由布局推导，拖动器材时会跟着移动） */
  point: { x: number; y: number }
  selected: boolean
  angle?: number
  loose?: boolean
  drag: {
    onPointerDown(event: PointerEvent<SVGElement>): void
    onPointerMove(event: PointerEvent<SVGElement>): void
    onPointerUp(event: PointerEvent<SVGElement>): void
    onPointerCancel(event: PointerEvent<SVGElement>): void
  }
}

/**
 * 可拖拽接线柱：竞品同款外观（立柱+旋帽）叠加透明命中区。
 *
 * 坐标不再写死，而是由 layout.terminalPosition 推导 —— 器材被拖到任何位置，
 * 它的接线柱都与器材本体一起移动，导线端点也随之跟随，绝不会"线和器材脱开"。
 */
function CompetitorTerminal({ id, state, point, selected, drag, angle = 0, loose = false }: TerminalProps) {
  const label = terminalLabel(batterySettingsFor(state).reversed && id.startsWith('battery') ? id === 'battery+' ? 'battery-' : 'battery+' : id)
  const connected = terminalHasWire(state, id)
  const switchPost = id === 'switch-a' || id === 'switch-b' || id === 'lamp2-a' || id === 'lamp2-b'
  const handlers = {
    onPointerDown: (event: PointerEvent<SVGElement>) => { if (event.button === 0) drag.onPointerDown(event) },
    onPointerMove: drag.onPointerMove,
    onPointerUp: drag.onPointerUp,
    onPointerCancel: drag.onPointerCancel,
  }
  return (
    <g>
      <ellipse
        data-hit-target="ammeter-terminal-knob"
        data-terminal={loose ? undefined : id}
        data-loose-terminal={loose ? id : undefined}
        aria-pressed={selected}
        stroke={selected ? '#f0bd56' : 'none'}
        strokeWidth="1.5"
        cx={point.x}
        // 竖椭圆覆盖旋帽和柱脚，避免横向扩大热区遮挡握柄。
        cy={point.y + (switchPost && !loose ? 6 : 0)}
        rx={loose ? 16 : switchPost ? 9 : 15}
        ry={loose ? 10 : switchPost ? 12 : 15}
        transform={angle && !loose ? `rotate(${angle} ${point.x} ${point.y})` : undefined}
        fill="transparent"
        className="cursor-crosshair"
        role="button"
        tabIndex={0}
        aria-label={loose ? `悬空导线端 ${label}` : label}
        {...handlers}
      ><title>{`${label} · ${connected ? '拖动重接 · 多根线先选线 · Shift拖动新增' : '拖动以接线'}`}</title></ellipse>
    </g>
  )
}

/**
 * 器材本体拖动命中区。
 *
 * 单独抽成一个组件的原因：它必须画在器材本体上、但不能盖住接线柱，
 * 否则「想接线」会变成「把器材拖走」。指针事件里还会再判一次是否落在接线柱上，
 * 命中区只是第一层保险。
 */
function ComponentDragHandle({ id, layout, drag, onActivate }: {
  id: LabComponentId
  layout: LabLayout
  drag: {
    onPointerDown(event: PointerEvent<SVGElement>): void
    onPointerMove(event: PointerEvent<SVGElement>): void
    onPointerUp(event: PointerEvent<SVGElement>): void
    onPointerCancel(event: PointerEvent<SVGElement>): void
  }
  onActivate?(): void
}) {
  const center = layout.components[id]
  const gesture = useRef({ x: 0, y: 0, moved: false })
  return (
    <g
      data-component-drag={id}
      role="button"
      tabIndex={0}
      aria-label={onActivate ? id === 'A1' ? '选择电流表（点击操作，拖动摆位）' : `选择${COMPONENT_LABELS[id]}（点击选中，拖动摆位）` : `拖动${COMPONENT_LABELS[id]}到任意位置`}
      className="cursor-move"
      onPointerDown={(event) => {
        gesture.current = { x: event.clientX, y: event.clientY, moved: false }
        drag.onPointerDown(event)
      }}
      onPointerMove={(event) => {
        if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 4) gesture.current.moved = true
        drag.onPointerMove(event)
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={(event) => { gesture.current.moved = true; drag.onPointerCancel(event) }}
      onClick={(event) => { if (event.button === 0 && !gesture.current.moved) onActivate?.() }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onActivate?.() } }}
    >
      {/* 命中区：与器材本体同尺寸的透明矩形（不遮挡接线柱） */}
      <rect
        transform={layout.componentAngles?.[id] ? `rotate(${layout.componentAngles[id]} ${center.x} ${center.y})` : undefined}
        x={center.x - COMPONENT_HIT_RADIUS[id].rx}
        y={center.y - COMPONENT_HIT_RADIUS[id].ry}
        width={COMPONENT_HIT_RADIUS[id].rx * 2}
        height={COMPONENT_HIT_RADIUS[id].ry * 2}
        fill="transparent"
      />
      {/*
        这里**刻意不画**任何"拖动包围框"。
        曾经在拖动时画一个虚线矩形（正是用户截图里红框圈出来的那个"小框"），
        它的本意是提示"这件器材可以直接拖"，但在用户看来它是一条
        **实际存在的边界**——器材一碰到它就像被框住，与"无限画布"完全相反。
        提示改由鼠标 `cursor: move` 与画布左下角的文字说明承担。
      */}
    </g>
  )
}

/** 导线折点手柄：拖动即可像真导线一样任意弯折（端点仍牢牢接在接线柱上） */
function WireBendHandle({ from, to, layout, active, drag, onSelect, onDisconnect }: {
  from: AmmeterTerminalId
  to: AmmeterTerminalId
  layout: LabLayout
  active: boolean
  drag: {
    onPointerDown(event: PointerEvent<SVGElement>): void
    onPointerMove(event: PointerEvent<SVGElement>): void
    onPointerUp(event: PointerEvent<SVGElement>): void
    onPointerCancel(event: PointerEvent<SVGElement>): void
  }
  onSelect(): void
  onDisconnect(): void
}) {
  const handle = wireHandlePosition(layout, from, to)
  return (
    <g
      data-hit-target="wire-bend-handle"
      data-wire-hit={wireKey(from, to)}
      role="button"
      tabIndex={0}
      aria-label={`弯折${terminalLabel(from)}到${terminalLabel(to)}的导线`}
      className="cursor-grab"
      {...drag}
      onClick={onSelect}
      onDoubleClick={onDisconnect}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}
    >
      <circle cx={handle.x} cy={handle.y} r="18" fill="transparent" />
      <circle
        cx={handle.x}
        cy={handle.y}
        r={active ? 7 : 5}
        fill={active ? '#f0c86a' : '#e8756a'}
        stroke="#2b1410"
        strokeWidth="1.2"
        opacity={active ? 1 : 0}
        pointerEvents="none"
      />
    </g>
  )
}

interface CompetitorSceneProps extends PhysicsLabSceneProps<AmmeterLabState> {
  onOpenReport(): void
}

function CompetitorSceneCanvas({ state, dispatch, onOpenReport }: CompetitorSceneProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const cameraRef = useRef<{ scale: number; x: number; y: number }>({ scale: 1, x: 0, y: 0 })
  /**
   * 相机的**纯数值快照**（渲染期可安全读取）。
   * cameraRef 供事件回调使用，cameraState 供渲染期计算可见矩形使用。
   */
  const [cameraState, setCameraState] = useState({ scale: 1, x: 0, y: 0 })
  /** 舞台尺寸快照（渲染期可安全读取） */
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  /** 舞台尺寸的**回调可读**镜像（相机变更回调在事件时机触发，不能读 state） */
  const stageSizeRef = useRef({ width: 0, height: 0 })
  const [preview, setPreview] = useState<{ from: AmmeterTerminalId; position: Position; edge?: CircuitEdge; endpoint: AmmeterTerminalId } | null>(null)
  const wireGesture = useRef<{ start: Position; started: boolean } | null>(null)
  const [selectedTerminal, setSelectedTerminal] = useState<AmmeterTerminalId | null>(null)
  const [lampSelected, setLampSelected] = useState(false)
  const lampSettings = lampSettingsFor(state)
  const [bulbPosition, setBulbPosition] = useState<Position | null>(null)
  const bulbGesture = useRef<{ pointerId: number; offset: Position } | null>(null)
  const [batterySelected, setBatterySelected] = useState(false)
  const batterySettings = batterySettingsFor(state)
  const [selectedSwitch, setSelectedSwitch] = useState<'S1' | 'S2' | null>(null)
  const s1Settings = switchSettingsFor(state, 'S1')
  const s2Settings = switchSettingsFor(state, 'S2')
  const removedSwitches = useMemo(() => (['S1', 'S2'] as const).filter(id => id === 'S1' ? s1Settings.removed : s2Settings.removed), [s1Settings.removed, s2Settings.removed])
  const removedComponents = useMemo<LabComponentId[]>(() => [...removedSwitches, ...(batterySettings.removed ? ['E1' as const] : []), ...(lampSettings.removed ? ['L1' as const] : [])], [removedSwitches, batterySettings.removed, lampSettings.removed])
  const [wireHint, setWireHint] = useState<string | null>(null)
  const [showSchematic, setShowSchematic] = useState(false)
  const contactClipId = useId()
  const wireMetalId = useId()
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [meterSelected, setMeterSelected] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  if (selectedWire !== null && !state.edges.some((edge) => wireKey(edge.from, edge.to) === selectedWire)) setSelectedWire(null)

  // 文档级监听包含外壳标题/工具栏；编辑文字时不接管删除键。
  useEffect(() => {
    function clearOutsideWire(event: globalThis.PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest('[data-wire-hit],[data-terminal],[data-loose-terminal]')) setSelectedWire(null)
      if (!(event.target instanceof Element) || !event.target.closest('[data-terminal],[data-loose-terminal]')) setSelectedTerminal(null)
      if (!(event.target instanceof Element) || !event.target.closest('[data-component-drag="S1"],[data-component-drag="S2"],[data-switch-ui]')) setSelectedSwitch(null)
      if (!(event.target instanceof Element) || !event.target.closest('[data-component-drag="E1"],[data-battery-ui]')) setBatterySelected(false)
      if (!(event.target instanceof Element) || !event.target.closest('[data-component-drag="L1"],[data-lamp-ui],[data-detached-bulb]')) setLampSelected(false)
      setWireHint(null)
      if (!(event.target instanceof Element) || !event.target.closest('[data-component-drag="A1"],[data-meter-ui]')) setMeterSelected(false)
    }
    function deleteWire(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return
      const edge = state.edges.find((edge) => wireKey(edge.from, edge.to) === selectedWire)
      if (!edge) return
      event.preventDefault()
      dispatch({ type: 'disconnect', payload: edge }, 'disconnect-wire')
      setSelectedWire(null)
    }
    document.addEventListener('pointerdown', clearOutsideWire, true)
    document.addEventListener('keydown', deleteWire)
    return () => {
      document.removeEventListener('pointerdown', clearOutsideWire, true)
      document.removeEventListener('keydown', deleteWire)
    }
  }, [selectedWire, state.edges, dispatch])
  /**
   * 学生是否动过构图（动过就不再随窗口缩放自动重排，避免抹掉学生摆好的位置）。
   *
   * 用 state 而不是 ref：下面的"按尺寸重摆"发生在**渲染期**，
   * 而渲染期读 ref 是 React 明确禁止的（`react-hooks/refs` 会直接报错）。
   */
  const [touched, setTouched] = useState(false)
  /**
   * 器材 / 导线布局（无限画布的可变部分）。
   *
   * **初始摆放按舞台尺寸算**：竞品数据是 960×540 坐标系，而现在画布就是整个视口，
   * 所以初始构图要等比缩放 + 居中摆进舞台（`fitLayoutToStage`）。
   * 之后学生可以把每件器材拖到屏幕任意位置、把每根导线弯成任意形状。
   */
  const [baseLayout, setLayout] = useState<LabLayout>(() =>
    initialLayoutFor(viewportWidth(), viewportHeight()),
  )
  const layout = useMemo<LabLayout>(() => ({ ...baseLayout, componentAngles: { S1: s1Settings.angle, S2: s2Settings.angle, E1: batterySettings.angle, L1: lampSettings.angle }, componentReversed: { S1: s1Settings.reversed, S2: s2Settings.reversed, L1: lampSettings.reversed } }), [baseLayout, s1Settings.angle, s2Settings.angle, batterySettings.angle, s1Settings.reversed, s2Settings.reversed, lampSettings.angle, lampSettings.reversed])
  /**
   * 舞台尺寸变化时，把**还没被学生动过**的构图重新摆一次。
   *
   * "有没有被动过"用 `touched` 记录：一旦学生拖过任何东西，
   * 就不再自动重排，否则窗口一缩放学生摆好的构图就被抹掉。
   */
  const [initialBounds, setInitialBounds] = useState(() =>
    layoutBounds(initialLayoutFor(viewportWidth(), viewportHeight())),
  )
  /**
   * 聚焦测量的取样点：每件器材**本体外接矩形的四角**（取初始构图）。
   *
   * 为什么不能只用 `initialBounds` 的四条边：透视是非线性的，
   * 包围盒是各件器材外接矩形的并集，而"并集的下边"投影到屏幕上
   * **比某件器材自己的下角更靠上** —— 实测差 3.96px，正好让 S2 的下缘
   * 压在底部读数条下面。按真实四角量，聚焦结果才与可见性判据严格一致。
   */
  const [componentProbes, setComponentProbes] = useState(() => probesOf(layout))

  // 拉离已有端点时，该导线在预览期间已经断开；取消会把它放回原接线柱。
  const physicalState = preview?.edge ? { ...state, edges: state.edges.filter(edge => wireKey(edge.from, edge.to) !== wireKey(preview.edge!.from, preview.edge!.to)) } : state
  const live = evaluatePracticeCircuit(physicalState)
  const physicsDispatch = useRef(dispatch)
  useEffect(() => { physicsDispatch.current = dispatch }, [dispatch])
  const lampOvervoltage = !state.lampDamaged && !state.bulbDetached && !lampSettings.removed && !lampSettings.broken && !lampSettings.shorted && Math.abs(live.lampVoltage) > lampSettings.burnVoltage
  useEffect(() => {
    if (!lampOvervoltage) return
    const timer = window.setTimeout(() => physicsDispatch.current({ type: 'damageLamp' }, 'lamp-overvoltage'), 0)
    return () => window.clearTimeout(timer)
  }, [lampOvervoltage])
  const sourceOverloaded = live.sourceCurrent > SOURCE_DAMAGE_CURRENT
  useEffect(() => {
    if (!sourceOverloaded) return
    const timer = window.setTimeout(() => physicsDispatch.current({ type: 'damageSource' }, 'source-overheat'), SOURCE_DAMAGE_DELAY)
    return () => window.clearTimeout(timer)
  }, [sourceOverloaded])
  const meterOverloaded = live.meterLoad > 1
  useEffect(() => {
    if (!meterOverloaded) return
    const timer = window.setTimeout(() => physicsDispatch.current({ type: 'damageMeter' }, 'meter-overheat'), METER_DAMAGE_DELAY)
    return () => window.clearTimeout(timer)
  }, [meterOverloaded])
  const wireDirections = currentWireDirections(physicalState)
  const reading = live.current
  const meterSettings = state.meterSettings ?? DEFAULT_METER_SETTINGS
  const lit = live.lampLit
  const s1Closed = state.switchClosed
  const s2Closed = Boolean(state.bypassClosed)

  /**
   * 指针坐标 → 画布坐标。
   *
   * **必须与"哪里算可见"用同一套变换**（都带 3D 透视反投影），否则两边口径不一致：
   * 曾在 1688×841 下实测到拖动映射用线性反算、可见范围用透视反算，
   * 结果拖到底时器材**始终探出 7～8px**，而判据又只看中心，于是既看不见也不收回。
   * 现在这里直接复用 `resolveViewport` + `screenToCanvasWithinViewport`，
   * 与可见范围共用同一组 screen/camera/perspective，不可能再错配。
   */
  /**
   * 可见范围的**唯一计算入口**（事件回调用，读 ref）。
   *
   * 返回值同时含可见矩形、屏幕矩形与透视参数，供 `scenePositionFor` 复用，
   * 保证"哪里算可见"与"指针指向哪"永远是同一口径。
   */
  const viewportOf = useCallback(
    (width: number, height: number, camera: { scale: number; x: number; y: number }): CanvasViewport | null =>
      resolveViewport(visibleScreenArea(width, height), camera, perspectiveOf(width, height)),
    [],
  )

  const scenePositionFor = useCallback((event: { clientX: number; clientY: number }): Position | null => {
    const stage = stageRef.current
    if (stage === null) return null
    const rect = stage.getBoundingClientRect()
    const viewport = viewportOf(rect.width, rect.height, cameraRef.current)
    return screenToCanvasWithinViewport({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewport, cameraRef.current)
  }, [viewportOf])

  // 命中测试需要在事件回调里读取"最新的"布局，用 ref 镜像避免回调频繁重建
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  /** 最近的接线柱（含坐标）：由布局推导，拖动器材后命中区同步移动 */
  const nearestTerminalTo = useCallback((position: Position) => nearestTerminal(layoutRef.current, position, state.meterRemoved, removedComponents), [state.meterRemoved, removedComponents])

  const pointerDrag = usePointerDrag({
    stageRef,
    positionFor: scenePositionFor,
    dispatch: (action: LabAction) => {
      const payload = action.payload as { subject?: unknown; position?: unknown } | undefined
      const subject = payload?.subject as { terminal: AmmeterTerminalId; edge?: CircuitEdge } | undefined
      const endpoint = subject?.terminal
      const edge = subject?.edge
      if (action.type === 'dragStart' && endpoint && isPosition(payload?.position)) {
        wireGesture.current = { start: payload.position, started: false }
        return
      }
      if (action.type === 'dragMove' && endpoint && isPosition(payload?.position)) {
        const gesture = wireGesture.current
        const position = payload.position
        if (!gesture) return
        if (!gesture.started) {
          // 区分点选和拉线：超过屏幕 4px 才开始预览，不因点击或抖动改变实验。
          if (Math.hypot(position.x - gesture.start.x, position.y - gesture.start.y) * cameraRef.current.scale <= 4) return
          gesture.started = true
          dispatch({ type: 'dragStart', payload: { subject: endpoint } }, 'start-wire')
        }
        const from = edge ? edge.from === endpoint ? edge.to : edge.from : endpoint
        setPreview({ from, position, edge, endpoint })
        return
      }
      if (action.type === 'dragCancel') {
        const started = wireGesture.current?.started
        wireGesture.current = null
        if (!started) return
        setPreview(null)
        dispatch({ type: 'dragCancel', payload: { subject: endpoint } }, 'cancel-wire')
        return
      }
      if (action.type === 'dragEnd') {
        const started = wireGesture.current?.started
        wireGesture.current = null
        if (!started) return
        setPreview(null)
        const target = isPosition(payload?.position) ? terminalAt(layoutRef.current, payload.position, state.meterRemoved, removedComponents) : null
        if (!endpoint || target === null || target === endpoint) {
          dispatch({ type: 'dragCancel', payload: { subject: endpoint } }, 'cancel-wire')
          return
        }
        if (edge) dispatch({ type: 'rewire', payload: { edge, endpoint, target } }, 'rewire-wire')
        else dispatch({ type: 'connect', payload: { from: endpoint, to: target } }, 'connect-wire')
      }
    },
  })

  const pointerEvent = (event: PointerEvent<SVGElement>) => event as unknown as PointerEvent<HTMLElement>

  /**
   * 测量舞台尺寸。
   *
   * 这是「订阅外部系统」的合法 effect 用法：ResizeObserver 是外部订阅源，
   * setState 发生在它的回调里（而不是 effect 主体里同步调用），
   * 因此不会触发级联渲染。
   */
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return
    const measure = () => {
      const rect = stage.getBoundingClientRect()
      stageSizeRef.current = { width: rect.width, height: rect.height }
      setStageSize((current) =>
        Math.abs(current.width - rect.width) > 0.5 || Math.abs(current.height - rect.height) > 0.5
          ? { width: rect.width, height: rect.height }
          : current,
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  /**
   * 舞台尺寸就绪 / 变化 → 把初始构图重新摆进舞台（仅当学生还没动过）。
   *
   * 这里刻意**不在 effect 里 setState**（`react-hooks/set-state-in-effect` 直接报错，
   * 而且会多一次级联渲染、期间闪现一帧"构图没摆好"的画面）。
   * 改用 React 官方的"渲染期按 prop 调整 state"写法：
   * 用一个记录上次摆放依据的 state 做**版本号**，尺寸真的变了才重算一次，
   * 重算后立刻返回（React 会丢弃这次渲染的输出并原地重渲染，不产生额外帧）。
   *
   * 学生一旦拖过东西（`touched`）就不再自动重排，避免窗口缩放把构图抹掉。
   */
  const [fittedFor, setFittedFor] = useState({ width: 0, height: 0 })
  if (
    stageSize.width > 0 &&
    stageSize.height > 0 &&
    !touched &&
    (Math.abs(fittedFor.width - stageSize.width) > 0.5 || Math.abs(fittedFor.height - stageSize.height) > 0.5)
  ) {
    const next = initialLayoutFor(stageSize.width, stageSize.height)
    setFittedFor({ width: stageSize.width, height: stageSize.height })
    setLayout(next)
    setInitialBounds(layoutBounds(next))
    setComponentProbes(probesOf(next))
  }

  /**
   * 渲染期读的可见矩形快照。
   *
   * 渲染期从舞台尺寸和相机状态计算提示，避免读取 ref。
   *
   * 实现上刻意**不用 effect + setState**（那会触发级联渲染，被
   * `react-hooks` 明确劝阻），而是把「相机快照」也提成 state：
   * 相机变化时由 onCameraChange 把纯数值写进 state，渲染期直接用它算可见矩形，
   * 全程不碰 ref。
   */
  const visibleRectState = useMemo(
    () =>
      resolveViewport(visibleScreenArea(stageSize.width, stageSize.height), cameraState, perspectiveOf(stageSize.width, stageSize.height))?.visible ?? null,
    [stageSize.width, stageSize.height, cameraState],
  )

  /**
   * 相机变化 → **只记录快照，绝不动布局**。
   *
   * 这里曾经在相机变化时无条件 `rescueAllComponents`（"入屏即终态"），
   * 那是"拖到边沿就拖不动了"在**平移画布**这一侧的复现路径：
   *
   *   学生把器材放到屏幕外 → 想平移画布把它找回来 → 画布一移动，
   *   相机回调立刻把所有屏幕外的器材拽回视野 —— 器材"自己走回来"，
   *   无限画布在体感上就消失了。
   *
   * 现在器材坐标的变化只有三个来源，全部是**显式**的：
   *   ① 学生拖动器材；
   *   ② 学生点「全部收回」或「复位摆位」；
   *   ③ 舞台尺寸真的变了（`fittedFor` 那一层，仅当 `!touched`）。
   *
   * 布局的快照只需要 `cameraState`（渲染期算可见范围与浮层提示用），
   * 相机变化本身不应该产生任何布局副作用。
   *
   * 引用必须**保持稳定**：`InfiniteCanvas` 会把它放进 effect 调用，
   * 引用每帧变会让 effect 每帧重跑（历史上这曾引发 "Maximum update depth exceeded"）。
   */
  const handleCameraChange = useCallback((next: { scale: number; x: number; y: number }) => {
    cameraRef.current = next
    setCameraState((current) =>
      current.scale === next.scale && current.x === next.x && current.y === next.y ? current : next,
    )
  }, [])

  /**
   * 器材 / 导线拖动（无限画布：器材任意摆放、导线任意弯折）。
   *
   * ⚠️ **刻意不把 `visibleRect` / `screenCheck` / `pushIntoView` 传进拖动逻辑**。
   *
   * 需求原话：「我要的无限画布功能，你给搞没了；现在我的实验器材无法自由的
   * 拖动到任意位置，比如拖动靠近边沿就无法拖动了，并不是无限画布」。
   *
   * 这三个回调正是"拖不动"的来源：拖动每帧都被拿去和可见矩形比对，
   * 器材一逼近屏幕边沿就被拽回视野中心。无限画布的语义应当相反 ——
   * 器材可以停在屏幕外，学生再平移画布找回来（数学上必然找得到，
   * 因为相机平移已经不再有上限）。
   *
   * 可见范围与构图计算只服务两件**不干扰拖动**的事：
   *   ① `visibleRectState` → 屏幕外器材提示；显式收回只重新聚焦构图；
   *   ② `settleLayoutForCamera` → 窗口尺寸变化后的构图重排。
   */
  const labDrag = useLabLayoutDrag({
    layout,
    setLayout: (next) => {
      // 学生亲手改过构图 → 之后窗口缩放不再自动重排
      setTouched(true)
      setLayout(current => typeof next === 'function' ? next({ ...current, componentAngles: layout.componentAngles, componentReversed: layout.componentReversed }) : next)
    },
    nearestTerminal: nearestTerminalTo,
    scenePosition: scenePositionFor as (event: PointerEvent<SVGElement>) => Position | null,
  })

  /** 拖出屏幕的器材（实时给出「全部收回」入口，避免学生以为器材丢了） */
  const strayComponents = offCanvasComponents(layout, visibleRectState).filter((id) => (id !== 'A1' || !state.meterRemoved) && !removedComponents.includes(id))

  // 视野过小时移动器材会把它们夹到同一点；重新聚焦保留摆放与接线。
  function focusLayout(next: LabLayout) {
    const ids = LAB_COMPONENT_IDS.filter(id => (id !== 'A1' || !state.meterRemoved) && !removedComponents.includes(id))
    const points = probesOf(next, ids)
    if (points.length === 0) return
    setInitialBounds({
      minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
      minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)),
    })
    setComponentProbes(points)
  }

  const visibleEdges = preview?.edge ? state.edges.filter((edge) => wireKey(edge.from, edge.to) !== wireKey(preview.edge!.from, preview.edge!.to)) : state.edges
  const wireVisuals = visibleEdges.map(edge => ({ edge, ...wireAppearance(layout, edge.from, edge.to) }))
  const wireContactPoints = new Map(wireVisuals.flatMap(({ ends }) => ends.map(end => [end.terminal, end.center] as const)))
  const previewEnd = preview ? exposedWireEnd(layout, preview.from, preview.position) : null
  let previewPath = ''
  if (preview) {
    const anchor = previewEnd!.insulation
    previewPath = `M ${anchor.x} ${anchor.y} L ${preview.position.x} ${preview.position.y}`
    if (preview.edge) {
      const points = wirePathPoints(layout, preview.edge.from, preview.edge.to)
      if (points.length === 3) {
        const oldEnd = terminalPosition(layout, preview.endpoint)
        const control = points[1]
        previewPath = `M ${anchor.x} ${anchor.y} Q ${control.x + (preview.position.x - oldEnd.x) / 2} ${control.y + (preview.position.y - oldEnd.y) / 2} ${preview.position.x} ${preview.position.y}`
      }
    }
  }

  const ammeterPoint = layout.components.A1
  const lampPoint = layout.components.L1
  const lampBounds = switchBodyBounds(lampPoint.x, lampPoint.y, lampSettings.angle, PART_GEOMETRY.lamp)
  const detachedPoint = bulbPosition ?? { x: lampPoint.x, y: lampPoint.y - 30 }
  const s1Point = layout.components.S1
  const s2Point = layout.components.S2
  const batteryPoint = layout.components.E1
  const batteryBounds = switchBodyBounds(batteryPoint.x, batteryPoint.y, batterySettings.angle, PART_GEOMETRY.battery)
  const selectedSwitchSettings = selectedSwitch ? switchSettingsFor(state, selectedSwitch) : null
  const selectedSwitchBounds = selectedSwitch ? switchBodyBounds(layout.components[selectedSwitch].x, layout.components[selectedSwitch].y, selectedSwitchSettings!.angle, PART_GEOMETRY.switch) : null

  return (
    /*
      画布底色：整块纯色，**不再是"中间一块方框"**。
      背景由根容器铺满整个视口（与 SVG 场景不再有尺寸关系），
      所以器材/导线可以被拖到任意位置，看上去永远都还在同一张无限画布上。
    */
    <div className="relative h-full w-full min-h-0 select-none" style={{ background: canvasBackground }}>
      {/* 无限画布 + 3D 透视舞台：器材铺满整块屏幕 */}
      {/* SVG 只负责画器材与导线，本身不再绘制任何背景（无桌面矩形、无网格、无暗角） */}
      <InfiniteCanvas
        showToolbar={false}
        tilt={0}
        stageRef={stageRef}
        content={initialBounds}
        probes={componentProbes}
        /**
         * 聚焦留白必须**按当前舞台尺寸**算，并且与 `controlAvoidArea` 同源。
         *
         * 上一版这里不传 `padding`，画布用的是写死的一对 `SAFE_TOP/SAFE_BOTTOM`，
         * 与器材的可见性判据各说各话 —— 于是 390×780 下器材入屏后
         * 还是被右侧胶囊组整个盖住（实测 `A1` 本体 `x205..376` 落在胶囊组 `x78..322` 里）。
         */
        padding={fitPaddingWithinSafeArea(stageSize.width, stageSize.height)}
        onCameraChange={handleCameraChange}
      >
        {/* SVG **铺满整个舞台**，坐标就是舞台像素坐标；不再有 960×540 的固定 viewBox */}
        <svg
          ref={svgRef}
          width={stageSize.width > 0 ? stageSize.width : '100%'}
          height={stageSize.height > 0 ? stageSize.height : '100%'}
          viewBox={stageSize.width > 0 && stageSize.height > 0 ? `0 0 ${stageSize.width} ${stageSize.height}` : undefined}
          className="block"
          style={{ overflow: 'visible' }}
          role="img"
          aria-label="练习使用电流表实验台"
        >
          {/*
            无限画布上**不再有任何背景方框**：
            原先的桌面矩形 + 桌面渐变 + 40px 网格 + 边缘暗角都会把画布框成一个
            "方框"，与"无限"的语义冲突，已全部移除。
            画布底色统一由外层容器的纯色背景提供（见下方根节点 background）。
          */}

          {!showSchematic && (
            <>
              {/* 主导线位于器材下方，所有器材底座附近的接线段单独覆盖图片。 */}
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                {wireVisuals.map(({ edge, path, points }) => {
                  return (
                    <g key={`${edge.from}-${edge.to}`} data-wire={`${edge.from}:${edge.to}`} data-selected={selectedWire === wireKey(edge.from, edge.to)} pointerEvents="none">
                      <path d={path} stroke={selectedWire === wireKey(edge.from, edge.to) ? '#f0bd56' : '#9f2015'} strokeWidth={selectedWire === wireKey(edge.from, edge.to) ? 6 : 4} />
                      <path d={path} stroke={selectedWire === wireKey(edge.from, edge.to) ? '#ffe4a3' : '#d12c17'} strokeWidth="2.8" />
                      {wireDirections.has(wireKey(edge.from, edge.to)) && <WireCurrentFlow path={path} points={points} direction={wireDirections.get(wireKey(edge.from, edge.to))!} />}
                    </g>
                  )
                })}
                {preview && (
                  <path
                    d={previewPath}
                    stroke={preview?.edge ? '#d12c17' : '#4c9be8'}
                    strokeWidth="4"
                    strokeDasharray={preview?.edge ? undefined : '9 7'}
                  />
                )}
              </g>

              {/* 器材（竞品同款实物）：坐标来自可变布局，可被拖到画布任意位置 */}
              {batterySelected && !batterySettings.removed && <rect data-battery-selection transform={`rotate(${batterySettings.angle} ${batteryPoint.x} ${batteryPoint.y})`} x={batteryPoint.x - 124} y={batteryPoint.y - 45} width={248} height={87} rx={6} fill="#b9c2d4" opacity={0.13} pointerEvents="none" />}
              {!batterySettings.removed && <BatteryHolderE1 x={batteryPoint.x} y={batteryPoint.y} damaged={state.sourceDamaged} label={`${batterySettings.namePrefix}${batterySettings.nameNumber}`} reversed={batterySettings.reversed} angle={batterySettings.angle} />}
              {selectedSwitch && !selectedSwitchSettings!.removed && <rect data-switch-selection={selectedSwitch} transform={`rotate(${selectedSwitchSettings!.angle} ${layout.components[selectedSwitch].x} ${layout.components[selectedSwitch].y})`} x={layout.components[selectedSwitch].x - 85} y={layout.components[selectedSwitch].y - 49} width={170} height={82} rx={6} fill="#b9c2d4" opacity={0.13} pointerEvents="none" />}
              {!s1Settings.removed && <KnifeSwitch x={s1Point.x} y={s1Point.y} closed={s1Closed} label={`${s1Settings.namePrefix}${s1Settings.nameNumber}`} id="S1" reversed={s1Settings.reversed} angle={s1Settings.angle} broken={s1Settings.broken} />}
              {!s2Settings.removed && <KnifeSwitch x={s2Point.x} y={s2Point.y} closed={s2Closed} label={`${s2Settings.namePrefix}${s2Settings.nameNumber}`} id="S2" reversed={s2Settings.reversed} angle={s2Settings.angle} broken={s2Settings.broken} />}
              {lampSelected && !lampSettings.removed && <rect data-lamp-selection transform={`rotate(${lampSettings.angle} ${lampPoint.x} ${lampPoint.y})`} x={lampPoint.x - 85} y={lampPoint.y - 52} width={170} height={91} rx={6} fill="#b9c2d4" opacity={0.13} pointerEvents="none" />}
              {!lampSettings.removed && <LampHolderL1 x={lampPoint.x} y={lampPoint.y} lit={lit} brightness={live.lampBrightness} label={`${lampSettings.namePrefix}${lampSettings.nameNumber}`} reversed={lampSettings.reversed} angle={lampSettings.angle} detached={state.bulbDetached} damaged={state.lampDamaged} broken={lampSettings.broken} shorted={lampSettings.shorted} />}
              {meterSelected && !state.meterRemoved && <rect data-meter-selection x={ammeterPoint.x - 88} y={ammeterPoint.y - 113} width={176} height={156} rx={6} fill="#b9c2d4" opacity={0.13} pointerEvents="none" />}
              {!state.meterRemoved && <AmmeterA1 x={ammeterPoint.x} y={ammeterPoint.y} reading={reading} range={state.activeRange} overRange={Boolean(state.overRangeWarning)} label={`${meterSettings.namePrefix}${meterSettings.nameNumber}`} decimals={meterSettings.decimals} damaged={state.meterDamaged} />}

              <defs><clipPath id={contactClipId}>
                {LAB_COMPONENT_IDS.filter(id => !removedComponents.includes(id)).map((id) => {
                  const part = PART_GEOMETRY[id === 'E1' ? 'battery' : id === 'L1' ? 'lamp' : id === 'A1' ? 'ammeter' : 'switch']
                  const center = layout.components[id]
                  const top = METAL_POST_GEOMETRY[id].y - 1
                  return <rect key={id} data-contact-owner={id} transform={layout.componentAngles?.[id] ? `rotate(${layout.componentAngles[id]} ${center.x} ${center.y})` : undefined} x={center.x - part.anchorX * part.scale} y={center.y + top} width={part.width * part.scale} height={(part.height - part.anchorY) * part.scale - top} />
                })}
              </clipPath></defs>
              <g data-wire-contacts clipPath={`url(#${contactClipId})`} fill="none" strokeLinecap="round" pointerEvents="none">
                {wireVisuals.map(({ edge, path }) => (
                  <g key={`contact-${edge.from}-${edge.to}`} data-wire-contact={`${edge.from}:${edge.to}`}>
                    <path d={path} stroke={selectedWire === wireKey(edge.from, edge.to) ? '#f0bd56' : '#9f2015'} strokeWidth={selectedWire === wireKey(edge.from, edge.to) ? 6 : 4} />
                    <path d={path} stroke={selectedWire === wireKey(edge.from, edge.to) ? '#ffe4a3' : '#d12c17'} strokeWidth="2.8" />
                  </g>
                ))}
                {preview && <path d={previewPath} stroke={preview?.edge ? '#d12c17' : '#4c9be8'} strokeWidth="4" strokeDasharray={preview?.edge ? undefined : '9 7'} />}
              </g>
              <defs><linearGradient id={wireMetalId} x1="0" y1="-1" x2="0" y2="3" gradientUnits="userSpaceOnUse"><stop stopColor="#b28d54" /><stop offset="0.35" stopColor="#fff2c7" /><stop offset="0.65" stopColor="#c4b59a" /><stop offset="1" stopColor="#77634a" /></linearGradient></defs>
              {wireVisuals.flatMap(({ edge, ends }) => ends.map(end => <WireBareEnd key={`${wireKey(edge.from, edge.to)}-${end.terminal}`} end={end} gradient={wireMetalId} />))}
              {previewEnd && <WireBareEnd end={previewEnd} gradient={wireMetalId} />}

              {/*
                器材本体拖动命中区。
                必须画在器材**之后**：器材自身的零件（表盘刻度、标签文字等）会参与命中测试，
                先画的话指针会被这些零件截走，表现为「器材拖不动」。
                同时它必须画在接线柱与折点手柄**之前**：接线柱要保持最上层，
                否则「想接线」会变成「把器材拖走」。
              */}
              {LAB_COMPONENT_IDS.filter((id) => (id !== 'A1' || !state.meterRemoved) && !removedComponents.includes(id)).map((id) => (
                <ComponentDragHandle
                  key={`drag-${id}`}
                  id={id}
                  layout={layout}
                  drag={labDrag.componentHandlers(id)}
                  onActivate={id === 'S1' || id === 'S2' ? () => setSelectedSwitch(id) : id === 'A1' ? () => setMeterSelected(true) : id === 'E1' ? () => setBatterySelected(true) : id === 'L1' ? () => setLampSelected(true) : undefined}
                />
              ))}

              {state.bulbDetached && !lampSettings.removed && <DetachedLampBulb {...detachedPoint} damaged={state.lampDamaged} onAttach={() => dispatch({ type: 'attachBulb' }, 'attach-bulb')} drag={{
                onPointerDown: event => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  const point = scenePositionFor(event)
                  if (!point) return
                  bulbGesture.current = { pointerId: event.pointerId, offset: { x: detachedPoint.x - point.x, y: detachedPoint.y - point.y } }
                  event.currentTarget.setPointerCapture(event.pointerId)
                },
                onPointerMove: event => {
                  const gesture = bulbGesture.current
                  if (!gesture || gesture.pointerId !== event.pointerId) return
                  const point = scenePositionFor(event)
                  if (!point) return
                  setBulbPosition({ x: point.x + gesture.offset.x, y: point.y + gesture.offset.y }); setTouched(true)
                },
                onPointerUp: event => { bulbGesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) },
                onPointerCancel: () => { bulbGesture.current = null },
              }} />}
              {/* 接线热区在本体拖动热区之上：可见导线不会被透明大框截走。 */}
              {wireVisuals.map(({ edge, path }) => (
                <g key={`select-${edge.from}-${edge.to}`} data-wire-selectable data-wire-hit={wireKey(edge.from, edge.to)}
                  role="button" tabIndex={0} aria-pressed={selectedWire === wireKey(edge.from, edge.to)} aria-label={`选择${terminalLabel(edge.from)}到${terminalLabel(edge.to)}的导线`}
                  onClick={() => setSelectedWire(wireKey(edge.from, edge.to))}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedWire(wireKey(edge.from, edge.to)) } }}
                  onDoubleClick={() => { setSelectedWire(null); dispatch({ type: 'disconnect', payload: edge }, 'disconnect-wire') }}
                >
                  <path d={path} fill="none" stroke="transparent" strokeWidth="16" pointerEvents="stroke" className="cursor-pointer"><title>点击选中 · Delete删除 · 双击拆线</title></path>
                </g>
              ))}

              {/* 导线折点手柄：拖动即弯折（像真导线一样） */}
              {visibleEdges.map((edge) => (
                <WireBendHandle
                  key={`bend-${edge.from}-${edge.to}`}
                  from={edge.from}
                  to={edge.to}
                  layout={layout}
                  active={labDrag.dragging?.kind === 'wire' && labDrag.dragging.from === edge.from && labDrag.dragging.to === edge.to}
                  drag={labDrag.wireHandlers(edge.from, edge.to)}
                  onSelect={() => setSelectedWire(wireKey(edge.from, edge.to))}
                  onDisconnect={() => { setSelectedWire(null); dispatch({ type: 'disconnect', payload: edge }, 'disconnect-wire') }}
                />
              ))}

              {/* 闸刀覆盖穿过它的导线热区；接线帽随后绘制，仍可独立拖动接线。 */}
              {!s1Settings.removed && <SwitchHandle id="S1" x={s1Point.x} y={s1Point.y} closed={s1Closed} reversed={s1Settings.reversed} angle={s1Settings.angle} onToggle={() => dispatch({ type: 'setSwitch', payload: s1Closed ? 'open' : 'closed' }, 'toggle-main-switch')} />}
              {!s2Settings.removed && <SwitchHandle id="S2" x={s2Point.x} y={s2Point.y} closed={s2Closed} reversed={s2Settings.reversed} angle={s2Settings.angle} onToggle={() => dispatch({ type: 'setBypassSwitch', payload: s2Closed ? 'open' : 'closed' }, 'toggle-bypass-switch')} />}

              {/* 接线柱（可拖拽拉线）：坐标由布局推导，跟随器材移动 */}
              {TERMINAL_DRAW_ORDER.filter((id) => (!state.meterRemoved || !id.startsWith('ammeter-')) && (!removedComponents.includes(TERMINAL_OWNER[id]) || terminalHasWire(state, id))).map((id) => (
                <CompetitorTerminal
                  key={id}
                  id={id}
                  state={state}
                  point={removedComponents.includes(TERMINAL_OWNER[id]) ? wireContactPoints.get(id) ?? terminalPosition(layout, id) : terminalPosition(layout, id)}
                  selected={selectedTerminal === id}
                  angle={layout.componentAngles?.[TERMINAL_OWNER[id]]}
                  loose={removedComponents.includes(TERMINAL_OWNER[id])}
                  drag={{
                    onPointerDown: (event) => {
                      event.stopPropagation()
                      setSelectedTerminal(id)
                      const attached = state.edges.filter((edge) => edge.from === id || edge.to === id)
                      const chosen = attached.find((edge) => wireKey(edge.from, edge.to) === selectedWire)
                      if (!event.shiftKey && attached.length > 1 && !chosen) {
                        setWireHint('此接线柱有多根导线，请先点选要调整的导线；Shift＋拖动可新增导线')
                        return
                      }
                      pointerDrag.onPointerDown(pointerEvent(event), { terminal: id, edge: event.shiftKey ? undefined : chosen ?? attached[0] })
                    },
                    onPointerMove: (event) => pointerDrag.onPointerMove(pointerEvent(event)),
                    onPointerUp: (event) => pointerDrag.onPointerUp(pointerEvent(event)),
                    onPointerCancel: (event) => pointerDrag.onPointerCancel(pointerEvent(event)),
                  }}
                />
              ))}
            </>
          )}

          {showSchematic && <AmmeterSchematic state={state} reading={reading} layout={layout} selectedWire={selectedWire} onSelectWire={setSelectedWire} />}

        </svg>
      </InfiniteCanvas>

      {lampSelected && !lampSettings.removed && <LampInspector settings={lampSettings} detached={Boolean(state.bulbDetached)} point={{ x: Math.max(8, Math.min(stageSize.width - 48, cameraState.x + lampBounds.right * cameraState.scale + 8)), y: Math.max(74, Math.min(stageSize.height - 300, cameraState.y + lampBounds.top * cameraState.scale)) }} viewport={stageSize} onChange={settings => dispatch({ type: 'setLampSettings', payload: settings }, 'lamp-settings')} onDetach={() => { setBulbPosition({ x: lampPoint.x, y: lampPoint.y - 30 }); dispatch({ type: 'detachBulb' }, 'detach-bulb') }} onFlip={() => dispatch({ type: 'flipLamp' }, 'flip-lamp')} onDelete={() => { dispatch({ type: 'deleteLamp' }, 'delete-lamp'); setLampSelected(false) }} />}
      {batterySelected && !batterySettings.removed && <BatteryInspector settings={batterySettings} point={{ x: Math.max(8, Math.min(stageSize.width - 48, cameraState.x + batteryBounds.right * cameraState.scale + 8)), y: Math.max(74, Math.min(stageSize.height - 260, cameraState.y + batteryBounds.top * cameraState.scale)) }} viewport={stageSize} onChange={settings => dispatch({ type: 'setBatterySettings', payload: settings }, 'battery-settings')} onFlip={() => dispatch({ type: 'flipBattery' }, 'flip-battery')} onDelete={() => { dispatch({ type: 'deleteBattery' }, 'delete-battery'); setBatterySelected(false) }} />}
      {selectedSwitch && selectedSwitchSettings && selectedSwitchBounds && !selectedSwitchSettings.removed && <SwitchInspector key={selectedSwitch} id={selectedSwitch} settings={selectedSwitchSettings} point={{ x: Math.max(8, Math.min(stageSize.width - 48, cameraState.x + selectedSwitchBounds.right * cameraState.scale + 8)), y: Math.max(74, Math.min(stageSize.height - 260, cameraState.y + selectedSwitchBounds.top * cameraState.scale)) }} viewport={stageSize} onChange={settings => dispatch({ type: 'setSwitchSettings', payload: { id: selectedSwitch, settings } }, 'switch-settings')} onFlip={() => dispatch({ type: 'flipSwitch', payload: selectedSwitch }, 'flip-switch')} onDelete={() => { dispatch({ type: 'deleteSwitch', payload: selectedSwitch }, 'delete-switch'); setSelectedSwitch(null) }} />}
      {meterSelected && !state.meterRemoved && <MeterInspector settings={meterSettings} point={{ x: Math.max(8, Math.min(stageSize.width - 48, cameraState.x + (ammeterPoint.x + 91) * cameraState.scale)), y: Math.max(74, Math.min(stageSize.height - 152, cameraState.y + (ammeterPoint.y - 112) * cameraState.scale)) }} width={stageSize.width} onChange={(settings) => dispatch({ type: 'setMeterSettings', payload: settings }, 'meter-settings')} onModel={() => setModelOpen(true)} onDelete={() => { dispatch({ type: 'deleteMeter' }, 'delete-meter'); setMeterSelected(false); setModelOpen(false) }} />}
      {modelOpen && !state.meterRemoved && <Suspense fallback={<p className="absolute left-4 top-20 z-40 text-white">正在加载3D模型…</p>}><AmmeterModel3D onClose={() => setModelOpen(false)} /></Suspense>}
      {meterSettings.showGraph && !state.meterRemoved && <MeterCurrentGraph current={reading} decimals={meterSettings.decimals} point={{ x: cameraState.x + (ammeterPoint.x + (PART_GEOMETRY.ammeter.width - PART_GEOMETRY.ammeter.anchorX) * PART_GEOMETRY.ammeter.scale) * cameraState.scale + (meterSelected ? 60 : 16), y: cameraState.y + (ammeterPoint.y - 112) * cameraState.scale }} meterLeft={cameraState.x + (ammeterPoint.x - PART_GEOMETRY.ammeter.anchorX * PART_GEOMETRY.ammeter.scale) * cameraState.scale} viewport={stageSize} onClose={() => dispatch({ type: 'setMeterSettings', payload: { ...meterSettings, showGraph: false } }, 'meter-settings')} />}

      <ImmersiveToolbarSlot>
        <ImmersiveToolbarButton label="清空接线" showLabel onClick={() => dispatch({ type: 'resetTrial' }, 'clear-wiring')}>
          <Unplug className="size-4" aria-hidden="true" />
        </ImmersiveToolbarButton>
        <ImmersiveToolbarButton
          label={showSchematic ? '回到实物图' : '转电路图'}
          active={showSchematic}
          showLabel
          onClick={() => setShowSchematic((current) => !current)}
        ><Grid3x3 className="size-4" aria-hidden="true" /></ImmersiveToolbarButton>
        <ImmersiveToolbarButton label="复位器材摆位" showLabel onClick={() => {
          const next = { ...initialLayoutFor(stageSize.width, stageSize.height), componentAngles: layout.componentAngles }
          setTouched(false)
          setLayout(next)
          focusLayout(next)
        }}><RotateCcw className="size-4" aria-hidden="true" /></ImmersiveToolbarButton>
      </ImmersiveToolbarSlot>

      {/*
        器材被拖出可见范围时的「全部收回」入口。
        全屏无限画布下器材几乎不可能被拖丢，但万一学生把器材甩到视野之外，
        这里给一个一键收回，避免出现"器材找不到了"。
      */}
      {strayComponents.length > 0 && (
        <button
          type="button"
          data-canvas-pan-block
          aria-label="把拖出屏幕的器材收回可见范围"
          onClick={() => focusLayout(layout)}
          className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-1.5 text-[12px] font-semibold text-amber-200 backdrop-blur hover:bg-amber-500/25"
        >
          有 {strayComponents.length} 件器材在屏幕外 · 点此全部收回
        </button>
      )}

      {/* 右侧协作入口 */}
      <div className="absolute right-3 top-3 z-30 flex items-start gap-3">
        <CanvasPill label="实验报告" onClick={onOpenReport}><FileText className="size-4" aria-hidden="true" /></CanvasPill>
        <CanvasPill label="推送学生端打开" onClick={() => setWireHint('敬请期待')}><MonitorUp className="size-4" aria-hidden="true" /></CanvasPill>
      </div>

      {wireHint && <p role="status" className={`absolute z-30 rounded bg-[#22262c]/95 px-3 py-2 text-xs text-amber-200 ${wireHint === '敬请期待' ? 'right-3 top-16' : 'bottom-20 left-1/2 -translate-x-1/2'}`}>{wireHint}</p>}

      {/* 过载提示 */}
      {state.overRangeWarning !== null && (
        <div role="alert" className="absolute left-1/2 top-20 z-30 w-[min(560px,86%)] -translate-x-1/2 rounded-[8px] border border-[#c0392b] bg-[#3a2020] px-4 py-3 text-sm text-[#f0b0a8] shadow-lg">
          <span className="mr-2 font-bold">实验现象</span>
          {state.overRangeWarning}
        </div>
      )}
    </div>
  )
}

function CanvasPill({ label, onClick, children }: { label: string; onClick?(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium text-[#9aa4b2] transition hover:text-white"
    >
      <span>{children}</span>
      <span>{label}</span>
    </button>
  )
}

function WireCurrentFlow({ path, points, direction }: { path: string; points: readonly Position[]; direction: 1 | -1 }) {
  // 用导线控制折线估计长度，让短线与长线上的箭头保持相近间距及速度。
  const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0)
  const count = Math.max(2, Math.ceil(length / 25))
  const duration = Math.max(0.5, length / 80)
  return <g data-wire-flow data-direction={direction} aria-hidden="true" fill="none" stroke="#fff" strokeWidth="1.6" pointerEvents="none">
    {Array.from({ length: count }, (_, i) => <path key={i} d="M-2.5 -2.5 L0 0 L-2.5 2.5">
      <animateMotion path={path} dur={`${duration}s`} begin={`${-i * duration / count}s`} repeatCount="indefinite" rotate={direction === 1 ? 'auto' : 'auto-reverse'} keyPoints={direction === 1 ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear" />
    </path>)}
  </g>
}

export function AmmeterScene(props: PhysicsLabSceneProps<AmmeterLabState>) {
  const [reportOpen, setReportOpen] = useState(false)
  return (
    <div className="relative h-full w-full min-h-0 select-none">
      <CompetitorSceneCanvas
        {...props}
        onOpenReport={props.onOpenReport ?? (() => setReportOpen(true))}
      />
      {!props.onOpenReport && <ReportDrawer open={reportOpen} onClose={() => setReportOpen(false)} />}
    </div>
  )
}

/**
 * 实验详情页入口：沉浸式 + 无限画布。
 *
 * 高度使用 dvh（动态视口高度）而不是固定 640px —— 实验台占满整个屏幕，
 * 不再缩在页面中间一小块；移动端浏览器地址栏收起/展开也不会被裁切。
 */
export function AmmeterLab({ experiment }: { experiment: TextbookPhysicsExperiment }) {
  return (
    <div className="h-[100dvh] w-full">
      <PhysicsLabShell experiment={experiment} controller={practiceController} Scene={AmmeterScene} ReportView={ReportDrawer} showActionLabels showFooter={false} backTo="/physics" editableTitleStorageKey={`physics:lab-title:${experiment.id}`} />
    </div>
  )
}
