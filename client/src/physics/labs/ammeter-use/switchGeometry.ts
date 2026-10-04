/** 图像、选中背景和操作栏共用旋转后的器材边界。 */
export function switchBodyBounds(x: number, y: number, angle: number, part: { width: number; height: number; anchorX: number; anchorY: number; scale: number }) {
  const radians = angle * Math.PI / 180
  const points = [[0, 0], [part.width, 0], [0, part.height], [part.width, part.height]].map(([px, py]) => {
    const dx = (px - part.anchorX) * part.scale, dy = (py - part.anchorY) * part.scale
    return { x: x + dx * Math.cos(radians) - dy * Math.sin(radians), y: y + dx * Math.sin(radians) + dy * Math.cos(radians) }
  })
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }
}
