import type { Position } from '../../runtime/types'

export type Apparatus = 'meter' | 'cup' | 'bucket' | 'object'
export const APPARATUS_LABELS: Record<Apparatus, string> = { meter: '弹簧测力计', cup: '溢水杯', bucket: '接水桶', object: '金属块' }
// 尺寸按用户提供的竞品截图建立；物理量使用 mL、N，g 取 9.8 N/kg。
export const INITIAL_POSITIONS: Record<Apparatus, Position> = {
  meter: { x: 474, y: 100 }, cup: { x: 195, y: 210 },
  bucket: { x: 363, y: 378 }, object: { x: 474, y: 415 },
}
export const OBJECT_VOLUME = 10
export const OBJECT_GRAVITY = 0.09 * 9.8
export const BUCKET_GRAVITY = 0.2
export const WATER_WEIGHT_PER_ML = 0.0098
export const OVERFLOW_CAPACITY = 90
export const BUCKET_CAPACITY = 120
export const OBJECT_HEIGHT = 78
export const ML_HEIGHT = 2.1
export const CUP_BOTTOM = 274
export const HOOK_Y = 220
export const OBJECT_HANG_Y = 300
export const BUCKET_HANG_Y = 275

export const REPORT_SECTIONS = [
  { title: '目的', paragraphs: ['通过称重法测量浮力，并与收集到的排开液体所受重力进行比较，探究阿基米德原理。'] },
  { title: '原理', paragraphs: ['物体悬挂在液体中且不碰杯底时：F浮 = G物 − F示。', '排开液体所受的重力：G排 = G桶液 − G空桶。比较两个独立测量结果。'] },
  { title: '器材', paragraphs: ['弹簧测力计（0～5 N，分度值 0.1 N）、金属块、溢水杯、小桶、水、细线。数值读数保留两位小数。'] },
  { title: '步骤', paragraphs: ['1. 将金属块吊环拖到测力计挂钩（或移动测力计靠近吊环），在空气中保持静止，示数自动记录到“实验数据”。', '2. 小桶置于溢水口下方，溢水杯加满水。提起物块，从杯口上方逐步浸没；完全浸没且不碰杯底，静止后自动记录液中示数，同时收集排开的水。', '3. 提起物块离开水面，点击“摘下器材”；挂上装有排开水的小桶，静止后自动记录桶液总重。', '4. 点击“倒空小桶”，回正后自动记录空桶重并保存本组数据，比较 F浮 = G物 − F示 与 G排 = G桶液 − G空桶。也可先测空桶重再开始物块实验。', '5. 点击“下一组”，在金属块设置中改换铜、铁或铝块，重复四次称重，检验是否仍有 F浮 = G排。'] },
  { title: '结论', paragraphs: ['在排液完整收集、物体不碰杯底等条件满足时，物体受到的浮力等于它排开液体所受的重力：F浮 = G排。'] },
  { title: '补充', paragraphs: ['水未加满或漏接排液会使测得的 G排 偏小。物体碰底时，杯底支持力也会使测力计示数减小，不能全部当成浮力。', '取出物体后，已排出的水不会回流。重复浸入前需检查水位，并重新准备接水桶。默认不计沾水；开启物块的沾水选项后，取出会携带少量水滴并影响称重。不模拟蒸发和读数随机误差。'] },
]
