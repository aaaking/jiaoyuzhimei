import { useState } from 'react'
import { ArrowLeftRight, Settings, Trash2, X } from 'lucide-react'
import type { SwitchId, SwitchSettings } from './switchSettings'

export default function SwitchInspector({ id, settings, point, viewport, onChange, onFlip, onDelete }: {
  id: SwitchId; settings: SwitchSettings; point: { x: number; y: number }; viewport: { width: number; height: number }
  onChange(settings: SwitchSettings): void; onFlip(): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const field = 'h-7 rounded border border-white/15 bg-[#111315] px-2 text-center text-sm text-white outline-none focus:border-[#1689ff]'
  function change(patch: Partial<SwitchSettings>) { onChange({ ...settings, ...patch }) }
  return <div data-switch-ui data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col items-center gap-2 rounded-xl bg-[#090d0e] py-3 text-[#d5d6d8]" style={{ left: point.x, top: point.y }}>
      <button type="button" aria-label={`切换${id}开关方向`} title="切换方向" onClick={onFlip} className="grid size-8 place-items-center hover:text-white"><ArrowLeftRight size={23} /></button>
      <button type="button" aria-label={`${id}开关设置`} title="设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-8 place-items-center hover:text-white"><Settings size={23} /></button>
      <button type="button" aria-label={`删除${id}开关`} title="删除" onClick={onDelete} className="grid size-8 place-items-center hover:text-white"><Trash2 size={22} /></button>
    </div>
    {open && <aside aria-label={`${id}开关设置选项`} className="absolute z-40 w-[270px] max-w-[calc(100%-24px)] space-y-5 rounded-xl bg-[#151718] p-[18px] text-sm text-white shadow-xl" style={{ left: Math.max(12, Math.min(point.x + 50, viewport.width - 282)), top: Math.max(74, Math.min(point.y - 24, viewport.height - 320)), maxHeight: Math.max(0, viewport.height - 186), overflowY: 'auto' }}>
      <header className="flex items-center justify-between"><h2>开关</h2><button aria-label="关闭开关设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="flex items-center justify-between gap-4"><span className="text-[#8c8f93]">名称</span><div className="flex gap-2"><input aria-label="开关名称字母" maxLength={8} className={`${field} w-[60px]`} value={settings.namePrefix} onInput={(event) => change({ namePrefix: event.currentTarget.value })} /><input aria-label="开关名称编号" maxLength={8} className={`${field} w-[60px]`} value={settings.nameNumber} onInput={(event) => change({ nameNumber: event.currentTarget.value })} /></div></div>
      <div className="flex items-center justify-between"><span className="text-[#8c8f93]">断路设置</span><button type="button" aria-label="开关断路设置" aria-pressed={settings.broken} onClick={() => change({ broken: !settings.broken })} className={`h-7 w-[100px] rounded ${settings.broken ? 'bg-[#238cf3] text-white' : 'bg-[#343638] text-[#c6c8ca]'}`}>断路</button></div>
      <label className="flex items-center justify-between text-[#8c8f93]">旋转角度<input aria-label="开关旋转角度" type="number" step="1" className={`${field} w-[115px]`} value={settings.angle} onInput={(event) => { const angle = event.currentTarget.valueAsNumber; if (Number.isFinite(angle)) change({ angle }) }} /></label>
    </aside>}
  </div>
}
