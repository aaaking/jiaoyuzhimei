// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const KEY = 'physics:ammeter-use:meter-defaults:v1'
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
describe('电流表本地默认设置', () => {
  it('保存完整有效设置并读取，非法内阻不能覆写', async () => {
    const { loadMeterDefaults, saveMeterDefaults } = await import('./meterSettings')
    const settings = { namePrefix: 'I', nameNumber: '2', overloadDamage: false, showGraph: true, smallResistance: 2 as const, decimals: 3 as const }
    expect(saveMeterDefaults(settings)).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(settings)
    expect(loadMeterDefaults()).toEqual(settings)
    expect(saveMeterDefaults({ ...settings, smallResistance: NaN } as never)).toBe(false)
    expect(loadMeterDefaults()).toEqual(settings)
  })
  it.each(['broken-json', JSON.stringify({ smallResistance: 2 }), JSON.stringify({ namePrefix: 'A', nameNumber: '1', overloadDamage: true, showGraph: false, smallResistance: -1, decimals: 2 })])('损坏存储%s回退默认值', async (stored) => {
    const { loadMeterDefaults } = await import('./meterSettings')
    localStorage.setItem(KEY, stored)
    expect(loadMeterDefaults()).toEqual({ namePrefix: 'A', nameNumber: '1', overloadDamage: true, showGraph: false, smallResistance: 0, decimals: 2 })
  })
  it('存储被禁用时读取回退默认值，保存返回false不抛异常', async () => {
    const { loadMeterDefaults, saveMeterDefaults } = await import('./meterSettings')
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const settings = loadMeterDefaults()
    expect(settings.smallResistance).toBe(0)
    expect(saveMeterDefaults(settings)).toBe(false)
  })
})
