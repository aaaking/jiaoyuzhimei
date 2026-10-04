import { useId } from 'react'
import { OBJECT_MATERIALS } from './objectSettings'
import { formatMeterReading } from './meterSettings'
import type { ArchimedesState } from './controller'
import { readingsFor } from './controller'
import { CUP_BOTTOM, ML_HEIGHT } from './definition'
import { bucketWaterY } from './waterMotion'

/** 实物绘制使用同一坐标与水面模型，刻度、挂钩和读数跟随器材整体移动。 */
export function ApparatusDefs() {
  return <defs>
    <linearGradient id="arch-glass"><stop stopColor="#e6e9e8" stopOpacity=".62" /><stop offset=".04" stopColor="#b4bdc1" stopOpacity=".12" /><stop offset=".88" stopColor="#c9d1d3" stopOpacity=".1" /><stop offset=".97" stopColor="#f9fcf7" stopOpacity=".5" /><stop offset="1" stopColor="#ffffff" stopOpacity=".7" /></linearGradient>
    <linearGradient id="arch-water" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b8cad0" stopOpacity=".2" /><stop offset="1" stopColor="#a7c7d0" stopOpacity=".36" /></linearGradient>
    <linearGradient id="arch-gold"><stop stopColor="#93600b" /><stop offset=".16" stopColor="#deac21" /><stop offset=".4" stopColor="#ffdf66" /><stop offset=".65" stopColor="#dcb42e" /><stop offset="1" stopColor="#93630a" /></linearGradient>
    <linearGradient id="arch-wood" x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#a77446" /><stop offset=".4" stopColor="#bd8b58" /><stop offset="1" stopColor="#805030" /></linearGradient>
    <linearGradient id="arch-leg"><stop stopColor="#654026" /><stop offset=".18" stopColor="#98643c" /><stop offset=".6" stopColor="#a97545" /><stop offset="1" stopColor="#754929" /></linearGradient>
    <linearGradient id="arch-aluminum"><stop stopColor="#9caeb7" /><stop offset=".35" stopColor="#f5fbff" /><stop offset=".7" stopColor="#d0dce2" /><stop offset="1" stopColor="#82959f" /></linearGradient>
    <linearGradient id="arch-metal"><stop stopColor="#707978" /><stop offset=".45" stopColor="#e5e7dd" /><stop offset=".65" stopColor="#b3bab4" /><stop offset="1" stopColor="#6e7771" /></linearGradient>
    <linearGradient id="arch-blue"><stop stopColor="#1264a3" /><stop offset=".22" stopColor="#258ed1" /><stop offset=".75" stopColor="#38a2e5" /><stop offset="1" stopColor="#176db0" /></linearGradient>
    <filter id="arch-grain"><feTurbulence baseFrequency=".012 .32" numOctaves="2" seed="7" type="fractalNoise" /><feColorMatrix type="saturate" values="0" /></filter>
  </defs>
}

