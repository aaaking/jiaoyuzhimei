import { useEffect, useRef, useState } from 'react'
import { Settings, Trash2, X } from 'lucide-react'
import { DEFAULT_METER_SETTINGS, saveMeterDefaults, type MeterSettings } from './meterSettings'

type Props = { settings: MeterSettings; point: { x: number; y: number }; width: number; onChange(settings: MeterSettings): void; onModel(): void; onDelete(): void }
const field = 'h-7 rounded border border-white/15 bg-[#111315] px-2 text-center text-sm text-white outline-none focus:border-[#1689ff]'

export default function MeterInspector({ settings, point, width, onChange, onModel, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  function change(patch: Partial<MeterSettings>) { onChange({ ...settings, ...patch }) }
  return <div data-meter-ui data-canvas-pan-block>
    <div className="absolute z-30 flex w-10 flex-col items-center gap-2 rounded-xl bg-[#090d0e] py-3 text-[#d5d6d8]" style={{ left: point.x, top: point.y }}>
      <button type="button" aria-label="查看电流表3D" title="3D模型" onClick={onModel} className="grid size-8 place-items-center hover:text-white"><span className="text-base font-semibold">3D</span></button>
      <button type="button" aria-label="电流表设置" title="设置" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-8 place-items-center hover:text-white"><Settings size={23} /></button>
      <button type="button" aria-label="删除电流表" title="删除" onClick={onDelete} className="grid size-8 place-items-center hover:text-white"><Trash2 size={22} /></button>
    </div>
    {open && <aside aria-label="标准电流表设置" className="absolute z-40 w-[270px] max-w-[calc(100%-24px)] space-y-5 rounded-xl bg-[#151718] p-[18px] text-sm text-white shadow-xl" style={{ left: Math.max(12, Math.min(point.x + 50, width - 282)), top: Math.max(74, Math.min(point.y - 80, window.innerHeight - 370)) }}>
      <header className="flex items-center justify-between"><h2>标准电流表</h2><button aria-label="关闭电流表设置" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="flex items-center justify-between gap-4"><span className="text-[#8c8f93]">名称</span><div className="flex gap-2"><input aria-label="名称字母" maxLength={8} className={`${field} w-[60px]`} value={settings.namePrefix} onInput={(e) => change({ namePrefix: e.currentTarget.value })} /><input aria-label="名称编号" maxLength={8} className={`${field} w-[60px]`} value={settings.nameNumber} onInput={(e) => change({ nameNumber: e.currentTarget.value })} /></div></div>
      <Toggle label="过载瞬间损坏" checked={settings.overloadDamage} onChange={() => change({ overloadDamage: !settings.overloadDamage })} />
      <Toggle label="图像" checked={settings.showGraph} onChange={() => change({ showGraph: !settings.showGraph })} />
      <label className="flex items-center justify-between text-[#8c8f93]">小量程内阻<select aria-label="小量程内阻" className={`${field} w-[115px]`} value={settings.smallResistance} onChange={(e) => change({ smallResistance: Number(e.currentTarget.value) as MeterSettings['smallResistance'] })}>{[0, 0.5, 1, 2, 5].map((r) => <option key={r} value={r}>{r}Ω</option>)}</select></label>
      <div className="flex items-center justify-between"><span className="text-[#8c8f93]">保留小数位</span><div className="flex overflow-hidden rounded-lg bg-[#343638]">{([1, 2, 3] as const).map((n) => <button key={n} aria-label={`保留${n}位小数`} aria-pressed={settings.decimals === n} className={`h-6 w-7 ${settings.decimals === n ? 'bg-[#238cf3]' : ''}`} onClick={() => change({ decimals: n })}>{n}</button>)}</div></div>
      <div className="flex justify-between gap-5"><button className="flex-1 rounded bg-[#343638] py-1 text-xs text-[#c6c8ca]" onClick={() => setMessage(saveMeterDefaults(settings) ? '已保存为默认设置' : '保存失败，请检查本地存储空间')}>作为默认</button><button className="flex-1 rounded bg-[#343638] py-1 text-xs text-[#c6c8ca]" onClick={() => { onChange({ ...DEFAULT_METER_SETTINGS }); setMessage('已恢复初始值') }}>使用初始值</button></div>
      {message && <p role="status" className="text-xs text-[#9dceff]">{message}</p>}
    </aside>}
  </div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(): void }) {
  return <div className="flex items-center justify-between"><span>{label}</span><button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} className={`h-[22px] w-11 rounded-full p-0.5 ${checked ? 'bg-[#168bff]' : 'bg-[#777b7d]'}`}><span className={`block size-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : ''}`} /></button></div>
}

