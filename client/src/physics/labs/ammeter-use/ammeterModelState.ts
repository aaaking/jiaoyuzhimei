export type ModelPart = 'case' | 'mechanism' | 'dial' | 'glass' | 'terminals'
export type ModelState = { exploded: boolean; cameraRevision: number }

const explodedOffsets: Record<ModelPart, [number, number, number]> = {
  case: [0, 0, -0.55],
  mechanism: [0, 0, 0.25],
  dial: [0, 0, 0.9],
  glass: [0, 0, 1.45],
  terminals: [0, -0.75, 1.2],
}

export function getPartOffset(part: ModelPart, exploded: boolean): [number, number, number] {
  return exploded ? explodedOffsets[part] : [0, 0, 0]
}

export function nextModelState(state: ModelState, action: 'toggle' | 'reset'): ModelState {
  if (action === 'reset') return { exploded: false, cameraRevision: state.cameraRevision + 1 }
  return { ...state, exploded: !state.exploded }
}