export function WoodenBench() {
  return <g aria-hidden="true" pointerEvents="none">
    <defs><clipPath id="arch-tabletop"><path d="M 94 450 H 578 L 607 515 H 62 Z" /></clipPath></defs>
    <ellipse cx="336" cy="708" rx="270" ry="8" fill="#171a1d" opacity=".14" />
    <path d="M 99 541 H 131 L 125 642 H 103 Z M 542 541 H 565 V 642 H 546 Z" fill="url(#arch-leg)" stroke="#79502e" strokeWidth="1.5" />
    <path d="M 76 532 H 104 L 99 711 H 77 Z M 568 532 H 594 L 596 711 H 572 Z" fill="url(#arch-leg)" stroke="#79502e" strokeWidth="1.5" />
    <path d="M 78 532 H 592 V 560 L 79 554 Z" fill="url(#arch-wood)" stroke="#79502e" />
    <path d="M 94 450 H 578 L 607 515 H 62 Z" fill="url(#arch-wood)" stroke="#8b5d36" />
    <g clipPath="url(#arch-tabletop)"><path d="M 94 450 H 578 L 607 515 H 62 Z" filter="url(#arch-grain)" opacity=".17" style={{ mixBlendMode: 'multiply' }} /></g>
    {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M ${92 - i * 2} ${454 + i * 4.4} Q 310 ${461 + i * 3.9} ${582 + i * 1.8} ${454 + i * 4.4}`} stroke="#5f3b23" opacity=".14" fill="none" />)}
    <ellipse cx="205" cy="478" rx="65" ry="9" stroke="#6c4328" opacity=".16" fill="none" />
    <ellipse cx="205" cy="478" rx="40" ry="5" stroke="#6c4328" opacity=".14" fill="none" />
    <rect x="62" y="514" width="545" height="18" rx="3" fill="url(#arch-wood)" stroke="#79502e" />
    <path d="M 64 516 H 605 M 79 557 V 709 M 574 561 V 708" stroke="#d5ab79" opacity=".75" fill="none" />
  </g>
}

const cupShape = 'M -108 0 L -105 262 Q -104 280 -87 280 H 84 Q 102 280 103 262 L 108 0 Z'
export function OverflowCup({ state, front = false, selected = false }: { state: ArchimedesState; front?: boolean; selected?: boolean }) {
  const id = useId()
  const p = state.positions.cup
  const waterY = readingsFor(state).waterY - p.y
  return <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
    {front ? <>
      <path d={cupShape} fill="url(#arch-glass)" stroke="#dde0d9" strokeWidth="1.8" />
      <path d="M 107 45 L 168 76 L 158 96 L 105 80 Z" fill="url(#arch-glass)" stroke="#c8cecb" strokeWidth="1.8" />
      <path d="M 109 51 L 162 79 M 108 78 L 156 91" stroke="#edf1eb" strokeWidth="1" opacity=".48" />
      <path d="M -102 4 L -101 257 Q -101 273 -86 273 H 83" stroke="#f7f6e9" opacity=".55" strokeWidth="2" fill="none" />
      <ellipse cx="0" cy="1" rx="109" ry="3.4" fill="none" stroke="#e5e6dc" strokeWidth="2" />
      <ellipse cx="0" cy="0" rx="108" ry="2" fill="none" stroke="#747d7d" strokeWidth="1" />
      {Array.from({ length: 11 }, (_, i) => {
        const volume = 20 + i * 10
        const y = CUP_BOTTOM - volume * ML_HEIGHT
        return <g key={volume} fill="#232b2f"><line x1={i % 2 === 0 ? 13 : 23} x2="50" y1={y} y2={y} stroke="#30383a" strokeWidth="1" />{i % 2 === 0 && <text x="54" y={y + 5} fontSize="16">{volume}</text>}</g>
      })}
      <line x1="32" x2="32" y1="22" y2="253" stroke="#30383a" strokeWidth="1" />
      <text x="-65" y="74" fill="#2a3133" fontSize="19">120 mL</text>
      <text data-cup-name x="-78" y="230" fill="#2a3133" fontSize="18" textLength={state.cupName.length > 8 ? 156 : undefined} lengthAdjust="spacingAndGlyphs" letterSpacing="1">{state.cupName}</text>
      <text x="126" y="15" fill="#f4f5f3" fontSize="16">{state.liquidVolume.toFixed(1).replace('.0', '')} mL</text>
    </> : <>
      {selected && <rect x="-118" y="-16" width="296" height="308" rx="7" fill="#e6e8eb" opacity=".08" />}
      <defs><clipPath id={id}><path d={cupShape} /></clipPath></defs>
      <path d={cupShape} fill="#b3bdc5" opacity=".09" />
      <g clipPath={`url(#${id})`}>
        <rect x="-105" y={waterY} width="210" height={Math.max(0, CUP_BOTTOM - waterY)} fill="url(#arch-water)" />
        {state.liquidVolume > 0 && <ellipse cx="0" cy={waterY} rx="104" ry="3.4" fill="#b1c3c9" opacity=".19" />}
      </g>
    </>}
  </g>
}

export function CollectionBucket({ state, selected = false, showVolume = true }: { state: ArchimedesState; selected?: boolean; showVolume?: boolean }) {
  const id = useId()
  const p = state.positions.bucket
  const shape = 'M -50 0 L -38 108 Q -37 112 -32 112 H 32 Q 37 112 38 108 L 50 0 Z'
  const y = bucketWaterY(state) - p.y
  return <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
    {selected && <rect x="-60" y="-70" width="120" height="188" rx="6" fill="#ffffff" opacity=".09" />}
    <defs><clipPath id={id}><path d={shape} /></clipPath></defs>
    <path d="M -49 0 C -47 -72 47 -72 49 0" fill="none" stroke="url(#arch-metal)" strokeWidth="1.5" />
    <path d={shape} fill="url(#arch-glass)" stroke="#c1c9c7" strokeWidth="1.5" />
    {state.collectedVolume > 0 && <g clipPath={`url(#${id})`}><rect x="-50" y={y} width="100" height={112 - y} fill="#79bdd6" opacity=".55" /><ellipse cx="0" cy={y} rx="47" ry="1.6" fill="#d2eff7" opacity=".8" /></g>}
    <ellipse cx="0" cy="0" rx="50" ry="2.4" stroke="#b9c1bf" strokeWidth="1.4" fill="none" />
    <path d="M -46 4 L -36 107 H 31" fill="none" stroke="#edf1e9" opacity=".44" />
    {showVolume && <text x="57" y="12" fill="#f4f5f3" fontSize="16">{state.collectedVolume.toFixed(1)} mL</text>}
  </g>
}

export function MetalObject({ state, selected = false }: { state: ArchimedesState; selected?: boolean }) {
  const p = state.positions.object
  const hook = state.positions.meter
  const material = OBJECT_MATERIALS[state.objectSettings.material]
  return <g pointerEvents="none">
    {state.attached === 'object' && <line x1={hook.x} y1={hook.y + 218} x2={p.x} y2={p.y - 14} stroke="#b9beb8" strokeWidth="1.2" />}
    <g transform={`translate(${p.x} ${p.y})`} data-object-material={state.objectSettings.material}>
      {selected && <rect x="-30" y="-30" width="60" height="115" rx="6" fill="#ffffff" opacity=".09" />}
      <g>
      <path d="M 0 0 V -7 C -17 -17 1 -27 5 -14" stroke="url(#arch-metal)" strokeWidth="2" fill="none" />
      <rect x="-22" width="44" height="78" fill={material.fill} />
      <ellipse cx="0" cy="0" rx="22" ry="2" fill={material.top} />
      <ellipse cx="0" cy="77" rx="22" ry="1.4" fill={material.top} />
      <line x1="-19" x2="-19" y1="2" y2="76" stroke="#ffffff" opacity=".3" />
      {state.objectSettings.material === 'wood' && <path d="M -8 2 Q 4 20 -6 40 T -4 76 M 9 2 Q -2 25 10 48 T 8 76" stroke="#885719" fill="none" opacity=".4" />}
      {state.objectSettings.showScale && <g data-object-scale stroke="#30383a" fill="#30383a">{Array.from({ length: 11 }, (_, i) => <line key={i} x1={i % 2 ? -7 : -12} x2="4" y1={i * 7.8} y2={i * 7.8} />)}</g>}
      {state.objectWetVolume > .001 && <g data-object-water fill="#bce7f4" opacity=".65"><path d="M -15 24 q -5 8 0 8 q 5 0 0 -8 M 14 52 q -5 8 0 8 q 5 0 0 -8" /></g>}
      </g>
    </g>
  </g>
}

export function SpringMeter({ state, selected = false, showReading = true }: { state: ArchimedesState; selected?: boolean; showReading?: boolean }) {
  const p = state.positions.meter
  const force = readingsFor(state).force
  const indexY = 35 + Math.min(state.meterSettings.range, force) / state.meterSettings.range * 130
  return <g transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
    {selected && <rect x="-42" y="-106" width="84" height={355 + state.pullExtension} rx="6" fill="#ffffff" opacity=".09" />}
    {showReading && <text data-meter-reading x="-35" y="-40" fill="#f7f8f3" fontSize="24" textAnchor="end">{state.meterDamaged ? '失准' : formatMeterReading(force, state.meterSettings)}</text>}
    <path d="M -18 9 V -13 C -18 -28 18 -28 18 -13 V 9" fill="none" stroke="url(#arch-metal)" strokeWidth="3.5" />
    <circle cy="-20" r="5" fill="#d8ded8" /><path d="M 0 -17 V 10" stroke="#afb9ad" strokeWidth="2" />
    <path d="M -25 10 Q 0 -10 25 10 V 177 Q 0 198 -25 177 Z" fill="url(#arch-blue)" />
    <path d="M -19 24 Q 0 10 19 24 V 170 Q 0 182 -19 170 Z" fill="#f4f2dc" stroke="#dadbc6" />
    <text x="-17" y="29" fontSize="8" fill="#526052">N</text><text x="12" y="29" fontSize="8" fill="#526052">g</text>
    <path d="M -3 35 V 165" stroke="#738171" strokeWidth="2" />
    {Array.from({ length: 51 }, (_, i) => <line key={i} x1={i % 10 === 0 ? -11 : i % 5 === 0 ? -8 : -6} x2="6" y1={35 + i * 2.6} y2={35 + i * 2.6} stroke="#42523f" strokeWidth={i % 10 === 0 ? 1 : .65} />)}
    {[0, 1, 2, 3, 4, 5].map(n => <g key={n} fontSize="8" fill="#42523f"><text x="-17" y={38 + n * 26}>{Number((n * state.meterSettings.range / 5).toFixed(1))}</text><text x="10" y={38 + n * 26} fontSize="7">{Math.round(n * state.meterSettings.range / 5 / 9.8 * 1000)}</text></g>)}
    <line x1="-8" x2="8" y1={indexY} y2={indexY} stroke="#df2229" strokeWidth="2.3" />
    {state.pullExtension > 0 && <line x1="0" x2="0" y1="190" y2={190 + state.pullExtension} stroke="url(#arch-metal)" strokeWidth="2" />}
    <path transform={`translate(0 ${state.pullExtension})`} d="M 0 190 L 0 199 C 0 204 -4 204 -3 199 C -2 195 3 196 2 203 L -1 212 C -20 226 15 241 8 217" fill="none" stroke="url(#arch-metal)" strokeWidth="2" />
  </g>
}
