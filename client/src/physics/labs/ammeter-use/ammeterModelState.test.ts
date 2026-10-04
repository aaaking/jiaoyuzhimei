import { describe, expect, it } from 'vitest'
import { getPartOffset, nextModelState } from './ammeterModelState'

describe('ammeter model assembly', () => {
  it('separates the five functional layers so the mechanism can be inspected', () => {
    expect(getPartOffset('case', true)).toEqual([0, 0, -0.55])
    expect(getPartOffset('mechanism', true)).toEqual([0, 0, 0.25])
    expect(getPartOffset('dial', true)).toEqual([0, 0, 0.9])
    expect(getPartOffset('glass', true)).toEqual([0, 0, 1.45])
    expect(getPartOffset('terminals', true)).toEqual([0, -0.75, 1.2])
  })

  it('returns every part to its assembled position and requests camera reset', () => {
    const exploded = nextModelState({ exploded: false, cameraRevision: 0 }, 'toggle')
    expect(exploded.exploded).toBe(true)
    expect(getPartOffset('glass', false)).toEqual([0, 0, 0])

    expect(nextModelState(exploded, 'reset')).toEqual({ exploded: false, cameraRevision: 1 })
    expect(nextModelState(exploded, 'toggle')).toEqual({ exploded: false, cameraRevision: 0 })
  })
})
