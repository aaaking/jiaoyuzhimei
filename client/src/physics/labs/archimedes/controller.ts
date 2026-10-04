import type { JsonValue } from '../../sessions/types'
import type { DerivedMeasurement, LabAction, LabController, LabTransition, Position } from '../../runtime/types'
import {
  INITIAL_POSITIONS, OBJECT_VOLUME, BUCKET_GRAVITY, WATER_WEIGHT_PER_ML,
  OVERFLOW_CAPACITY, BUCKET_CAPACITY, OBJECT_HEIGHT, ML_HEIGHT, CUP_BOTTOM,
  OBJECT_HANG_Y, BUCKET_HANG_Y, HOOK_Y, type Apparatus,
} from './definition'

import { DEFAULT_OBJECT_SETTINGS, OBJECT_MATERIALS, objectGravity, validObjectSettings, type ObjectSettings, type ObjectMaterial } from './objectSettings'
import { DEFAULT_SPRING_SETTINGS, HOOK_WEIGHT, SPRING_TRAVEL, validMeterSettings, type SpringMeterSettings } from './meterSettings'
import { FALLING_APPARATUS, GRAVITY, fallTarget, type FallingApparatus } from './gravity'
import { bucketCatches, pourRemaining, POUR_DURATION } from './waterMotion'

