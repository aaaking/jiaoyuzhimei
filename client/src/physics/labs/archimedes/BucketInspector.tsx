import { useState } from 'react'
import { Droplets, Settings, Trash2, X } from 'lucide-react'
import type { Position } from '../../runtime/types'

export default function BucketInspector({ locked, empty, pouring, point, viewport, disabled, onLock, onClear, onDelete }: {
  locked: boolean; empty: boolean; pouring: boolean; point: Position; viewport: { width: number; height: number }; disabled: boolean
  onLock(locked: boolean): void; onClear(): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const top = Math.max(82, Math.min(point.y, viewport.height - 192))
  return <div data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col rounded-xl bg-[#090d0e] py-1 text-[#d5d6d8]" style={{ left: Math.max(8, Math.min(point.x, viewport.width - 48)), top }}>
      <button type="button" aria-label="小桶设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-10 place-items-center hover:text-white"><Settings size={24} /></button>
      <button type="button" aria-label="倾倒清空小桶" title="清空" disabled={disabled || empty || pouring} onClick={onClear} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><Droplets size={23} /></button>
      <button type="button" aria-label="删除小桶" disabled={disabled} onClick={onDelete} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><Trash2 size={23} /></button>
    </div>
    {open && <aside aria-label="小桶设置选项" className="absolute z-40 w-[294px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-[#181818] px-5 py-4 text-sm text-[#8c8c8c] shadow-xl" style={{ left: Math.max(8, Math.min(point.x + 44, viewport.width - 302)), top, maxHeight: Math.max(160, viewport.height - top - 12) }}>
      <header className="mb-6 flex items-center justify-between text-base font-semibold text-white"><h2>小桶</h2><button type="button" aria-label="关闭小桶设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <fieldset disabled={disabled} className="space-y-8 disabled:opacity-50">
        <div className="flex items-center justify-between"><span>锁定</span><button type="button" role="switch" aria-label="锁定小桶" aria-checked={locked} onClick={() => onLock(!locked)} className={`h-4 w-10 rounded-full p-0.5 ${locked ? 'bg-[#2688ed]' : 'bg-[#383838]'}`}><span className={`block size-3 rounded-full bg-white transition-transform ${locked ? 'translate-x-6' : ''}`} /></button></div>
        <div className="flex justify-end"><button type="button" aria-label="清空小桶" disabled={empty || pouring} onClick={onClear} className="h-7 w-[100px] rounded bg-[#383838] text-xs text-[#c8c8c8] hover:bg-[#454545] disabled:opacity-50">清空</button></div>
      </fieldset>
    </aside>}
  </div>
}
