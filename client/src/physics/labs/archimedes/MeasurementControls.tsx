import type { PhysicsLabSceneProps } from '../../runtime/PhysicsLabShell'
import { readingsFor, type ArchimedesState } from './controller'

const labels = [['objectGravity', '物体重 G物'], ['tension', '液中示数 F示'], ['filledBucketGravity', '桶液总重 G桶液'], ['bucketGravity', '空桶重 G空桶']] as const
const button = 'rounded-md border border-[#dedad2] px-3 py-2 text-sm disabled:opacity-40'

export default function MeasurementControls({ state, dispatch, readOnly }: PhysicsLabSceneProps<ArchimedesState>) {
  const reading = readingsFor(state)
  return <section aria-label="本组测量" className="space-y-3 text-sm text-[#4b4742]">
    <p>将器材吊环拖到挂钩，松手并保持静止后自动记录。物块完全浸没且不碰杯底时，自动记录液中示数。</p>
    <p>当前示数：<strong className="font-mono">{reading.force.toFixed(state.meterSettings.decimals)} N</strong></p>
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-label="摘下器材" disabled={readOnly || state.attached === null || (state.attached === 'bucket' && !!state.bucketPour)} onClick={() => dispatch({ type: 'detach' })} className={button}>摘下器材</button>
      <button type="button" aria-label="倒空小桶" disabled={readOnly || state.bucketRemoved || !!state.bucketPour || state.collectedVolume <= .001} onClick={() => dispatch({ type: 'startBucketPour' })} className={button}>倒空小桶</button>
      <button type="button" aria-label="溢水杯加满水" disabled={readOnly || state.cupRemoved || reading.submergedVolume > .01} onClick={() => dispatch({ type: 'fill' })} className={button}>加满水</button>
    </div>
    <table className="w-full text-left"><caption className="mb-2 text-left font-semibold">本组实验数据</caption><tbody>{labels.map(([key, label]) => <tr key={key} className="border-b border-[#ece8df]"><th className="py-2 font-normal">{label}</th><td className="text-right font-mono">{state.samples[key] === null ? '未记录' : `${state.samples[key].toFixed(2)} N`}</td></tr>)}</tbody></table>
    <p>{state.trialSaved ? '本组数据已自动保存，可比较浮力与排液重力。' : '挂起装水小桶后自动记录桶液总重，倒空并回正后自动记录空桶重。四项齐全后自动保存本组数据。'}</p>
    <button type="button" aria-label="开始下一组实验" disabled={readOnly} onClick={() => dispatch({ type: 'newTrial' })} className={button}>下一组（补水并清空本组读数）</button>
  </section>
}