interface Samples {
  objectGravity: number | null
  bucketGravity: number | null
  tension: number | null
  filledBucketGravity: number | null
}
type ReadingSettings = Pick<SpringMeterSettings, 'ownWeight' | 'range' | 'display' | 'decimals'> & { material: ObjectMaterial; wetting: boolean; wetVolume: number }
type SampleSettings = Record<keyof Samples, ReadingSettings | null>
function readingSettings(settings: SpringMeterSettings, object: ObjectSettings = DEFAULT_OBJECT_SETTINGS, wetVolume = 0): ReadingSettings {
  const { ownWeight, range, display, decimals } = settings
  return { ownWeight, range, display, decimals, material: object.material, wetting: object.wetting, wetVolume }
}
const emptySampleSettings = (): SampleSettings => ({ objectGravity: null, bucketGravity: null, tension: null, filledBucketGravity: null })
interface BucketReading { collectedVolume: number; lostVolume: number }
interface ImmersionReading extends BucketReading { submergedVolume: number; bottomContact: boolean; preparedVolume: number }
export interface ArchimedesTrial {
  id: string
  samples: Samples
  sampleSettings: SampleSettings
  immersion: ImmersionReading
  preparedVolume: number
  collectedVolume: number
  lostVolume: number
  valid: boolean
}
export interface ArchimedesState {
  version: 1
  falling: Partial<Record<FallingApparatus, number>>
  cupName: string
  cupRemoved: boolean
  cupTether: boolean
  cupTetherLength: number | null
  bucketLocked: boolean
  bucketRemoved: boolean
  bucketPour: { elapsed: number; volume: number } | null
  objectSettings: ObjectSettings
  objectRemoved: boolean
  objectWetVolume: number
  objectWetCapacity: number
  meterSettings: SpringMeterSettings
  meterRemoved: boolean
  meterDamaged: boolean
  pullExtension: number
  meterTrace: Position[]
  positions: Record<Apparatus, Position>
  attached: 'object' | 'bucket' | null
  liquidVolume: number
  preparedVolume: number
  collectedVolume: number
  lostVolume: number
  lastOverflow: number
  samples: Samples
  sampleSettings: SampleSettings
  immersion: ImmersionReading | null
  bucketReading: BucketReading | null
  trials: ArchimedesTrial[]
  trialSaved: boolean
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const emptySamples = (): Samples => ({ objectGravity: null, bucketGravity: null, tension: null, filledBucketGravity: null })
function initialState(): ArchimedesState {
  return {
    version: 1, falling: {}, cupName: '溢水杯', cupRemoved: false, cupTether: false, cupTetherLength: null, bucketLocked: false, bucketRemoved: false, bucketPour: null, objectSettings: { ...DEFAULT_OBJECT_SETTINGS }, objectRemoved: false, objectWetVolume: 0, objectWetCapacity: 0, meterSettings: { ...DEFAULT_SPRING_SETTINGS }, meterRemoved: false, meterDamaged: false, pullExtension: 0, meterTrace: [], positions: structuredClone(INITIAL_POSITIONS), attached: null,
    liquidVolume: 90, preparedVolume: 90, collectedVolume: 0, lostVolume: 0, lastOverflow: 0,
    samples: emptySamples(), sampleSettings: emptySampleSettings(), immersion: null, bucketReading: null, trials: [], trialSaved: false,
  }
}
function insideCup(state: ArchimedesState) {
  return !state.cupRemoved && Math.abs(state.positions.object.x - state.positions.cup.x) <= 76
    && state.positions.object.y < state.positions.cup.y + CUP_BOTTOM && state.positions.object.y + OBJECT_HEIGHT > state.positions.cup.y
}
function displacementAt(state: ArchimedesState, waterY: number) {
  if (state.objectRemoved || !insideCup(state)) return 0
  return OBJECT_VOLUME * Math.max(0, Math.min(1, (state.positions.object.y + OBJECT_HEIGHT - waterY) / OBJECT_HEIGHT))
}

/** 水面由液体体积和浸入体积共同决定，不能把“收集量”直接当作浮力。 */
export function readingsFor(state: ArchimedesState) {
  const bottom = state.positions.cup.y + CUP_BOTTOM
  let waterY = bottom - state.liquidVolume * ML_HEIGHT
  // 此装置金属块的横截面小于杯子；水位迭代的收敛比例约为 0.27。
  for (let i = 0; i < 28; i++) waterY = bottom - (state.liquidVolume + displacementAt(state, waterY)) * ML_HEIGHT
  const submergedVolume = displacementAt(state, waterY)
  const bottomContact = insideCup(state) && state.positions.object.y + OBJECT_HEIGHT >= bottom - 0.01
  const buoyancy = submergedVolume * WATER_WEIGHT_PER_ML
  const load = state.attached === 'object'
    ? bottomContact ? 0 : Math.max(0, objectGravity(state.objectSettings) + state.objectWetVolume * WATER_WEIGHT_PER_ML - buoyancy)
    : state.attached === 'bucket' ? BUCKET_GRAVITY + state.collectedVolume * WATER_WEIGHT_PER_ML : state.pullExtension / SPRING_TRAVEL * state.meterSettings.range
  const force = state.meterRemoved ? 0 : load + (state.meterSettings.ownWeight ? HOOK_WEIGHT : 0)
  return { waterY, submergedVolume, bottomContact, buoyancy, force }
}

function checkMeter(state: ArchimedesState): ArchimedesState {
  const force = readingsFor(state).force
  return { ...state, meterDamaged: state.meterDamaged || (state.meterSettings.elasticLimit && force > state.meterSettings.range + .001) }
}

function settle(state: ArchimedesState): ArchimedesState {
  if (state.cupRemoved) return checkMeter(state)
  const bottom = state.positions.cup.y + CUP_BOTTOM
  if (state.cupTether && state.cupTetherLength === null && !state.objectRemoved && insideCup(state) && state.positions.object.y + OBJECT_HEIGHT > readingsFor(state).waterY) {
    const p = state.positions.object
    state = { ...state, cupTetherLength: Math.max(OBJECT_HEIGHT + 14, Math.hypot(p.x - state.positions.cup.x, bottom - p.y + 14)), attached: state.attached === 'object' ? null : state.attached }
  }
  if (state.cupTetherLength !== null) {
    const reach = Math.min(76, Math.sqrt(state.cupTetherLength ** 2 - (OBJECT_HEIGHT + 14) ** 2))
    const x = Math.max(state.positions.cup.x - reach, Math.min(state.positions.cup.x + reach, state.positions.object.x))
    const minY = bottom - Math.sqrt(state.cupTetherLength ** 2 - (x - state.positions.cup.x) ** 2) + 14
    state = { ...state, positions: { ...state.positions, object: { x, y: Math.max(minY, Math.min(bottom - OBJECT_HEIGHT, state.positions.object.y)) } } }
  }
  const submerged = readingsFor(state).submergedVolume
  if (state.objectSettings.wetting && submerged > .001 && state.objectWetVolume > 0) {
    state = { ...state, liquidVolume: state.liquidVolume + state.objectWetVolume, objectWetVolume: 0 }
  }
  // 绳和测力计只能向上拉，不能把密度小于水的木块压到漂浮深度以下。
  const density = OBJECT_MATERIALS[state.objectSettings.material].density
  if (!state.objectRemoved && insideCup(state) && density < 1) {
    const waterY = state.positions.cup.y + CUP_BOTTOM - Math.min(OVERFLOW_CAPACITY, state.liquidVolume + density * OBJECT_VOLUME) * ML_HEIGHT
    const minY = state.cupTetherLength === null ? -Infinity : bottom - Math.sqrt(state.cupTetherLength ** 2 - (state.positions.object.x - state.positions.cup.x) ** 2) + 14
    const y = Math.max(minY, Math.min(state.positions.object.y, waterY - OBJECT_HEIGHT * (1 - density)))
    state = { ...state, positions: { ...state.positions, object: { ...state.positions.object, y } } }
  }
  const actualSubmerged = readingsFor(state).submergedVolume
  if (actualSubmerged <= .001 && state.objectWetCapacity > 0) {
    const water = Math.min(state.liquidVolume, state.objectWetCapacity)
    state = { ...state, liquidVolume: state.liquidVolume - water, objectWetVolume: state.objectWetVolume + water, objectWetCapacity: 0 }
  }
  const lipY = state.positions.cup.y + CUP_BOTTOM - OVERFLOW_CAPACITY * ML_HEIGHT
  const overflow = Math.max(0, state.liquidVolume + displacementAt(state, lipY) - OVERFLOW_CAPACITY)
  const catching = bucketCatches(state)
  const caught = catching ? Math.min(overflow, BUCKET_CAPACITY - state.collectedVolume) : 0
  const settled = {
    ...state, liquidVolume: state.liquidVolume - overflow,
    collectedVolume: state.collectedVolume + caught,
    lostVolume: state.lostVolume + overflow - caught, lastOverflow: overflow,
  }
  if (settled.objectSettings.wetting) settled.objectWetCapacity = Math.max(settled.objectWetCapacity, .5 * readingsFor(settled).submergedVolume / OBJECT_VOLUME)
  return checkMeter(settled)
}
function transition(state: ArchimedesState, message: string, accepted = true): LabTransition<ArchimedesState> {
  return { state, feedback: { outcome: accepted ? 'accepted' : 'rejected', message, presentation: 'scene' } }
}
export function automaticSampleKey(state: ArchimedesState): keyof Samples | null {
  const reading = readingsFor(state)
  if (state.trialSaved || state.bucketPour || state.meterRemoved || state.meterDamaged || state.meterSettings.speed !== 0 || reading.force > state.meterSettings.range || state.attached === null) return null
  const key = state.attached === 'object'
    ? reading.submergedVolume <= .01 ? 'objectGravity' : reading.submergedVolume >= OBJECT_VOLUME - .01 && !reading.bottomContact ? 'tension' : null
    : state.collectedVolume > .01 ? 'filledBucketGravity' : state.immersion && state.samples.filledBucketGravity === null ? null : 'bucketGravity'
  return key && state.samples[key] === null ? key : null
}
export function automaticMeasurementReady(state: ArchimedesState) {
  return !state.trialSaved && !state.bucketPour && (automaticSampleKey(state) !== null
    || (Object.values(state.samples).every(value => value !== null) && state.immersion !== null && state.bucketReading !== null))
}
function point(value: unknown): value is Position {
  return typeof value === 'object' && value !== null
    && Number.isFinite((value as Position).x) && Number.isFinite((value as Position).y)
}
function apparatus(value: unknown): value is Apparatus {
  return value === 'meter' || value === 'cup' || value === 'object' || value === 'bucket'
}
function move(state: ArchimedesState, subject: Apparatus, position: Position, snap = true): ArchimedesState {
  if (state.bucketPour && (subject === 'bucket' || (subject === 'meter' && state.attached === 'bucket'))) return state
  const positions = structuredClone(state.positions)
  const falling = { ...state.falling }
  if (subject !== 'meter') delete falling[subject]
  if (subject === 'cup' && state.cupRemoved) return state
  if (subject === 'object' && state.objectRemoved) return state
  if (subject === 'bucket' && (state.bucketRemoved || state.bucketLocked)) return state
  if (state.attached === 'bucket' && state.bucketLocked && subject === 'meter') return state
  if ((subject === 'meter' || subject === state.attached) && state.meterRemoved) return state
  if (subject === 'meter' || subject === state.attached) {
    if (subject === state.attached) position = { x: position.x, y: position.y - (state.positions[subject].y - positions.meter.y) }
    const current = positions.meter
    const direction = state.meterSettings.direction
    position = direction === 'left' ? { x: Math.min(current.x, position.x), y: current.y }
      : direction === 'right' ? { x: Math.max(current.x, position.x), y: current.y }
      : direction === 'up' ? { x: current.x, y: Math.min(current.y, position.y) }
      : direction === 'down' ? { x: current.x, y: Math.max(current.y, position.y) } : position
    positions.meter = position
  } else {
    if (subject === 'cup' && state.cupTetherLength !== null) positions.object = { x: positions.object.x + position.x - positions.cup.x, y: positions.object.y + position.y - positions.cup.y }
    positions[subject] = position
  }
  let attached = state.attached
  if (snap && !state.meterRemoved && !(subject === 'object' && (state.objectRemoved || state.cupTetherLength !== null)) && !(subject === 'bucket' && state.bucketRemoved) && attached === null && (subject === 'object' || subject === 'bucket')) {
    const eye = { x: position.x, y: position.y - (subject === 'object' ? 14 : 55) }
    const hook = { x: positions.meter.x, y: positions.meter.y + HOOK_Y + state.pullExtension }
    if (Math.hypot(eye.x - hook.x, eye.y - hook.y) < 26) attached = subject
  }
  if (snap && subject === 'meter' && !state.meterRemoved && attached === null) {
    const hook = { x: positions.meter.x, y: positions.meter.y + HOOK_Y + state.pullExtension }
    const candidates = (['object', 'bucket'] as const).filter(id => id === 'object' ? !state.objectRemoved && state.cupTetherLength === null : !state.bucketRemoved && !state.bucketLocked && !state.bucketPour)
    const nearby = candidates.map(id => ({ id, distance: Math.hypot(positions[id].x - hook.x, positions[id].y - (id === 'object' ? 14 : 55) - hook.y) })).sort((a, b) => a.distance - b.distance)[0]
    if (nearby && nearby.distance < 26) {
      const target = { x: positions[nearby.id].x, y: positions[nearby.id].y - (nearby.id === 'object' ? OBJECT_HANG_Y : BUCKET_HANG_Y) }
      const previous = positions.meter
      const direction = state.meterSettings.direction
      const reachable = direction === 'none'
        || ((direction === 'left' || direction === 'right') && target.y === previous.y && (direction === 'left' ? target.x <= previous.x : target.x >= previous.x))
        || ((direction === 'up' || direction === 'down') && target.x === previous.x && (direction === 'up' ? target.y <= previous.y : target.y >= previous.y))
      if (reachable) { attached = nearby.id; positions.meter = target }
    }
  }
  if (attached !== null) {
    delete falling[attached]
    positions[attached] = { x: positions.meter.x, y: positions.meter.y + (attached === 'object' ? OBJECT_HANG_Y : BUCKET_HANG_Y) }
    if (!state.cupRemoved && attached === 'object' && Math.abs(positions.object.x - positions.cup.x) <= 76 && positions.object.y < positions.cup.y + CUP_BOTTOM) {
      const bottom = positions.cup.y + CUP_BOTTOM
      if (positions.object.y + OBJECT_HEIGHT > bottom) {
        positions.object.y = bottom - OBJECT_HEIGHT
        positions.meter.y = positions.object.y - OBJECT_HANG_Y
      }
    }
  }
  if (!state.cupRemoved && Math.abs(positions.object.x - positions.cup.x) <= 76 && positions.object.y < positions.cup.y + CUP_BOTTOM) {
    positions.object.y = Math.min(positions.object.y, positions.cup.y + CUP_BOTTOM - OBJECT_HEIGHT)
  }
  const meterTrace = state.meterSettings.showTrace && (positions.meter.x !== state.positions.meter.x || positions.meter.y !== state.positions.meter.y)
    ? [...state.meterTrace, { ...positions.meter }].slice(-180) : state.meterTrace
  return settle({ ...state, attached, positions, falling, meterTrace, pullExtension: attached === null ? state.pullExtension : 0 })
}

function withoutFall(state: ArchimedesState, subject: FallingApparatus) {
  const falling = { ...state.falling }; delete falling[subject]; return falling
}

function queueFalling(state: ArchimedesState): ArchimedesState {
  const falling = { ...state.falling }
  for (const subject of FALLING_APPARATUS) {
    const target = fallTarget(state, subject)
    if (target === null || state.positions[subject].y >= target - .001) {
      delete falling[subject]
      if (target !== null && state.positions[subject].y > target) state = move(state, subject, { ...state.positions[subject], y: target }, false)
    } else falling[subject] ??= 0
  }
  return { ...state, falling }
}

export function trialIssues(trial: ArchimedesTrial): string[] {
  const issues: string[] = []
  const settings = Object.values(trial.sampleSettings)
  if (settings.some(value => value === null)) issues.push('缺少称重时的测力计设置，请重新进行四次称重。')
  else if (settings.some(value => value!.ownWeight !== settings[0]!.ownWeight || value!.range !== settings[0]!.range || value!.display !== settings[0]!.display || value!.decimals !== settings[0]!.decimals)) issues.push('四次称重的测力计设置不一致，请使用相同设置重新测量。')
  if (trial.immersion.bottomContact) issues.push('金属块接触杯底，测力计示数包含支持力的影响。')
  if (trial.preparedVolume < OVERFLOW_CAPACITY - 0.01) issues.push('溢水杯未加满到溢水口，部分排开体积仅使水位升高。')
  if (trial.lostVolume > 0.01) issues.push('排液漏接或被倒掉，收集量不能代表本次排开量。')
  if (Math.abs(trial.collectedVolume - trial.immersion.submergedVolume) > 0.01) issues.push('桶内水量与记录示数时的排开体积不一致；请重新准备一组测量。')
  if (Math.abs(trial.collectedVolume - trial.immersion.collectedVolume) > 0.01) issues.push('桶液称重与液中示数对应的收集量不一致，不能混用不同操作时的读数。')
  if (trial.immersion.submergedVolume <= 0) issues.push('尚未将金属块浸入水中。')
  const baseline = trial.sampleSettings.objectGravity
  const tension = trial.sampleSettings.tension
  if (baseline && tension && (baseline.material !== tension.material || baseline.wetting !== tension.wetting)) issues.push('物体称重与液中示数的材质或沾水设置不一致，请重新测量。')
  if (baseline && baseline.wetVolume > .001) issues.push('空气中称重时物体带有水滴，不能作为干燥物体重使用。')
  return issues
}
function reduce(state: ArchimedesState, action: LabAction): LabTransition<ArchimedesState> {
  switch (action.type) {
    case 'dropPath': {
      const result = reduce(state, { ...action, type: 'movePath' })
      return result.feedback.outcome === 'rejected' ? result : transition(queueFalling(result.state), '器材已松开。')
    }
    case 'dropMove': {
      const result = reduce(state, { ...action, type: 'move' })
      return result.feedback.outcome === 'rejected' ? result : transition(queueFalling(result.state), '器材已松开。')
    }
    case 'advanceGravity': {
      if (typeof action.payload !== 'number' || !Number.isFinite(action.payload) || action.payload <= 0 || action.payload > .1 || Object.keys(state.falling).length === 0) return transition(state, '没有下落中的器材。', false)
      const dt = action.payload
      const falling = { ...state.falling }
      for (const subject of FALLING_APPARATUS) {
        const speed = falling[subject]
        if (speed === undefined) continue
        const target = fallTarget(state, subject)
        if (target === null) { delete falling[subject]; continue }
        const y = Math.min(target, state.positions[subject].y + speed * dt + .5 * GRAVITY * dt * dt)
        state = move(state, subject, { ...state.positions[subject], y }, false)
        if (y >= target - .001 || Math.abs(state.positions[subject].y - y) > .001) delete falling[subject]
        else falling[subject] = speed + GRAVITY * dt
      }
      return transition(queueFalling({ ...state, falling }), '器材正在下落。')
    }
    case 'resetLayout': return transition(settle({ ...state, positions: structuredClone(INITIAL_POSITIONS), falling: {}, attached: null, cupRemoved: false, cupTetherLength: null, meterRemoved: false, objectRemoved: false, bucketRemoved: false, bucketPour: null, pullExtension: 0, meterTrace: [], lastOverflow: 0, meterSettings: { ...state.meterSettings, speed: 0 } }), '器材摆位已复位，水量与记录保留。')
    case 'setCupName': return typeof action.payload === 'string' && action.payload.trim().length > 0 && action.payload.trim().length <= 40
      ? transition({ ...state, cupName: action.payload.trim() }, '溢水杯名称已更新。') : transition(state, '名称需为1～40个字符。', false)
    case 'setCupTether': return typeof action.payload === 'boolean'
      ? transition(settle({ ...state, cupTether: action.payload, cupTetherLength: action.payload ? state.cupTetherLength : null }), action.payload ? '杯内物块浸入液体后连接杯底。' : '杯底连接已解除。') : transition(state, '杯底连接设置无效。', false)
    case 'resetCup': {
      if (state.cupRemoved) return transition(state, '请先恢复溢水杯。', false)
      const lipY = state.positions.cup.y + CUP_BOTTOM - OVERFLOW_CAPACITY * ML_HEIGHT
      const density = OBJECT_MATERIALS[state.objectSettings.material].density
      const displaced = !state.cupTether && density < 1 ? Math.min(displacementAt(state, lipY), density * OBJECT_VOLUME) : displacementAt(state, lipY)
      return transition(settle({ ...state, liquidVolume: OVERFLOW_CAPACITY - displaced, preparedVolume: OVERFLOW_CAPACITY, lastOverflow: 0 }), '溢水杯已恢复默认水位，器材摆位与已有桶水保留。')
    }
    case 'deleteCup': return transition(checkMeter({ ...state, cupRemoved: true, falling: withoutFall(state, 'cup'), cupTetherLength: null, liquidVolume: 0, lostVolume: state.lostVolume + state.liquidVolume, objectWetCapacity: 0, lastOverflow: 0 }), '已删除溢水杯，杯内水计入流失；复位器材摆位可恢复。')
    case 'setBucketLocked': return typeof action.payload === 'boolean'
      ? transition({ ...state, bucketLocked: action.payload, falling: action.payload ? withoutFall(state, 'bucket') : state.falling }, action.payload ? '小桶已锁定。' : '小桶已解锁。') : transition(state, '小桶锁定设置无效。', false)
    case 'deleteBucket': return transition({ ...state, bucketRemoved: true, bucketPour: null, falling: withoutFall(state, 'bucket'), attached: state.attached === 'bucket' ? null : state.attached, lostVolume: state.lostVolume + state.collectedVolume, collectedVolume: 0 }, '已删除小桶，桶内水计为未收集；复位器材摆位可恢复。')
    case 'setObjectSettings': {
      if (!validObjectSettings(action.payload)) return transition(state, '物块设置无效。', false)
      const settings = action.payload
      const water = settings.wetting ? 0 : state.objectWetVolume
      return transition(settle({ ...state, objectSettings: { ...settings }, liquidVolume: state.liquidVolume + (state.cupRemoved ? 0 : water), lostVolume: state.lostVolume + (state.cupRemoved ? water : 0), objectWetVolume: state.objectWetVolume - water, objectWetCapacity: settings.wetting ? state.objectWetCapacity : 0 }), '物块设置已更新。')
    }
    case 'deleteObject': return transition(settle({ ...state, objectRemoved: true, falling: withoutFall(state, 'object'), cupTetherLength: null, attached: state.attached === 'object' ? null : state.attached }), '已删除物块；复位器材摆位可恢复。')
    case 'deleteMeter': return transition({ ...state, attached: null, meterRemoved: true, meterSettings: { ...state.meterSettings, speed: 0 } }, '已删除测力计；复位器材摆位可恢复显示。')
    case 'setMeterSettings': {
      const settings = action.payload as SpringMeterSettings
      if (!validMeterSettings(settings)) return transition(state, '测力计设置无效。', false)
      // 量程变化不应改变此前手动施加的拉力。
      const pullExtension = settings.lockMode === 'none' ? 0 : state.pullExtension * state.meterSettings.range / settings.range
      return transition(checkMeter({ ...state, meterSettings: { ...settings }, pullExtension }), '测力计设置已更新。')
    }
    case 'pullMeterPath': {
      const payload = action.payload as { endpoint?: string; positions?: Position[] } | null
      if (!payload || !Array.isArray(payload.positions) || !payload.positions.every(point)) return transition(state, '端点轨迹无效。', false)
      const result = payload.positions.reduce((result, position) => reduce(result.state, { type: 'previewPullMeter', payload: { endpoint: payload.endpoint, position } }), transition(state, '端点拖动已完成。'))
      return result.feedback.outcome === 'accepted' && result.state.meterSettings.lockMode === 'none'
        ? transition(move(result.state, 'meter', result.state.positions.meter), '端点拖动已完成。') : result
    }
    case 'previewPullMeter':
    case 'pullMeter': {
      const p = action.payload as { endpoint?: string; position?: Position } | null
      if (state.meterRemoved || state.attached !== null || !p || !point(p.position) || !['ring', 'hook'].includes(p.endpoint ?? '')) return transition(state, '请在空载时操作测力计端点。', false)
      const lock = state.meterSettings.lockMode
      if (lock === p.endpoint) return transition(state, p.endpoint === 'ring' ? '吊环已锁定。' : '挂钩已锁定。', false)
      if (lock === 'none') return transition(move(state, 'meter', { x: p.position.x, y: p.position.y - (p.endpoint === 'hook' ? HOOK_Y + state.pullExtension : 0) }, action.type === 'pullMeter'), '测力计已移动。')
      const hookY = state.positions.meter.y + HOOK_Y + state.pullExtension
      const pullExtension = Math.max(0, Math.min(SPRING_TRAVEL * 2, lock === 'ring' ? p.position.y - state.positions.meter.y - HOOK_Y : hookY - p.position.y - HOOK_Y))
      const meter = lock === 'hook' ? { x: state.positions.meter.x, y: hookY - HOOK_Y - pullExtension } : state.positions.meter
      return transition(checkMeter({ ...state, pullExtension, meterTrace: state.meterSettings.showTrace ? [...state.meterTrace, { x: meter.x, y: lock === 'ring' ? meter.y + HOOK_Y + pullExtension : meter.y }].slice(-180) : state.meterTrace, positions: { ...state.positions, meter } }), '弹簧拉伸已更新。')
    }
    case 'advanceMeter': {
      if (state.meterRemoved || typeof action.payload !== 'number' || action.payload <= 0 || action.payload > 1 || state.meterSettings.speed === 0) return transition(state, '测力计未移动。', false)
      const { speed, direction, lockMode } = state.meterSettings
      const step = Math.abs(speed) * action.payload
      const meter = state.positions.meter
      if (lockMode !== 'none' && state.attached === null) {
        const extension = state.pullExtension + Math.sign(speed) * step
        return reduce(state, { type: 'pullMeter', payload: { endpoint: lockMode === 'ring' ? 'hook' : 'ring', position: { x: meter.x, y: lockMode === 'ring' ? meter.y + HOOK_Y + extension : meter.y - Math.sign(speed) * step } } })
      }
      return transition(move(state, 'meter', { x: meter.x + (direction === 'up' || direction === 'down' ? 0 : direction === 'left' ? -step : direction === 'right' ? step : Math.sign(speed) * step), y: meter.y + (direction === 'up' ? -step : direction === 'down' ? step : 0) }), '测力计持续移动中。')
    }
    case 'movePath': {
      const payload = action.payload as { subject?: unknown; positions?: unknown } | null
      if (!payload || !apparatus(payload.subject) || !Array.isArray(payload.positions) || !payload.positions.every(point)) return transition(state, '拖动轨迹无效。', false)
      const subject = payload.subject
      const positions: Position[] = payload.positions
      return transition(positions.reduce((current, position, i) => move(current, subject, position, i === positions.length - 1), state), '拖动已完成。')
    }
    case 'previewMove':
    case 'move': {
      const payload = action.payload as { subject?: unknown; position?: unknown } | null
      if (!payload || !apparatus(payload.subject) || !point(payload.position)) return transition(state, '器材位置无效。', false)
      return transition(move(state, payload.subject, payload.position, action.type === 'move'), '器材位置已更新。')
    }
    case 'detach': {
      if (state.attached === null) return transition(state, '挂钩上没有器材。', false)
      if (state.attached === 'bucket' && state.bucketPour) return transition(state, '请等待小桶回正后再断开。', false)
      const subject = state.attached
      const payload = action.payload as { position?: Position } | undefined
      if (payload !== undefined && (!payload || !point(payload.position))) return transition(state, '断开位置无效。', false)
      const positions = payload ? { ...state.positions, [subject]: { ...payload.position! } } : state.positions
      return transition(queueFalling(settle({ ...state, attached: null, positions })), '挂钩已断开，器材按重力下落。')
    }
    case 'fill':
    case 'setWaterVolume': {
      if (state.cupRemoved) return transition(state, '请先恢复溢水杯。', false)
      if (readingsFor(state).submergedVolume > 0.01) return transition(state, '请先把金属块取出，再调整水位。', false)
      const volume = action.type === 'fill' ? OVERFLOW_CAPACITY : action.payload
      if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > OVERFLOW_CAPACITY) return transition(state, '水量需在 0～90 mL 之间。', false)
      return transition({ ...state, liquidVolume: volume, preparedVolume: volume, lastOverflow: 0 }, '水位已调整；本组测量前请检查接水桶。')
    }
    case 'startBucketPour':
      return state.bucketRemoved || state.collectedVolume <= .001 || state.bucketPour
        ? transition(state, '小桶为空或正在倾倒。', false)
        : transition({ ...state, bucketPour: { elapsed: 0, volume: state.collectedVolume }, falling: withoutFall(state, 'bucket') }, '小桶开始倾倒，倒完后自动回正。')
    case 'advanceBucketPour': {
      if (!state.bucketPour || typeof action.payload !== 'number' || !Number.isFinite(action.payload) || action.payload <= 0 || action.payload > .1) return transition(state, '小桶未倾倒。', false)
      const elapsed = Math.min(POUR_DURATION, state.bucketPour.elapsed + action.payload)
      const collectedVolume = Math.min(state.collectedVolume, pourRemaining(state.bucketPour.volume, elapsed))
      const next = { ...state, collectedVolume, lostVolume: state.lostVolume + state.collectedVolume - collectedVolume, bucketPour: elapsed >= POUR_DURATION ? null : { ...state.bucketPour, elapsed } }
      return transition(next.bucketPour ? checkMeter(next) : queueFalling(checkMeter(next)), '小桶倾倒中。')
    }
    case 'emptyBucket':
      return transition({ ...state, bucketPour: null, lostVolume: state.lostVolume + state.collectedVolume, collectedVolume: 0, lastOverflow: 0 }, '已倒空小桶。重新测量请开始下一组。')
    case 'autoMeasure': {
      if (!automaticMeasurementReady(state)) return transition(state, '当前没有待记录的稳定示数。', false)
      if (!automaticSampleKey(state)) return reduce(state, { type: 'recordTrial' })
      const measured = reduce(state, { type: 'recordReading' })
      return Object.values(measured.state.samples).every(value => value !== null)
        ? reduce(measured.state, { type: 'recordTrial' }) : measured
    }
    case 'recordReading': {
      if (state.bucketPour) return transition(state, '请等待小桶倒完并回正后再记录示数。', false)
      const reading = readingsFor(state)
      if (state.meterRemoved || state.meterDamaged || reading.force > state.meterSettings.range) return transition(state, '测力计已删除、损坏或超量程，无法记录有效示数。', false)
      if (state.attached === null) return transition(state, '请先将金属块或小桶拖到测力计挂钩。', false)
      const force = state.meterSettings.display === 'mass'
        ? round(Number((reading.force / 9.8 * 1000).toFixed(state.meterSettings.decimals)) * 9.8 / 1000)
        : Number(reading.force.toFixed(state.meterSettings.decimals))
      const settings = readingSettings(state.meterSettings, state.objectSettings, state.objectWetVolume)
      if (state.attached === 'object' && reading.submergedVolume > 0.01) {
        return transition({ ...state, samples: { ...state.samples, tension: force }, sampleSettings: { ...state.sampleSettings, tension: settings }, immersion: { submergedVolume: reading.submergedVolume, bottomContact: reading.bottomContact, preparedVolume: state.preparedVolume, collectedVolume: state.collectedVolume, lostVolume: state.lostVolume } }, `已记录液中示数 F示 = ${force.toFixed(2)} N。`)
      }
      const key = state.attached === 'object' ? 'objectGravity' : state.collectedVolume > 0.01 || (state.immersion !== null && state.samples.filledBucketGravity === null) ? 'filledBucketGravity' : 'bucketGravity'
      const name = key === 'objectGravity' ? '物体重' : key === 'bucketGravity' ? '空桶重' : '桶液总重'
      return transition({ ...state, samples: { ...state.samples, [key]: force }, sampleSettings: { ...state.sampleSettings, [key]: settings }, ...(key === 'filledBucketGravity' ? { bucketReading: { collectedVolume: state.collectedVolume, lostVolume: state.lostVolume } } : {}) }, `已记录${name} ${force.toFixed(2)} N。`)
    }
    case 'recordTrial': {
      if (state.trialSaved) return transition(state, '本组已记录，请开始下一组。', false)
      if (Object.values(state.samples).some(value => value === null) || state.immersion === null || state.bucketReading === null) return transition(state, '请先记录物体重、空桶重、液中示数和桶液总重。', false)
      const trial: ArchimedesTrial = {
        id: `trial-${state.trials.length + 1}`, samples: { ...state.samples }, sampleSettings: structuredClone(state.sampleSettings), immersion: { ...state.immersion },
        preparedVolume: state.immersion.preparedVolume, collectedVolume: state.bucketReading.collectedVolume,
        lostVolume: Math.max(state.immersion.lostVolume, state.bucketReading.lostVolume), valid: false,
      }
      trial.valid = trialIssues(trial).length === 0 && Math.abs(buoyancyFor(trial) - displacedGravityFor(trial)) <= 0.02
      return transition({ ...state, trials: [...state.trials, trial], trialSaved: true }, trial.valid ? '已记录本组：浮力与排液重力在读数精度内相等。' : '已记录本组偏差，请在实验数据中检查原因。')
    }
    case 'newTrial': return transition({ ...initialState(), trials: state.trials }, '下一组已准备好：重新进行四次称重。')
    default: return transition(state, '未知操作。', false)
  }
}
const buoyancyFor = (trial: ArchimedesTrial) => round((trial.samples.objectGravity ?? 0) - (trial.samples.tension ?? 0))
const displacedGravityFor = (trial: ArchimedesTrial) => round((trial.samples.filledBucketGravity ?? 0) - (trial.samples.bucketGravity ?? 0))

