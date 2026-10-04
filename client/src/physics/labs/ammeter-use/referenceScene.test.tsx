import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AmmeterScene } from './CompetitorScene.tsx'
import { AmmeterSchematic } from './SchematicView'
import { practiceController } from './practiceController'

describe('写实器材与可操作实验台', () => {
  const render = (state = practiceController.createInitialState()) => renderToStaticMarkup(<AmmeterScene state={state} dispatch={() => {}} />)
  it('渲染独立透明器材素材，六根导线保持真实可拆接', () => {
    const html = render()
    for (const name of ['ammeter', 'battery', 'lamp', 'switch-open']) expect(html).toContain(`/physics/ammeter/${name}.png`)
    expect(html.match(/data-wire=/g)).toHaveLength(6)
    expect(html).toContain('双击拆线')
    expect(html).toContain('清空接线')
    expect(html).not.toContain('电表读数')
  })
  it('S1和S2各有直接点击入口，器材本体仍保留拖动命中区', () => {
    const html = render()
    expect(html).toContain('data-component-drag="S1"')
    expect(html).toContain('data-component-drag="S2"')
    expect(html).toContain('选择开关 S₁')
    expect(html).toContain('闭合S1开关闸刀或把手')
    expect(html).toContain('选择开关 S₂')
    expect(html).toContain('闭合S2开关闸刀或把手')
  })
  it('通电后有闭合态器材，断电后表针和实时示数归零', () => {
    const closed = practiceController.reduce(practiceController.createInitialState(), { type: 'setSwitch', payload: 'closed' }).state
    expect(render(closed)).toContain('/physics/ammeter/switch-closed.png')
    const opened = practiceController.reduce(closed, { type: 'setSwitch', payload: 'open' }).state
    expect(render(opened)).toContain('data-reading="0"')
    expect(render(opened)).not.toContain('读数 0.30 A')
  })
})

 describe('电路图与实物图拓扑一致', () => {
  it('原理图只画实际存在的导线，并保持两个开关独立', () => {
    const initial = practiceController.createInitialState()
    const state = practiceController.reduce(initial, { type: 'setBypassSwitch', payload: 'closed' }).state
    const html = renderToStaticMarkup(<AmmeterSchematic state={state} reading={0} />)
    expect(html.match(/data-schematic-wire=/g)).toHaveLength(6)
    expect(html).toContain('data-switch="S1" data-closed="false"')
    expect(html).toContain('data-switch="S2" data-closed="true"')
    const disconnected = practiceController.reduce(state, { type: 'disconnect', payload: state.edges[0] }).state
    expect(renderToStaticMarkup(<AmmeterSchematic state={disconnected} reading={0} />).match(/data-schematic-wire=/g)).toHaveLength(5)
  })
})
