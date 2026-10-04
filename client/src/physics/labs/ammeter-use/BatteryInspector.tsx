import { useState } from 'react'
import { ArrowLeftRight, Settings, Trash2, X } from 'lucide-react'
import { BATTERY_RESISTANCES, BATTERY_VOLTAGES, DEFAULT_BATTERY_SETTINGS, saveBatteryDefaults, type BatterySettings } from './batterySettings'

export default function BatteryInspector({ settings, point, viewport, onChange, onFlip, onDelete }: {
  settings: BatterySettings; point: { x: number; y: number }; viewport: { width: number; height: number }
  onChange(settings: BatterySettings): void; onFlip(): void; onDelete(): void
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const field = 'h-7 rounded border border-white/15 bg-[#111315] px-2 text-center text-sm text-white outline-none focus:border-[#1689ff]'
  function change(patch: Partial<BatterySettings>) { onChange({ ...settings, ...patch }); setMessage('') }
  return <div data-battery-ui data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col items-center gap-2 rounded-xl bg-[#090d0e] py-3 text-[#d5d6d8]" style={{ left: point.x, top: point.y }}>
      <button type="button" aria-label="切换电池组方向" title="切换方向" onClick={onFlip} className="grid size-8 place-items-center hover:text-white"><ArrowLeftRight size={23} /></button>
      <button type="button" aria-label="电池组设置" title="设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-8 place-items-center hover:text-white"><Settings size={23} /></button>
      <button type="button" aria-label="删除电池组" title="删除" onClick={onDelete} className="grid size-8 place-items-center hover:text-white"><Trash2 size={22} /></button>
    </div>
    {open && <aside aria-label="电池组设置选项" className="absolute z-40 w-[270px] max-w-[calc(100%-24px)] space-y-5 rounded-xl bg-[#151718] p-[18px] text-sm text-white shadow-xl" style={{ left: Math.max(12, Math.min(point.x + 50, viewport.width - 282)), top: Math.max(74, Math.min(point.y - 24, viewport.height - 470)), maxHeight: Math.max(0, viewport.height - 186), overflowY: 'auto' }}>
      <header className="flex items-center justify-between"><h2>电池组</h2><button aria-label="关闭电池组设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="flex items-center justify-between gap-4"><span className="text-[#8c8f93]">名称</span><div className="flex gap-2"><input aria-label="电池组名称字母" maxLength={8} className={`${field} w-[60px]`} value={settings.namePrefix} onInput={event => change({ namePrefix: event.currentTarget.value })} /><input aria-label="电池组名称编号" maxLength={8} className={`${field} w-[60px]`} value={settings.nameNumber} onInput={event => change({ nameNumber: event.currentTarget.value })} /></div></div>
      <label className="flex items-center justify-between text-[#8c8f93]">内阻<select aria-label="电池组内阻" className={`${field} w-[115px]`} value={settings.resistance} onChange={event => change({ resistance: Number(event.currentTarget.value) })}>{BATTERY_RESISTANCES.map(r => <option key={r} value={r}>{r}Ω</option>)}</select></label>
      <div><div className="mb-2 text-[#8c8f93]">电压</div><div className="flex justify-between gap-2">{BATTERY_VOLTAGES.map((voltage, index) => <button key={voltage} type="button" aria-label={`电池组电压${voltage}V`} aria-pressed={settings.voltage === voltage} onClick={() => change({ voltage })} className="flex flex-col items-center gap-2 text-[#8c8f93]">
        <span className={`grid size-12 place-items-center rounded-full ${settings.voltage === voltage ? 'bg-[#238cf3] text-white' : 'bg-[#454749] text-[#9b9d9f]'}`}><svg width="32" height="30" viewBox="0 0 32 30" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{Array.from({ length: index + 1 }, (_, cell) => { const twoColumns = index === 3; const x = twoColumns ? 1 + cell % 2 * 16 : 6; const y = twoColumns ? 6 + Math.floor(cell / 2) * 12 : 15 - index * 5 + cell * 10; return <g key={cell}><rect x={x} y={y - 3} width={twoColumns ? 12 : 18} height={6} rx={1} /><path d={`M${x + (twoColumns ? 12 : 18)} ${y - 1} v2`} /></g> })}</svg></span><span>{voltage}V</span>
      </button>)}</div></div>
      <label className="flex items-center justify-between text-[#8c8f93]">旋转角度<input aria-label="电池组旋转角度" type="number" step="1" className={`${field} w-[115px]`} value={settings.angle} onInput={event => { const angle = event.currentTarget.valueAsNumber; if (Number.isFinite(angle)) change({ angle }) }} /></label>
      <div className="flex justify-between gap-4"><button type="button" aria-label="电池组作为默认" className="h-7 flex-1 rounded bg-[#343638] text-[#c6c8ca]" onClick={() => setMessage(saveBatteryDefaults(settings) ? '已保存为本机默认设置' : '当前浏览器无法保存默认设置')}>作为默认</button><button type="button" aria-label="电池组使用初始值" className="h-7 flex-1 rounded bg-[#343638] text-[#c6c8ca]" onClick={() => { onChange({ ...DEFAULT_BATTERY_SETTINGS }); setMessage('已恢复实验初始设置') }}>使用初始值</button></div>
      {message && <p role="status" className="text-xs text-[#aab6c6]">{message}</p>}
    </aside>}
  </div>
}