function measurements(trial: ArchimedesTrial): DerivedMeasurement[] {
  return [
    ...([['objectGravity', '物体重 G物'], ['bucketGravity', '空桶重 G空桶'], ['tension', '液中示数 F示'], ['filledBucketGravity', '桶液总重 G桶液']] as const)
      .map(([key, label]) => ({ trialId: trial.id, key, label, value: trial.samples[key] ?? '未记录', unit: 'N', kind: 'raw' as const })),
    { trialId: trial.id, key: 'buoyancy', label: '浮力 F浮', value: buoyancyFor(trial), unit: 'N', kind: 'derived' },
    { trialId: trial.id, key: 'displacedLiquidGravity', label: '排液重力 G排', value: displacedGravityFor(trial), unit: 'N', kind: 'derived' },
    { trialId: trial.id, key: 'difference', label: 'F浮 − G排', value: round(buoyancyFor(trial) - displacedGravityFor(trial)), unit: 'N', kind: 'derived' },
    { trialId: trial.id, key: 'observation', label: '测量条件', value: trial.valid ? '排液完整收集，物体未碰底' : trialIssues(trial).join(' ') || '两种测量结果存在偏差。', unit: '', kind: 'observation' },
  ]
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function validSamples(value: unknown): value is Samples {
  if (typeof value !== 'object' || value === null) return false
  return Object.keys(emptySamples()).every(key => {
    const reading = (value as Record<string, unknown>)[key]
    return reading === null || (finite(reading) && reading >= 0 && reading <= 5)
  })
}
function validSampleSettings(value: unknown): value is SampleSettings {
  if (typeof value !== 'object' || value === null) return false
  return Object.keys(emptySamples()).every(key => {
    const settings = (value as SampleSettings)[key as keyof Samples]
    return settings === null || (typeof settings === 'object' && ['ownWeight', 'range', 'display', 'decimals'].every(field => Object.hasOwn(settings, field)) && validMeterSettings({ ...DEFAULT_SPRING_SETTINGS, ...settings }) && Object.hasOwn(OBJECT_MATERIALS, settings.material) && typeof settings.wetting === 'boolean' && finite(settings.wetVolume) && settings.wetVolume >= 0 && settings.wetVolume <= .5)
  })
}
function legacySampleSettings(samples: Samples): SampleSettings {
  return Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, value === null ? null : readingSettings(DEFAULT_SPRING_SETTINGS)])) as SampleSettings
}
function validImmersion(value: unknown): value is ImmersionReading {
  return typeof value === 'object' && value !== null
    && finite((value as ImmersionReading).submergedVolume) && (value as ImmersionReading).submergedVolume >= 0
    && (value as ImmersionReading).submergedVolume <= OBJECT_VOLUME + 0.001 && typeof (value as ImmersionReading).bottomContact === 'boolean'
    && finite((value as ImmersionReading).preparedVolume) && (value as ImmersionReading).preparedVolume >= 0 && (value as ImmersionReading).preparedVolume <= 90
    && validBucketReading(value)
}
function validBucketReading(value: unknown): value is BucketReading {
  if (typeof value !== 'object' || value === null) return false
  const reading = value as BucketReading
  return finite(reading.collectedVolume) && reading.collectedVolume >= 0 && reading.collectedVolume <= BUCKET_CAPACITY && finite(reading.lostVolume) && reading.lostVolume >= 0
}
function restore(snapshot: unknown): ArchimedesState {
  if (typeof snapshot !== 'object' || snapshot === null) return initialState()
  const legacy = (snapshot as ArchimedesState).meterSettings === undefined
  const oldObject = (snapshot as ArchimedesState).objectSettings === undefined
  const migrateSettings = (settings: SampleSettings | undefined) => settings && Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value === null ? null : oldObject ? { ...value, material: 'copper', wetting: false, wetVolume: 0 } : value])) as SampleSettings | undefined
  const s = { ...(snapshot as ArchimedesState),
    falling: (snapshot as ArchimedesState).falling ?? {},
    cupName: (snapshot as ArchimedesState).cupName ?? '溢水杯',
    cupRemoved: (snapshot as ArchimedesState).cupRemoved ?? false,
    cupTether: (snapshot as ArchimedesState).cupTether ?? false,
    cupTetherLength: (snapshot as ArchimedesState).cupTetherLength ?? null,
    bucketLocked: (snapshot as ArchimedesState).bucketLocked ?? false,
    bucketRemoved: (snapshot as ArchimedesState).bucketRemoved ?? false,
    bucketPour: (snapshot as ArchimedesState).bucketPour ?? null,
    objectSettings: (snapshot as ArchimedesState).objectSettings ?? { ...DEFAULT_OBJECT_SETTINGS },
    objectRemoved: (snapshot as ArchimedesState).objectRemoved ?? false,
    objectWetVolume: (snapshot as ArchimedesState).objectWetVolume ?? 0,
    objectWetCapacity: (snapshot as ArchimedesState).objectWetCapacity ?? 0,
    trials: Array.isArray((snapshot as ArchimedesState).trials) ? (snapshot as ArchimedesState).trials.map(t => ({ ...t, sampleSettings: migrateSettings(t?.sampleSettings) })) : [],
    meterSettings: (snapshot as ArchimedesState).meterSettings ?? { ...DEFAULT_SPRING_SETTINGS },
    meterRemoved: (snapshot as ArchimedesState).meterRemoved ?? false,
    meterDamaged: (snapshot as ArchimedesState).meterDamaged ?? false,
    pullExtension: (snapshot as ArchimedesState).pullExtension ?? 0,
    meterTrace: (snapshot as ArchimedesState).meterTrace ?? [],
    sampleSettings: migrateSettings((snapshot as ArchimedesState).sampleSettings) ?? emptySampleSettings(),
  }
  if (s.version !== 1 || typeof s.falling !== 'object' || s.falling === null || Array.isArray(s.falling) || !Object.entries(s.falling).every(([key, speed]) => FALLING_APPARATUS.includes(key as FallingApparatus) && finite(speed) && speed >= 0)
    || typeof s.cupName !== 'string' || !s.cupName.trim() || s.cupName.length > 40 || typeof s.cupRemoved !== 'boolean' || typeof s.cupTether !== 'boolean'
    || (s.cupRemoved && (s.liquidVolume !== 0 || s.cupTetherLength !== null))
    || (s.cupTetherLength !== null && (!finite(s.cupTetherLength) || s.cupTetherLength < OBJECT_HEIGHT + 14 || !s.cupTether || s.objectRemoved || s.attached === 'object'))
    || typeof s.bucketLocked !== 'boolean' || typeof s.bucketRemoved !== 'boolean' || (s.bucketRemoved && (s.attached === 'bucket' || s.collectedVolume > 0 || s.bucketPour !== null))
    || (s.bucketPour !== null && (typeof s.bucketPour !== 'object' || !finite(s.bucketPour.elapsed) || s.bucketPour.elapsed < 0 || s.bucketPour.elapsed >= POUR_DURATION || !finite(s.bucketPour.volume) || s.bucketPour.volume <= 0 || s.bucketPour.volume > BUCKET_CAPACITY || s.collectedVolume > s.bucketPour.volume))
    || !validObjectSettings(s.objectSettings) || typeof s.objectRemoved !== 'boolean' || ![s.objectWetVolume, s.objectWetCapacity].every(v => finite(v) && v >= 0 && v <= .5) || !validMeterSettings(s.meterSettings) || typeof s.meterRemoved !== 'boolean' || typeof s.meterDamaged !== 'boolean' || !finite(s.pullExtension) || s.pullExtension < 0 || !Array.isArray(s.meterTrace) || s.meterTrace.length > 180 || !s.meterTrace.every(point) || !s.positions || !Object.keys(INITIAL_POSITIONS).every(id => point(s.positions[id as Apparatus]))
    || !Object.keys(s.falling).every(key => fallTarget(s, key as FallingApparatus) !== null)
    || (s.attached !== null && s.attached !== 'object' && s.attached !== 'bucket')
    || ![s.liquidVolume, s.preparedVolume].every(v => finite(v) && v >= 0 && v <= 90)
    || !finite(s.collectedVolume) || s.collectedVolume < 0 || s.collectedVolume > BUCKET_CAPACITY
    || !finite(s.lostVolume) || s.lostVolume < 0 || !finite(s.lastOverflow) || s.lastOverflow < 0
    || !validSamples(s.samples) || !validSampleSettings(s.sampleSettings) || (s.immersion !== null && !validImmersion(s.immersion))
    || (s.bucketReading !== null && !validBucketReading(s.bucketReading))
    || typeof s.trialSaved !== 'boolean' || !Array.isArray(s.trials)
    || !s.trials.every(t => t && typeof t.id === 'string' && validSamples(t.samples) && Object.values(t.samples).every(finite)
      && (t.sampleSettings === undefined || validSampleSettings(t.sampleSettings))
      && validImmersion(t.immersion) && finite(t.preparedVolume) && t.preparedVolume >= 0 && t.preparedVolume <= 90
      && finite(t.collectedVolume) && t.collectedVolume >= 0 && t.collectedVolume <= BUCKET_CAPACITY && finite(t.lostVolume) && t.lostVolume >= 0)) return initialState()
  const restored = structuredClone(s)
  if (legacy) restored.sampleSettings = legacySampleSettings(restored.samples)
  return { ...restored, trials: restored.trials.map(t => {
    const trial = { ...t, sampleSettings: t.sampleSettings ?? (legacy ? legacySampleSettings(t.samples) : emptySampleSettings()) }
    trial.valid = trialIssues(trial).length === 0 && Math.abs(buoyancyFor(trial) - displacedGravityFor(trial)) <= 0.02
    return trial
  }) }
}

