import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Settings, Trash2, X } from 'lucide-react'
import type { Position } from '../../runtime/types'
import type { SpringMeterSettings } from './meterSettings'

const field = 'h-7 border border-white/15 bg-[#151515] px-2 text-center text-sm text-white outline-none focus:border-[#2688ed]'
export default function SpringMeterInspector({ settings, point, viewport, disabled, onChange, onDelete, onMove, onOpen3D }: {
  settings: SpringMeterSettings; point: Position; viewport: { width: number; height: number }; disabled: boolean
  onChange(settings: SpringMeterSettings): void; onDelete(): void; onMove(dx: number, dy: number): void
  onOpen3D(): void
}) {
  const [open, setOpen] = useState(false)
  function change(patch: Partial<SpringMeterSettings>) { onChange({ ...settings, ...patch }) }
  const left = Math.max(8, Math.min(point.x + 44, viewport.width - 302))
  const top = Math.max(82, Math.min(point.y, viewport.height - 608))
  return <div data-canvas-pan-block data-spring-meter-ui>
    <div className="absolute z-30 flex w-10 flex-col rounded-xl bg-[#090d0e] py-1 text-[#d5d6d8]" style={{ left: Math.max(8, Math.min(point.x, viewport.width - 48)), top: Math.max(82, Math.min(point.y, viewport.height - 128)) }}>
      <button type="button" aria-label="打开弹簧测力计3D模型" onClick={onOpen3D} className="grid size-10 place-items-center text-base font-semibold text-[#ff8c00] hover:text-[#ffb450]">3D</button>
      <button type="button" aria-label="弹簧测力计设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-10 place-items-center hover:text-white"><Settings size={24} /></button>
      <button type="button" aria-label="删除弹簧测力计" disabled={disabled} onClick={onDelete} className="grid size-10 place-items-center hover:text-white disabled:opacity-40"><Trash2 size={23} /></button>
    </div>
    {open && <aside aria-label="弹簧测力计设置选项" className="absolute z-40 w-[294px] max-w-[calc(100%-16px)] overflow-y-auto rounded-xl bg-[#181818] px-5 py-4 text-sm text-[#8c8c8c] shadow-xl" style={{ left, top, maxHeight: Math.max(160, viewport.height - top - 12) }}>
      <header className="mb-6 flex items-center justify-between text-base font-semibold text-white"><h2>弹簧测力计</h2><button type="button" aria-label="关闭测力计设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-50">
        <div><label className="flex items-center justify-between">移动速度<input aria-label="移动速度" type="number" min="-100" max="100" step="1" value={settings.speed} onChange={e => { const speed = e.currentTarget.valueAsNumber; if (Number.isFinite(speed)) change({ speed: Math.max(-100, Math.min(100, speed)) }) }} className={`${field} w-[105px] rounded`} /></label><input aria-label="移动速度滑块" type="range" min="-100" max="100" value={settings.speed} onChange={e => change({ speed: Number(e.currentTarget.value) })} className="archimedes-speed mt-3 w-full" style={{ background: `linear-gradient(to right, #2688ed ${(settings.speed + 100) / 2}%, #575c5e ${(settings.speed + 100) / 2}%)` }} /></div>
        <label className="flex items-center justify-between">量程<select aria-label="测力计量程" className={`${field} w-[122px]`} value={settings.range} onChange={e => change({ range: Number(e.currentTarget.value) as SpringMeterSettings['range'] })}>{[1, 5, 10, 20].map(n => <option key={n} value={n}>{n}N</option>)}</select></label>
        <Toggle label="开启轨迹" value={settings.showTrace} onChange={() => change({ showTrace: !settings.showTrace })} />
        <label className="flex items-center justify-between">锁定模式<select aria-label="锁定模式" className={`${field} w-[122px]`} value={settings.lockMode} onChange={e => change({ lockMode: e.currentTarget.value as SpringMeterSettings['lockMode'] })}><option value="ring">锁定吊环</option><option value="hook">锁定挂钩</option><option value="none">都不锁定</option></select></label>
        <Toggle label="放大镜" value={settings.magnifier} onChange={() => change({ magnifier: !settings.magnifier })} />
        <Toggle label="移动按钮" value={settings.movementButtons} onChange={() => change({ movementButtons: !settings.movementButtons })} />
        <Segments label="显示类型" values={[['force', '力'], ['mass', '质量']]} value={settings.display} onChange={value => change({ display: value as SpringMeterSettings['display'] })} />
        <Toggle label="考虑自重" value={settings.ownWeight} onChange={() => change({ ownWeight: !settings.ownWeight })} />
        <Toggle label="考虑弹性限度" value={settings.elasticLimit} onChange={() => change({ elasticLimit: !settings.elasticLimit })} />
        <label className="flex items-center justify-between">锁定方向<select aria-label="锁定方向" className={`${field} w-[122px]`} value={settings.direction} onChange={e => change({ direction: e.currentTarget.value as SpringMeterSettings['direction'] })}>{[['none', '无'], ['left', '水平向左'], ['right', '水平向右'], ['up', '竖直向上'], ['down', '竖直向下']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Segments label="保留小数位" values={[['1', '1'], ['2', '2']]} value={String(settings.decimals)} onChange={value => change({ decimals: Number(value) as 1 | 2 })} />
      </fieldset>
    </aside>}
    {settings.movementButtons && <div aria-label="测力计移动按钮" className="absolute z-30 grid grid-cols-3 gap-1 rounded-lg bg-[#181818] p-2" style={{ left: Math.max(8, Math.min(point.x - 116, viewport.width - 112)), top: Math.max(170, Math.min(point.y + 94, viewport.height - 90)) }}>
      <span /><MoveButton label="上移测力计" disabled={disabled} onClick={() => onMove(0, -5)}><ArrowUp size={16} /></MoveButton><span />
      <MoveButton label="左移测力计" disabled={disabled} onClick={() => onMove(-5, 0)}><ArrowLeft size={16} /></MoveButton><MoveButton label="下移测力计" disabled={disabled} onClick={() => onMove(0, 5)}><ArrowDown size={16} /></MoveButton><MoveButton label="右移测力计" disabled={disabled} onClick={() => onMove(5, 0)}><ArrowRight size={16} /></MoveButton>
    </div>}
  </div>
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(): void }) {
  return <div className="flex items-center justify-between"><span>{label}</span><button type="button" role="switch" aria-label={label} aria-checked={value} onClick={onChange} className={`h-4 w-10 rounded-full p-0.5 ${value ? 'bg-[#2688ed]' : 'bg-[#383838]'}`}><span className={`block size-3 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : ''}`} /></button></div>
}
function Segments({ label, values, value, onChange }: { label: string; values: string[][]; value: string; onChange(value: string): void }) {
  return <div className="flex items-center justify-between"><span>{label}</span><div className="flex overflow-hidden rounded-lg bg-[#383838]">{values.map(([key, text]) => <button type="button" key={key} aria-label={`${label}${text}`} aria-pressed={key === value} onClick={() => onChange(key)} className={`h-6 w-[60px] text-xs ${key === value ? 'bg-[#2688ed] text-white' : ''}`}>{text}</button>)}</div></div>
}
function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40">{children}</button>
}