export function MeterCurrentGraph({ current, decimals, point, meterLeft, viewport, onClose }: { current: number; decimals: number; point: { x: number; y: number }; meterLeft: number; viewport: { width: number; height: number }; onClose(): void }) {
  const panelRef = useRef<HTMLElement>(null)
  const [panelSize, setPanelSize] = useState({ width: 270, height: 324 })
  const [running, setRunning] = useState(true)
  const [samples, setSamples] = useState<{ t: number; i: number }[]>([])
  const [seconds, setSeconds] = useState(10)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(() => {
      const { width, height } = panel.getBoundingClientRect()
      setPanelSize({ width, height })
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSamples((previous) => [...previous.slice(-599), { t: (previous.at(-1)?.t ?? -0.1) + 0.1, i: current }]), 100)
    return () => window.clearInterval(timer)
  }, [current, running])
  const maxT = Math.max(seconds, samples.at(-1)?.t ?? seconds)
  const minT = maxT - seconds
  const maxI = Math.max(1.2, current * 1.1, ...samples.map((s) => s.i * 1.1))
  const minI = Math.min(0, current * 1.1, ...samples.map((s) => s.i * 1.1))
  const yFor = (i: number) => 223 - (i - minI) / (maxI - minI) * 190
  const path = samples.filter((s) => s.t >= minT).map((s, i) => `${i === 0 ? 'M' : 'L'}${(30 + (s.t - minT) / seconds * 205).toFixed(2)},${yFor(s.i).toFixed(2)}`).join(' ')
  const leftSide = meterLeft - panelSize.width - 16
  const preferredX = point.x + panelSize.width > viewport.width - 12 && leftSide >= 12 ? leftSide : point.x
  // 为顶部工具栏和底部读数操作条留出空间，图表按钮始终可见。
  return <aside ref={panelRef} aria-label="电流随时间曲线" data-meter-ui data-canvas-pan-block className="absolute z-30 w-[270px] max-w-[calc(100%-24px)] overflow-y-auto rounded bg-[#34383f] p-2 text-white shadow-xl" style={{ left: Math.max(12, Math.min(preferredX, viewport.width - panelSize.width - 12)), top: Math.max(74, Math.min(point.y, viewport.height - panelSize.height - 112)), maxHeight: Math.max(0, viewport.height - 186) }}>
    <header className="mb-2 flex justify-between text-xs"><span>电流随时间变化</span><button aria-label="关闭电流图像" onClick={onClose}><X size={16} /></button></header>
    <svg viewBox="0 0 252 250" role="img" aria-label="电流时间图" className="w-full rounded bg-white" data-current-samples={samples.length}>
      {[0, 1, 2, 3].map((n) => <g key={n} stroke="#b9b9b9" strokeWidth="0.6"><path d={`M30 ${33 + n * 63.33}H235 M${30 + n * 68.33} 33V223`} /></g>)}
      {minI < 0 && <g><path d={`M30 ${yFor(0)}H235`} stroke="#888" strokeDasharray="3 3" /><text x="2" y="223" fill="black" fontSize="10">{minI.toFixed(2)}</text></g>}
      <path d="M30 15V223H241" fill="none" stroke="black" strokeWidth="1.5" />
      <text x="7" y="42" fill="black" fontSize="14">I</text><text x="35" y="18" fill="black" fontSize="12">{maxI.toFixed(2)} A</text><text x="238" y="243" fill="black" fontSize="13">t</text><text x="32" y="242" fill="#555" fontSize="10">{minT.toFixed(1)}s</text><text x="187" y="242" fill="#555" fontSize="10">{maxT.toFixed(1)}s</text>
      <path d={path} fill="none" stroke="#ff4829" strokeWidth="2" /><text x="150" y="18" fill="#e94325" fontSize="12">{current.toFixed(decimals)} A</text>
    </svg>
    <div className="mt-2 flex items-center justify-between gap-2 text-xs"><button className="rounded bg-[#4b94ef] px-3 py-1" onClick={() => setRunning(!running)}>{running ? '暂停' : '继续'}</button><button className="rounded bg-[#e63556] px-3 py-1" onClick={() => setSamples([])}>清除</button><div className="flex gap-1"><button aria-label="缩短图像时间范围" className="bg-[#e63556] px-2 py-1" onClick={() => setSeconds(Math.max(2, seconds / 2))}>−</button><span className="px-1 py-1">{seconds}s</span><button aria-label="扩大图像时间范围" className="bg-[#e63556] px-2 py-1" onClick={() => setSeconds(Math.min(60, seconds * 2))}>+</button></div></div>
  </aside>
}