export const archimedesController: LabController<ArchimedesState> = {
  createInitialState: initialState, reduce, isSimulationAction: action => action.type === 'advanceMeter' || action.type === 'advanceGravity' || action.type === 'advanceBucketPour' || action.type === 'autoMeasure',
  snapshot: state => JSON.parse(JSON.stringify(state)) as JsonValue, restore,
  deriveMeasurements: state => state.trials.flatMap(measurements),
  measurementGroups: state => state.trials.map(trial => ({
    conditions: [{ label: '浸入体积 / mL', value: round(trial.immersion.submergedVolume) }, { label: '收集量 / mL', value: round(trial.collectedVolume) }],
    measurements: measurements(trial),
  })),
  completion: state => ({ complete: state.trials.some(t => t.valid), message: state.trials.some(t => t.valid) ? '已通过独立称重验证浮力与排液重力的关系。' : '至少完成一组排液完整收集、物体未碰底的四次称重。' }),
  report: state => ({
    calculationResults: state.trials.map((trial, i) => `第 ${i + 1} 组：F浮 = ${buoyancyFor(trial).toFixed(2)} N，G排 = ${displacedGravityFor(trial).toFixed(2)} N，差值 = ${round(buoyancyFor(trial) - displacedGravityFor(trial)).toFixed(2)} N。`),
    conclusion: state.trials.some(t => t.valid) ? ['有效测量中，浮力与排开液体所受重力在读数精度内相等，支持阿基米德原理。'] : ['当前记录尚不足以验证阿基米德原理，请检查测量条件后重新实验。'],
    errorAnalysis: [...new Set(state.trials.flatMap(trialIssues)), '读数按称重时的小数位设置记录；质量显示换算为牛顿。沾水模型最多保留0.5mL水滴，不计随机读数误差。'],
  }),
}
