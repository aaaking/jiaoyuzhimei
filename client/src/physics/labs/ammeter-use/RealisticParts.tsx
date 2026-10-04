import { useId, type SVGProps } from 'react'
import type { AmmeterRangeId } from './definition'
import { RotateCcw, Unlink2, Zap } from 'lucide-react'
import { switchBodyBounds } from './switchGeometry'

const ASSET_ROOT = `${import.meta.env.BASE_URL}physics/ammeter/`
// 素材上的端子和针轴像素是几何基准；热区和导线使用同一映射。
export const PART_GEOMETRY = {
  switch: { width: 1774, height: 887, scale: 0.09, anchorX: 888, anchorY: 546, left: 188, right: 1588 },
  lamp: { width: 1774, height: 887, scale: 0.09, anchorX: 888, anchorY: 526, left: 402, right: 1374 },
  battery: { width: 2172, height: 724, scale: 0.11, anchorX: 1088, anchorY: 375, left: 261, right: 1916 },
  ammeter: { width: 1313, height: 1198, scale: 0.125, anchorX: 656, anchorY: 849, left: 338, right: 979 },
} as const

type PartKind = keyof typeof PART_GEOMETRY
function PartImage({ kind, file, x, y }: { kind: PartKind; file: string; x: number; y: number }) {
  const part = PART_GEOMETRY[kind]
  return <image href={`${ASSET_ROOT}${file}.png`} x={x - part.anchorX * part.scale} y={y - part.anchorY * part.scale} width={part.width * part.scale} height={part.height * part.scale} pointerEvents="none" />
}
function Name({ x, y, label }: { x: number; y: number; label: string }) {
  return <text x={x} y={y} textAnchor="middle" fill="#f3f4f6" fontSize="22" fontFamily="Arial, sans-serif" pointerEvents="none">{label}</text>
}
export function BatteryHolderE1({ x, y, damaged = false, label = 'E1', reversed = false, angle = 0 }: { x: number; y: number; damaged?: boolean; label?: string; reversed?: boolean; angle?: number }) {
  const part = PART_GEOMETRY.battery
  const bounds = switchBodyBounds(x, y, angle, part)
  // 以两接线柱中点镜像，保留素材中相对锚点的不对称偏移。
  const mirrorX = 2 * x + (part.left + part.right - 2 * part.anchorX) * part.scale
  return <g data-apparatus="E1" data-reversed={reversed} data-source-damaged={damaged}>
    <g data-battery-body transform={`rotate(${angle} ${x} ${y})`} style={damaged ? { filter: 'grayscale(1)', opacity: 0.6 } : undefined}>
      <g transform={reversed ? `translate(${mirrorX} 0) scale(-1 1)` : undefined}>
        <PartImage kind="battery" file="battery" x={x} y={y} />
        <path data-battery-negative d={`M ${x - 69} ${y - 1.5} h 8`} stroke="#f2eee8" strokeWidth={1.5} pointerEvents="none" />
      </g>
    </g><Name x={x} y={angle === 0 ? y + 51 : bounds.bottom + 22} label={damaged ? `${label} · 已损坏` : label} />
  </g>
}
export function KnifeSwitch({ x, y, closed, label, id = label, reversed = false, angle = 0, broken = false }: { x: number; y: number; closed: boolean; label: string; id?: string; reversed?: boolean; angle?: number; broken?: boolean }) {
  const bounds = switchBodyBounds(x, y, angle, PART_GEOMETRY.switch)
  const file = closed ? 'switch-closed' : 'switch-open'
  return <g data-apparatus={id} data-reversed={reversed}>
    <g data-switch-body={id} transform={`rotate(${angle} ${x} ${y})`}>
      <g transform={reversed ? `translate(${2 * x} 0) scale(-1 1)` : undefined}><PartImage kind="switch" file={file} x={x} y={y} /></g>
    </g>
    <Name x={x} y={angle === 0 ? y + 49 : bounds.bottom + 22} label={label} />
    {broken && <g data-switch-broken={id} role="img" aria-label={`${label}开关断路`} transform={`translate(${x} ${bounds.top - 24})`} pointerEvents="none">
      <path d="M-7 14 L0 24 L7 14" fill="none" stroke="#ff464e" strokeWidth={2} /><circle r={17} fill="#343941" stroke="#ff464e" strokeWidth={2} /><Unlink2 x={-10} y={-10} size={20} color="#ff464e" />
    </g>}
  </g>
}
export function LampHolderL1({ x, y, lit, brightness = 1, label = 'L1', reversed = false, angle = 0, detached = false, damaged = false, broken = false, shorted = false }: { x: number; y: number; lit: boolean; brightness?: number; label?: string; reversed?: boolean; angle?: number; detached?: boolean; damaged?: boolean; broken?: boolean; shorted?: boolean }) {
  const bounds = switchBodyBounds(x, y, angle, PART_GEOMETRY.lamp)
  const fault = damaged ? '已烧坏' : shorted ? '短路' : broken ? '断路' : null
  const glowId = useId()
  const glowing = lit && !detached && !damaged && !broken && !shorted && brightness > 0
  return <g data-apparatus="L1" data-reversed={reversed} data-lamp-damaged={damaged}>
    <g data-lamp-body transform={`rotate(${angle} ${x} ${y})`}>
      <g transform={reversed ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
        <defs><radialGradient id={glowId}><stop offset="0" stopColor="#fff7b0" stopOpacity="0.95" /><stop offset="0.3" stopColor="#ffe46c" stopOpacity="0.8" /><stop offset="0.65" stopColor="#ffd64d" stopOpacity="0.32" /><stop offset="1" stopColor="#ffd64d" stopOpacity="0" /></radialGradient></defs>
        {glowing && <circle data-lamp-glow cx={x} cy={y - 25} r={32 + 20 * Math.sqrt(brightness)} opacity={brightness} fill={`url(#${glowId})`} pointerEvents="none" />}
        <g data-lamp-empty={detached || undefined} style={damaged && !detached ? { filter: 'grayscale(1)' } : undefined}><PartImage kind="lamp" file={detached ? 'lamp-empty' : 'lamp'} x={x} y={y} /></g>
        {glowing && <g opacity={brightness}><PartImage kind="lamp" file="lamp-lit" x={x} y={y} /></g>}
      </g>
    </g><Name x={x} y={angle === 0 ? y + 48 : bounds.bottom + 22} label={label} />
    {fault && <g data-lamp-fault={fault} role="img" aria-label={`${label}${fault}`} transform={`translate(${x} ${bounds.top - 24})`} pointerEvents="none"><circle r={17} fill="#343941" stroke="#ff464e" strokeWidth={2} />{shorted && !damaged ? <Zap x={-10} y={-10} size={20} color="#ff464e" /> : <Unlink2 x={-10} y={-10} size={20} color="#ff464e" />}<text y={-24} textAnchor="middle" fontSize="13" fill="#ff7466">{fault}</text></g>}
  </g>
}
export function DetachedLampBulb({ x, y, damaged, onAttach, drag }: { x: number; y: number; damaged?: boolean; onAttach(): void; drag: SVGProps<SVGGElement> }) {
  return <g data-detached-bulb data-canvas-pan-block transform={`translate(${x} ${y})`} {...drag} className="cursor-grab active:cursor-grabbing">
    <image href={`${ASSET_ROOT}lamp-bulb.png`} x={-28.44} y={-52.425} width={56.835} height={56.025} style={damaged ? { filter: 'grayscale(1)' } : undefined} />
    <g role="button" tabIndex={0} aria-label="装回灯泡" transform="translate(0 -68)" className="cursor-pointer" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onAttach() }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAttach() } }}><circle r={14} fill="#151718" /><RotateCcw x={-8} y={-8} size={16} color="#e8edf3" /></g>
    {damaged && <text y={18} textAnchor="middle" fontSize="13" fill="#ff7466">已烧坏</text>}
  </g>
}
export function AmmeterA1({ x, y, reading, range, label = 'A1', decimals = 2, damaged = false }: { x: number; y: number; reading: number; range: AmmeterRangeId | null; overRange?: boolean; label?: string; decimals?: number; damaged?: boolean }) {
  const part = PART_GEOMETRY.ammeter
  const angle = -53 + Math.min(1, Math.max(-0.12, reading / (range === '0.6A' ? 0.6 : 3))) * 106
  const pivotY = (764 - part.anchorY) * part.scale
  return (
    <g data-apparatus="A1" data-reading={reading} transform={`translate(${x} ${y})`}>
      <PartImage kind="ammeter" file="ammeter" x={0} y={0} />
      {/* 表身位移立即生效，读数动画只绕固定的局部针轴旋转。 */}
      <g data-part="ammeter-needle-pivot" transform={`translate(0 ${pivotY})`}>
        <line data-part="ammeter-needle" x1={0} y1={0} x2={0} y2={-60} stroke="#e32921" strokeWidth="1.8" transform={`rotate(${angle})`} style={{ transition: 'transform 180ms ease-out' }} pointerEvents="none" />
      </g>
      <text x={-48} y={-121} fill={damaged ? '#ff7466' : '#f3f4f6'} fontSize="22" fontFamily="Arial, sans-serif" pointerEvents="none">{damaged ? '已损坏' : reading === 0 ? '0A' : `${reading.toFixed(decimals)}A`}</text>
      <Name x={0} y={59} label={label} />
    </g>
  )
}
