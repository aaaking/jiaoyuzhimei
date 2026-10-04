import { RANGE_SPEC } from './definition'
import { evaluatePracticeCircuit, type PracticeState } from './practiceController'
import { lampSettingsFor } from './lampSettings'
import { batterySettingsFor } from './batterySettings'
import { terminalPosition, wireKey, wirePathD, type LabLayout } from './layout'
import { createReferenceLayout } from './referenceLayout'
import { switchSettingsFor } from './switchSettings'

const ink = '#e8edf3'
function SwitchSymbol({ x, y, left, right, closed, label, id, reversed, angle }: { x: number; y: number; left: number; right: number; closed: boolean; label: string; id: string; reversed: boolean; angle: number }) {
  return <g data-switch={id} data-closed={closed} transform={`rotate(${angle} ${x} ${y})`}>
    <g transform={reversed ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
    <path d={`M ${left} ${y} H ${x - 12} M ${x + 12} ${y} H ${right} M ${x - 12} ${y} L ${x + 12} ${closed ? y : y - 28}`} fill="none" stroke={ink} strokeWidth="3" />
    <circle cx={x - 12} cy={y} r="4" fill={ink} /><circle cx={x + 12} cy={y} r="4" fill={ink} />
    </g><text x={x} y={y + 40} textAnchor="middle">{label}</text>
  </g>
}

/** 使用实物图的同一份导线和布局，避免切换视图后出现另一张电路。 */
export function AmmeterSchematic({ state, reading, layout = createReferenceLayout(), selectedWire, onSelectWire }: { state: PracticeState; reading: number; layout?: LabLayout; selectedWire?: string | null; onSelectWire?(key: string): void }) {
  const { E1, S1, S2, L1, A1 } = layout.components
  const p = (id: Parameters<typeof terminalPosition>[1]) => terminalPosition(layout, id)
  const meterPositive = p(state.activeRange === '0.6A' ? 'ammeter-0.6' : 'ammeter-3')
  const battery = batterySettingsFor(state)
  const lamp = lampSettingsFor(state)
  const lampOpen = Boolean(state.bulbDetached || state.lampDamaged || lamp.broken)
  const lampLit = evaluatePracticeCircuit(state).lampLit
  const s1 = switchSettingsFor(state, 'S1'), s2 = switchSettingsFor(state, 'S2')
  const switchTerminal = (id: Parameters<typeof terminalPosition>[1]) => terminalPosition({ ...layout, componentAngles: undefined, componentReversed: undefined }, id).x
  return <g fill={ink} fontSize="18" fontFamily="Arial, sans-serif">
    <text x={S2.x - 120} y={S2.y - 70} fontSize="16">练习使用电流表 · 电路图</text>
    {state.edges.map((edge, index) => <g key={`${edge.from}:${edge.to}`} data-wire-selectable data-wire-hit={wireKey(edge.from, edge.to)} role="button" tabIndex={0} aria-pressed={selectedWire === wireKey(edge.from, edge.to)}
      aria-label={`选择电路图连接线 ${index + 1}`}
      onClick={() => onSelectWire?.(wireKey(edge.from, edge.to))}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectWire?.(wireKey(edge.from, edge.to)) } }}
    >
      <path data-schematic-wire={`${edge.from}:${edge.to}`} d={wirePathD(layout, edge.from, edge.to)} fill="none" stroke={selectedWire === wireKey(edge.from, edge.to) ? '#f0bd56' : ink} strokeWidth="3" />
      <path d={wirePathD(layout, edge.from, edge.to)} fill="none" stroke="transparent" strokeWidth="16" pointerEvents="stroke" className="cursor-pointer" />
    </g>)}
    {!s1.removed && <SwitchSymbol {...S1} left={switchTerminal('switch-a')} right={switchTerminal('switch-b')} closed={state.switchClosed && !s1.broken} label={`${s1.namePrefix}${s1.nameNumber}`} id="S1" reversed={s1.reversed} angle={s1.angle} />}
    {!s2.removed && <SwitchSymbol {...S2} left={switchTerminal('lamp2-a')} right={switchTerminal('lamp2-b')} closed={Boolean(state.bypassClosed) && !s2.broken} label={`${s2.namePrefix}${s2.nameNumber}`} id="S2" reversed={s2.reversed} angle={s2.angle} />}
    {!lamp.removed && <g data-schematic-lamp>
      <g transform={`rotate(${lamp.angle} ${L1.x} ${L1.y})`}><g transform={lamp.reversed ? `translate(${2 * L1.x} 0) scale(-1 1)` : undefined}>
        <path d={`M ${switchTerminal('lamp1-a')} ${L1.y} H ${L1.x - 22} M ${L1.x + 22} ${L1.y} H ${switchTerminal('lamp1-b')}`} fill="none" stroke={ink} strokeWidth="3" />
        <circle cx={L1.x} cy={L1.y} r="22" fill={lampLit ? '#ffe9a8' : '#343941'} stroke={ink} strokeWidth="3" strokeDasharray={lampOpen && !lamp.shorted ? '4 5' : undefined} />
        {lamp.shorted ? <path d={`M ${L1.x - 22} ${L1.y} H ${L1.x + 22}`} stroke="#ff7466" strokeWidth="3" /> : !lampOpen && <path d={`M ${L1.x - 14} ${L1.y - 14} l 28 28 M ${L1.x + 14} ${L1.y - 14} l -28 28`} stroke={lampLit ? '#c18a28' : ink} strokeWidth="2" />}
      </g></g><text x={L1.x} y={L1.y + 46} textAnchor="middle">{`${lamp.namePrefix}${lamp.nameNumber}`}</text>
    </g>}
    {!battery.removed && <g data-schematic-battery>
      <g transform={`rotate(${battery.angle} ${E1.x} ${E1.y})`}>
        <path d={`M ${switchTerminal('battery-')} ${E1.y} H ${E1.x - 24} M ${E1.x + 24} ${E1.y} H ${switchTerminal('battery+')}`} fill="none" stroke={ink} strokeWidth="3" />
        <g transform={battery.reversed ? `translate(${2 * E1.x} 0) scale(-1 1)` : undefined}>
          <path d={`M ${E1.x - 24} ${E1.y - 12} v 24 M ${E1.x - 8} ${E1.y - 24} v 48 M ${E1.x + 8} ${E1.y - 12} v 24 M ${E1.x + 24} ${E1.y - 24} v 48`} fill="none" stroke={ink} strokeWidth="3" />
        </g><text x={E1.x + (battery.reversed ? -50 : 40)} y={E1.y - 26}>+</text>
      </g><text x={E1.x} y={E1.y + 50} textAnchor="middle">{`${battery.namePrefix}${battery.nameNumber}`}</text>
    </g>}
    {!state.meterRemoved && <g data-schematic-meter>
      <path d={`M ${p('ammeter-neg').x} ${A1.y} H ${A1.x - 28} M ${meterPositive.x} ${A1.y} H ${A1.x + 28}`} fill="none" stroke={ink} strokeWidth="3" />
      <circle cx={A1.x} cy={A1.y} r="28" fill="#343941" stroke={ink} strokeWidth="3" />
      <text x={A1.x} y={A1.y + 8} fontSize="24" textAnchor="middle">A</text>
      <text x={A1.x} y={A1.y + 55} textAnchor="middle">{state.meterSettings ? `${state.meterSettings.namePrefix}${state.meterSettings.nameNumber}` : 'A1'}</text>
      <text x={A1.x} y={A1.y - 55} textAnchor="middle" fontSize="15">{state.meterDamaged ? '已损坏' : state.activeRange ? RANGE_SPEC[state.activeRange].label : '未接入电流表'} · {reading.toFixed(state.meterSettings?.decimals ?? 2)} A</text>
      <text x={A1.x + 38} y={A1.y - 20} fontSize="13">电流 I</text>
    </g>}
  </g>
}
