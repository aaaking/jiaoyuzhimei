import type { exposedWireEnd } from './wireAppearance'

export default function WireBareEnd({ end, gradient }: { end: ReturnType<typeof exposedWireEnd>; gradient: string }) {
  return <g data-wire-bare-end={end.terminal} transform={`translate(${end.center.x} ${end.center.y}) rotate(${end.angle})`} fill="none" strokeLinecap="round" pointerEvents="none">
    <path d={end.path} stroke="#665342" strokeWidth="2.5" />
    <path d={end.path} stroke={`url(#${gradient})`} strokeWidth="1.7" />
    <path d={end.path} stroke="#fff5d5" strokeWidth="0.45" transform="translate(0 -0.45)" />
  </g>
}
