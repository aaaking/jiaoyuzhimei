import { useState } from 'react'
import { Settings, Trash2, X } from 'lucide-react'
import type { Position } from '../../runtime/types'
import { OBJECT_MATERIALS, type ObjectSettings } from './objectSettings'

export default function ObjectInspector({ settings, point, viewport, disabled, onChange, onDelete }: {
  settings: ObjectSettings; point: Position; viewport: { width: number; height: number }; disabled: boolean
  onChange(settings: ObjectSettings): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const top = Math.max(82, Math.min(point.y, viewport.height - 272))
  function toggle(key: 'showScale' | 'sway' | 'wetting') { onChange({ ...settings, [key]: !settings[key] }) }
  return <div data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col rounded-xl bg-[#090d0e] py-1 text-[#d5d6d8]" style={{ left: Math.max(8, Math.min(point.x, viewport.width - 48)), top }}>
      <button type="button" aria-label="金属块设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-10 place-items-center hover:text-white"><Settings size={24} /></button>
      <button type="button" aria-label="删除金属块" disabled={disabled} onClick={onDelete} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><Trash2 size={23} /></button>
    </div>
    {open && <aside aria-label="金属块设置选项" className="absolute z-40 w-[294px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-[#181818] px-5 py-4 text-sm text-[#8c8c8c] shadow-xl" style={{ left: Math.max(8, Math.min(point.x + 44, viewport.width - 302)), top, maxHeight: Math.max(160, viewport.height - top - 12) }}>
      <header className="mb-6 flex items-center justify-between text-base font-semibold text-white"><h2>金属块</h2><button type="button" aria-label="关闭金属块设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <fieldset disabled={disabled} className="space-y-6 disabled:opacity-50">
        <label className="flex items-center justify-between">类型<select aria-label="物块类型" value={settings.material} onChange={event => onChange({ ...settings, material: event.currentTarget.value as ObjectSettings['material'] })} className="h-7 w-[122px] border border-white/15 bg-[#151515] px-2 text-center text-sm text-white outline-none focus:border-[#2688ed]">{Object.entries(OBJECT_MATERIALS).map(([key, material]) => <option key={key} value={key}>{material.label}</option>)}</select></label>
        {([['showScale', '刻度线', '物块刻度线'], ['sway', '允许晃动', '允许晃动'], ['wetting', '考虑沾水对水量影响', '考虑沾水对水量影响']] as const).map(([key, label, ariaLabel]) => <div key={key} className="flex items-center justify-between"><span>{label}</span><button type="button" role="switch" aria-label={ariaLabel} aria-checked={settings[key]} onClick={() => toggle(key)} className={`h-4 w-10 rounded-full p-0.5 ${settings[key] ? 'bg-[#2688ed]' : 'bg-[#383838]'}`}><span className={`block size-3 rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-6' : ''}`} /></button></div>)}
      </fieldset>
    </aside>}
  </div>
}
