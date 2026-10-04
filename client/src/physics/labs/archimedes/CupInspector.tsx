import { useState } from 'react'
import { RotateCcw, Settings, Trash2, X } from 'lucide-react'
import type { Position } from '../../runtime/types'

export default function CupInspector({ name, tether, point, viewport, disabled, onName, onTether, onReset, onDelete }: {
  name: string; tether: boolean; point: Position; viewport: { width: number; height: number }; disabled: boolean
  onName(name: string): void; onTether(tether: boolean): void; onReset(): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const top = Math.max(82, Math.min(point.y, viewport.height - 202))
  return <div data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col rounded-xl bg-[#090d0e] py-1 text-[#d5d6d8]" style={{ left: Math.max(8, Math.min(point.x, viewport.width - 48)), top }}>
      <button type="button" aria-label="恢复溢水杯默认水位" title="恢复默认水位" disabled={disabled} onClick={onReset} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><RotateCcw size={24} /></button>
      <button type="button" aria-label="溢水杯设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-10 place-items-center hover:text-white"><Settings size={24} /></button>
      <button type="button" aria-label="删除溢水杯" disabled={disabled} onClick={onDelete} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><Trash2 size={23} /></button>
    </div>
    {open && <aside aria-label="溢水杯设置选项" className="absolute z-40 w-[294px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-[#181818] px-5 py-4 text-sm text-[#8c8c8c] shadow-xl" style={{ left: Math.max(8, Math.min(point.x + 44, viewport.width - 302)), top: top + 40, maxHeight: Math.max(160, viewport.height - top - 52) }}>
      <header className="mb-6 flex items-center justify-between text-base font-semibold text-white"><h2>溢水杯</h2><button type="button" aria-label="关闭溢水杯设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <fieldset disabled={disabled} className="space-y-8 disabled:opacity-50">
        <label className="flex items-center justify-between gap-4"><span>名称</span><input key={name} aria-label="溢水杯名称" defaultValue={name} maxLength={40} onBlur={event => { const next = event.currentTarget.value.trim(); if (next && next !== name) onName(next); else event.currentTarget.value = name }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} className="h-7 w-[122px] rounded border border-[#383838] bg-[#141414] px-2 text-center text-xs text-white outline-none focus:border-[#2688ed]" /></label>
        <div className="flex items-center justify-between gap-4"><span>底部用绳子连接物体</span><button type="button" role="switch" aria-label="底部用绳子连接物体" aria-checked={tether} onClick={() => onTether(!tether)} className={`h-4 w-10 shrink-0 rounded-full p-0.5 ${tether ? 'bg-[#2688ed]' : 'bg-[#383838]'}`}><span className={`block size-3 rounded-full bg-white transition-transform ${tether ? 'translate-x-6' : ''}`} /></button></div>
      </fieldset>
    </aside>}
  </div>
}
