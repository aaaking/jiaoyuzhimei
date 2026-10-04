/**
 * 沉浸式实验外壳（实验详情页专用）。
 *
 * 与普通教学页的区别（对应需求）：
 *   · 实验占据整个屏幕（fixed 全视口 + 100dvh），不再缩在页面中间一小块
 *   · 实验详情页去掉四周的实验器材清单、实验步骤清单、主标题、副标题
 *   · 列表点进来直接全屏、沉浸式操作
 *
 * 数据表格、读数记录、实验报告、撤销/重做、完成实验等
 * 「操作型」能力仍然保留，但收敛为悬浮在画布之上的一层浮层，
 * 不占用画布空间。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, MessageSquare, Pencil, FileSpreadsheet, FileText, Redo2, RotateCcw, Undo2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { LabFeedback } from '../types'
import LabFeedbackDialog from './LabFeedbackDialog'

export interface ImmersiveLabAction {
  id: string
  label: string
  icon: ReactNode
  onClick(): void
  disabled?: boolean
  active?: boolean
}

export interface ImmersiveLabStageProps {
  /** 实验名称：仅在悬浮标题条上显示，不占布局空间 */
  title: string
  /** 此实验的居中可编辑标题，使用独立本地存储键 */
  editableTitleStorageKey?: string
  showActionLabels?: boolean
  /** 返回列表的路由 */
  backTo: string
  /** 画布（无限画布 + 3D 场景） */
  children: ReactNode
  /** 当前读数 / 提示信息 */
  feedback?: LabFeedback | null
  autoDismissFeedback?: boolean
  /** 收起画布后要展示的浮层（数据表格、实验报告等） */
  panels?: readonly ImmersiveLabPanel[]
  openPanelId?: string | null
  onPanelChange?(panelId: string | null): void
  /** 悬浮工具条上的操作 */
  actions?: readonly ImmersiveLabAction[]
  /** 底部主操作区 */
  footer?: ReactNode
  /** 画布下层（数据表格等） */
  overlay?: ReactNode
}

export interface ImmersiveLabPanel {
  id: string
  label: string
  title?: string
  content: ReactNode
  onOpen?(): void
  active?: boolean
}

const ToolbarTarget = createContext<HTMLElement | null | undefined>(undefined)

/** 场景自己的操作与外壳操作共用顶部工具栏。 */
export function ImmersiveToolbarSlot({ children }: { children: ReactNode }) {
  const target = useContext(ToolbarTarget)
  if (target === undefined) return <>{children}</>
  return target === null ? null : createPortal(children, target)
}

/**
 * 通用悬浮操作按钮：撤销 / 重做 / 重置 / 数据表格 / 实验报告。
 * 这些能力原先挂在 PhysicsLabShell 的页面级工具栏上，
 * 在沉浸式模式里改为浮在画布上方，避免出现页面级布局。
 */
