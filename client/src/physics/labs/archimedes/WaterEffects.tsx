import { useEffect, useState } from 'react'
import type { ArchimedesState } from './controller'
import type { Position } from '../../runtime/types'
import { bucketCatches, bucketWaterY, pourGeometry, spillSurface } from './waterMotion'

interface Stream { kind: 'overflow' | 'pour'; start: Position; end: Position; id: number }
interface Puddle extends Position { volume: number }
function addPuddle(puddles: Puddle[], point: Position, volume: number) {
  if (volume <= .001) return puddles
  const nearby = puddles.findIndex(p => p.y === point.y && Math.abs(p.x - point.x) < 24)
  return nearby < 0 ? [...puddles, { ...point, volume }] : puddles.map((p, i) => i === nearby ? { ...p, volume: p.volume + volume } : p)
}
export default function WaterEffects({ state }: { state: ArchimedesState }) {
  const total = state.collectedVolume + state.lostVolume
  const [view, setView] = useState({ total, collected: state.collectedVolume, cupRemoved: state.cupRemoved, stream: null as Stream | null, puddles: [] as Puddle[] })
  // 用累计排水变化跟踪效果，单次lastOverflow归零不会截断正在显示的水流。
  if (total !== view.total || state.collectedVolume !== view.collected || state.cupRemoved !== view.cupRemoved) {
    let { stream, puddles } = view
    const overflow = total - view.total
    if (overflow < -.001 || (Math.abs(overflow) < .001 && state.collectedVolume > view.collected + .001)) { stream = null; puddles = [] }
    else if (overflow > .001 && !state.cupRemoved) {
      const start = { x: state.positions.cup.x + 165, y: state.positions.cup.y + 91 }
      const surface = spillSurface(start)
      const caught = Math.max(0, state.collectedVolume - view.collected)
      stream = { kind: 'overflow', start, end: bucketCatches(state) ? { x: start.x, y: bucketWaterY(state) } : surface, id: total }
      puddles = addPuddle(puddles, surface, overflow - caught)
    }
    const poured = view.collected - state.collectedVolume
    if (state.bucketPour && poured > .001) {
      const start = pourGeometry(state).lip
      const end = spillSurface(start)
      stream = { kind: 'pour', start, end, id: state.bucketPour.elapsed }
      puddles = addPuddle(puddles, end, poured)
    }
    if (state.cupRemoved && stream?.kind === 'overflow') stream = null
    setView({ total, collected: state.collectedVolume, cupRemoved: state.cupRemoved, stream, puddles })
  }
  useEffect(() => {
    if (!view.stream) return
    const timer = window.setTimeout(() => setView(old => ({ ...old, stream: null })), 1800)
    return () => window.clearTimeout(timer)
  }, [view.stream])
  const stream = view.stream?.kind === 'pour' && (!state.bucketPour || state.collectedVolume <= .001) ? null : view.stream
  const start = stream?.kind === 'pour' ? pourGeometry(state).lip : stream?.start
  const width = stream?.kind === 'pour' ? Math.max(1, Math.min(6, (state.bucketPour?.elapsed ?? 0) * 4)) : 4
  return <g pointerEvents="none" aria-hidden="true">
    {view.puddles.map((p, i) => <g key={i}>
      <ellipse data-water-puddle data-water-volume={p.volume} cx={p.x} cy={p.y} rx={12 + Math.sqrt(p.volume) * 8} ry={3 + Math.sqrt(p.volume) * 1.2} fill="#8bcedd" opacity=".4" />
      <ellipse cx={p.x - 4} cy={p.y - 1} rx={7 + Math.sqrt(p.volume) * 5} ry="1.5" fill="#d3eef4" opacity=".5" />
    </g>)}
    {stream && start && <g key={`${stream.kind}:${stream.id}`} data-water-stream={stream.kind} className="arch-water-flow">
      <path d={`M ${start.x - 3} ${start.y - 3} Q ${start.x + 4} ${start.y + 14} ${stream.end.x} ${stream.end.y}`} fill="none" stroke="#a2d6e5" strokeWidth={width} opacity=".65" />
      <path d={`M ${start.x - 3} ${start.y - 3} Q ${start.x + 4} ${start.y + 14} ${stream.end.x} ${stream.end.y}`} fill="none" stroke="#e0f4fa" strokeWidth="2" strokeDasharray="8 5" opacity=".9"><animate attributeName="stroke-dashoffset" from="0" to="-26" dur=".3s" repeatCount="indefinite" /></path>
      <ellipse cx={stream.end.x} cy={stream.end.y} rx="9" ry="2.5" fill="none" stroke="#d3edf5" opacity=".7"><animate attributeName="rx" values="4;13;4" dur=".4s" repeatCount="indefinite" /></ellipse>
    </g>}
  </g>
}
