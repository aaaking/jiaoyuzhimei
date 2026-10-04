import { useState } from 'react'
import { ArrowLeftRight, MoveVertical, Settings, Trash2, X } from 'lucide-react'
import { DEFAULT_LAMP_SETTINGS, LAMP_POWERS, LAMP_VOLTAGES, saveLampDefaults, type LampSettings } from './lampSettings'

export default function LampInspector({ settings, detached, point, viewport, onChange, onDetach, onFlip, onDelete }: {
  settings: LampSettings; detached: boolean; point: { x: number; y: number }; viewport: { width: number; height: number }
  onChange(settings: LampSettings): void; onDetach(): void; onFlip(): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const field = 'h-7 rounded border border-white/15 bg-[#111315] px-2 text-center text-sm text-white outline-none focus:border-[#1689ff]'
  function change(patch: Partial<LampSettings>) { onChange({ ...settings, ...patch }); setMessage('') }
  return <div data-lamp-ui data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col items-center gap-2 rounded-xl bg-[#090d0e] py-3 text-[#d5d6d8]" style={{ left: point.x, top: point.y }}>
      {!detached && <><button type="button" aria-label="移除灯泡" title="移除灯泡" onClick={onDetach} className="grid size-8 place-items-center hover:text-white"><MoveVertical size={23} /></button><button type="button" aria-label="切换灯座方向" title="切换方向" onClick={onFlip} className="grid size-8 place-items-center hover:text-white"><ArrowLeftRight size={23} /></button></>}
      <button type="button" aria-label="灯泡设置" title="设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-8 place-items-center hover:text-white"><Settings size={23} /></button>
      <button type="button" aria-label="删除灯泡和灯座" title="删除" onClick={onDelete} className="grid size-8 place-items-center hover:text-white"><Trash2 size={22} /></button>
    </div>
    {open && <aside aria-label="灯泡设置选项" className="absolute z-40 w-[270px] max-w-[calc(100%-24px)] space-y-4 rounded-xl bg-[#151718] p-[18px] text-sm text-white shadow-xl" style={{ left: Math.max(12, Math.min(point.x + 50, viewport.width - 282)), top: Math.max(74, Math.min(point.y - 24, viewport.height - 540)), maxHeight: Math.max(0, viewport.height - 186), overflowY: 'auto' }}>
      <header className="flex items-center justify-between"><h2>标准灯泡</h2><button aria-label="关闭灯泡设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="flex items-center justify-between gap-4"><span className="text-[#8c8f93]">名称</span><div className="flex gap-2"><input aria-label="灯泡名称字母" maxLength={8} className={`${field} w-[60px]`} value={settings.namePrefix} onInput={event => change({ namePrefix: event.currentTarget.value })} /><input aria-label="灯泡名称编号" maxLength={8} className={`${field} w-[60px]`} value={settings.nameNumber} onInput={event => change({ nameNumber: event.currentTarget.value })} /></div></div>
      <label className="flex items-center justify-between text-[#8c8f93]">额定电压<select aria-label="灯泡额定电压" className={`${field} w-[115px]`} value={settings.ratedVoltage} onChange={event => change({ ratedVoltage: Number(event.currentTarget.value) })}>{LAMP_VOLTAGES.map(v => <option key={v} value={v}>{v}V</option>)}</select></label>
      <label className="flex items-center justify-between text-[#8c8f93]">烧坏电压<span className="relative"><input aria-label="灯泡烧坏电压" type="number" min="0.01" step="0.01" className={`${field} w-[115px] pr-6`} value={settings.burnVoltage} onInput={event => { const burnVoltage = event.currentTarget.valueAsNumber; if (Number.isFinite(burnVoltage) && burnVoltage > 0) change({ burnVoltage }) }} /><span className="pointer-events-none absolute right-2 top-1 text-white">V</span></span></label>
      <label className="flex items-center justify-between text-[#8c8f93]">额定功率<select aria-label="灯泡额定功率" className={`${field} w-[115px]`} value={settings.ratedPower} onChange={event => change({ ratedPower: Number(event.currentTarget.value) })}>{LAMP_POWERS.map(p => <option key={p} value={p}>{p}W</option>)}</select></label>
      <div className="flex items-center justify-between"><span className="text-[#8c8f93]">断路设置</span><button type="button" aria-label="灯泡断路设置" aria-pressed={settings.broken} onClick={() => change({ broken: !settings.broken })} className={`h-7 w-[100px] rounded ${settings.broken ? 'bg-[#1769b5]' : 'bg-[#343638]'} text-[#c6c8ca]`}>断路</button></div>
      <div className="flex items-center justify-between"><span className="text-[#8c8f93]">短路设置</span><button type="button" aria-label="灯泡短路设置" aria-pressed={settings.shorted} onClick={() => change({ shorted: !settings.shorted })} className={`h-7 w-[100px] rounded ${settings.shorted ? 'bg-[#1769b5]' : 'bg-[#343638]'} text-[#c6c8ca]`}>短路</button></div>
      <label className="flex items-center justify-between text-[#8c8f93]">旋转角度<input aria-label="灯座旋转角度" type="number" step="1" className={`${field} w-[115px]`} value={settings.angle} onInput={event => { const angle = event.currentTarget.valueAsNumber; if (Number.isFinite(angle)) change({ angle }) }} /></label>
      <div className="flex justify-between gap-4"><button type="button" aria-label="灯泡作为默认" className="h-7 flex-1 rounded bg-[#343638] text-[#c6c8ca]" onClick={() => setMessage(saveLampDefaults(settings) ? '已保存为本机默认设置' : '当前浏览器无法保存默认设置')}>作为默认</button><button type="button" aria-label="灯泡使用初始值" className="h-7 flex-1 rounded bg-[#343638] text-[#c6c8ca]" onClick={() => { onChange({ ...DEFAULT_LAMP_SETTINGS }); setMessage('已恢复实验初始设置') }}>使用初始值</button></div>
      {message && <p role="status" className="text-xs text-[#aab6c6]">{message}</p>}
    </aside>}
  </div>
}