export function ImmersiveToolbarButton({
  label,
  onClick,
  disabled = false,
  active = false,
  showLabel = false,
  children,
}: {
  label: string
  onClick(): void
  disabled?: boolean
  active?: boolean
  showLabel?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-canvas-pan-block
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`group relative ${showLabel ? 'flex h-12 min-w-14 flex-col items-center justify-center gap-1 px-1 text-[11px]' : 'grid size-9 place-items-center'} rounded-[7px] transition ${
        active ? 'bg-white/15 text-white' : 'text-[#9aa4b2] hover:bg-white/10 hover:text-white'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
      {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}

export function UndoIcon() {
  return <Undo2 className="size-4" aria-hidden="true" />
}
export function RedoIcon() {
  return <Redo2 className="size-4" aria-hidden="true" />
}
export function ResetIcon() {
  return <RotateCcw className="size-4" aria-hidden="true" />
}
export function TableIcon() {
  return <FileSpreadsheet className="size-4" aria-hidden="true" />
}
export function ReportIcon() {
  return <FileText className="size-4" aria-hidden="true" />
}

function EditableLabHeader({ title, storageKey, toolbar }: { title: string; storageKey: string; toolbar: ReactNode }) {
  const [name, setName] = useState(() => {
    try { return window.localStorage.getItem(storageKey)?.trim() || title } catch { return title }
  })
  const [editing, setEditing] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  useEffect(() => {
    if (!feedbackSubmitted) return
    const timer = window.setTimeout(() => setFeedbackSubmitted(false), 5000)
    return () => window.clearTimeout(timer)
  }, [feedbackSubmitted])
  function save(value: string) {
    const next = value.trim() || name
    try {
      window.localStorage.setItem(storageKey, next)
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
    setName(next)
    setEditing(false)
  }
  return <>
    <div data-lab-toolbar className="pointer-events-auto flex max-w-[calc(50%-100px)] items-center gap-1 rounded-[9px] border border-white/10 bg-[#22262c]/85 p-1 backdrop-blur">
      {toolbar}
      <ImmersiveToolbarButton label="反馈" showLabel active={feedbackOpen} onClick={() => { setFeedbackSubmitted(false); setFeedbackOpen(true) }}><MessageSquare className="size-4" aria-hidden="true" /></ImmersiveToolbarButton>
    </div>
    <div
    data-editable-lab-title
    data-canvas-pan-block
    onDoubleClick={() => setEditing(true)}
    className="pointer-events-auto absolute left-1/2 top-3 flex h-9 max-w-[calc(100%-220px)] -translate-x-1/2 items-center gap-2 px-3 text-[13px] font-semibold text-[#e6ebf1] sm:max-w-[calc(100%-560px)]"
  >
    {editing ? <input
      aria-label="实验标题"
      autoFocus
      defaultValue={name}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => save(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
      }}
      className="min-w-0 w-64 bg-transparent text-center outline-none"
    /> : <>
      <span title="双击编辑实验标题" className="truncate">{name}</span>
      <button type="button" aria-label="编辑实验标题" title="编辑实验标题" onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-[#9aa4b2] hover:text-white">
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
    </>}
    {saveFailed && <span role="status" className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-xs text-amber-200">标题未能保存到本机，请重试</span>}
    </div>
    {feedbackOpen && <LabFeedbackDialog name={name} onClose={() => setFeedbackOpen(false)} onSubmit={() => { setFeedbackOpen(false); setFeedbackSubmitted(true) }} />}
    {feedbackSubmitted && <div role="status" className="pointer-events-none fixed bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-400/30 bg-[#243f38] px-4 py-2 text-sm text-emerald-200">提交成功（演示，未上传）</div>}
  </>
}

export default function ImmersiveLabStage({
  title,
  editableTitleStorageKey,
  showActionLabels = false,
  backTo,
  children,
  feedback = null,
  autoDismissFeedback = false,
  panels = [],
  openPanelId,
  onPanelChange,
  actions = [],
  footer = null,
  overlay = null,
}: ImmersiveLabStageProps) {
  const navigate = useNavigate()
  const [localOpenPanel, setLocalOpenPanel] = useState<string | null>(null)
  const openPanel = openPanelId === undefined ? localOpenPanel : openPanelId
  const setOpenPanel = onPanelChange ?? setLocalOpenPanel
  const [hintVisible, setHintVisible] = useState(true)
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null)
  const [expiredFeedback, setExpiredFeedback] = useState<LabFeedback | null>(null)

  useEffect(() => {
    if (!autoDismissFeedback || feedback === null || feedback.presentation === 'scene') return
    const timer = window.setTimeout(() => setExpiredFeedback(feedback), 5000)
    return () => window.clearTimeout(timer)
  }, [feedback, autoDismissFeedback])

  // 沉浸式：实验详情页占满整个视口，并锁定宿主页面滚动
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('immersive-lab')
    const timer = window.setTimeout(() => setHintVisible(false), 5200)
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.classList.remove('immersive-lab')
      window.clearTimeout(timer)
    }
  }, [])

  const activePanel = panels.find((panel) => panel.id === openPanel) ?? null
  const toolbar = <div ref={setToolbarElement} data-lab-toolbar={editableTitleStorageKey ? undefined : true} className={`flex items-center gap-1 ${editableTitleStorageKey ? 'min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0' : 'pointer-events-auto rounded-[9px] border border-white/10 bg-[#22262c]/85 p-1 backdrop-blur'}`}>
    {editableTitleStorageKey && <ImmersiveToolbarButton label="返回实验列表" showLabel={showActionLabels} onClick={() => navigate(backTo)}>
      <ArrowLeft className="size-4" aria-hidden="true" />
    </ImmersiveToolbarButton>}
    {actions.map((action) => (
      <ImmersiveToolbarButton
        key={action.id}
        label={action.label}
        onClick={action.onClick}
        disabled={action.disabled}
        active={action.active}
        showLabel={showActionLabels}
      >
        {action.icon}
      </ImmersiveToolbarButton>
    ))}
    {panels.map((panel) => (
      <ImmersiveToolbarButton
        key={panel.id}
        label={panel.label}
        showLabel={showActionLabels}
        active={panel.active ?? openPanel === panel.id}
        onClick={() => panel.onOpen ? panel.onOpen() : setOpenPanel(openPanel === panel.id ? null : panel.id)}
      >
        <TableIcon />
      </ImmersiveToolbarButton>
    ))}
  </div>

  return (
    <ToolbarTarget.Provider value={toolbarElement}>
    <div
      data-immersive-lab
      className="fixed inset-0 z-[60] flex select-none flex-col overflow-hidden bg-[#181b20] text-[#e6ebf1]"
      style={{ height: '100dvh' }}
    >
      {/* 沉浸式画布：占据整个屏幕 */}
      <div className="relative min-h-0 flex-1">
        {children}

        {/* 悬浮标题与操作工具栏 */}
        <div className={`pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start gap-3 p-3 ${editableTitleStorageKey ? 'justify-start' : 'justify-between'}`}>
          {editableTitleStorageKey ? <EditableLabHeader key={editableTitleStorageKey} title={title} storageKey={editableTitleStorageKey} toolbar={toolbar} /> : <>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              data-canvas-pan-block
              aria-label="返回实验列表"
              title="返回实验列表"
              onClick={() => navigate(backTo)}
              className="grid size-9 shrink-0 place-items-center rounded-[7px] border border-white/10 bg-[#22262c]/85 text-[#9aa4b2] backdrop-blur transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="inline-flex h-9 items-center rounded-[7px] border border-white/10 bg-[#22262c]/85 px-3 text-[13px] font-semibold text-[#e6ebf1] backdrop-blur">{title}</span>
          </div>
          {toolbar}
          </>}
        </div>

        {/* 浮层：数据表格 / 实验报告 / 会话提示 */}
        {activePanel !== null && (
          <aside
            data-canvas-pan-block
            data-selectable-content
            aria-label={activePanel.title ?? activePanel.label}
            className="absolute bottom-20 right-3 top-16 z-30 flex w-[min(420px,92vw)] flex-col overflow-hidden rounded-[12px] border border-white/10 bg-[#fbfaf7] text-[#242424] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-[#e2ddd3] px-4 py-3">
              <h2 className="text-sm font-bold">{activePanel.title ?? activePanel.label}</h2>
              <button
                type="button"
                aria-label="收起"
                onClick={() => setOpenPanel(null)}
                className="grid size-7 place-items-center rounded-[6px] text-[#6f6a62] hover:bg-[#f0ece4]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-4">{activePanel.content}</div>
          </aside>
        )}

        {overlay}

        {/* 读数提示：悬浮在画布底部，不占布局 */}
        {feedback !== null && (!autoDismissFeedback || feedback !== expiredFeedback) && feedback.presentation !== 'scene' && (
          <div className="pointer-events-none absolute bottom-[76px] left-1/2 z-20 -translate-x-1/2">
            <span
              role="status"
              className={`inline-flex max-w-[min(680px,88vw)] items-center rounded-full border px-4 py-1.5 text-[13px] font-semibold backdrop-blur ${
                feedback.outcome === 'accepted'
                  ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                  : 'border-amber-400/35 bg-amber-500/12 text-amber-200'
              }`}
            >
              {feedback.message}
            </span>
          </div>
        )}

        {hintVisible && (
          <div className="pointer-events-none absolute bottom-[76px] right-4 z-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#22262c]/80 px-3 py-1.5 text-[12px] text-[#9aa4b2] backdrop-blur">
              无限画布已开启：滚轮缩放 / 拖动平移
            </span>
          </div>
        )}
      </div>

      {footer !== null && (
        <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-[#22262c] px-3 py-2.5">
          {footer}
        </div>
      )}
    </div>
    </ToolbarTarget.Provider>
  )
}
