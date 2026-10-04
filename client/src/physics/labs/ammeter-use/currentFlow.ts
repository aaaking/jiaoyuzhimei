import { evaluatePracticeCircuit, type PracticeState } from './practiceController'
import { wireKey } from './layout'

/** 使用各导线的实际支路电流，反接、旁路及无电表回路也能正确展示。 */
export function currentWireDirections(state: PracticeState): Map<string, 1 | -1> {
  const result = new Map<string, 1 | -1>()
  const currents = evaluatePracticeCircuit(state).wireCurrents
  state.edges.forEach((edge, i) => {
    if (Math.abs(currents[i]) > 1e-8) result.set(wireKey(edge.from, edge.to), currents[i] > 0 ? 1 : -1)
  })
  return result
}
