import * as THREE from 'three'

const offsets = {
  case: [-1.45, 0, -.35], ring: [-1.45, .5, -.35], spring: [0, .35, 0],
  pointer: [.75, -.6, .15], scale: [1.7, 0, .5], cover: [3, 0, 1],
} satisfies Record<string, [number, number, number]>
type Part = keyof typeof offsets

class Coil extends THREE.Curve<THREE.Vector3> {
  constructor() { super() }
  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2 * 18
    return target.set(Math.cos(angle) * .13, 1.94 - t * .55, Math.sin(angle) * .13 - .02)
  }
}

export function createSpringMeterModel() {
  const root = new THREE.Group()
  const parts = Object.fromEntries(Object.keys(offsets).map(name => {
    const group = new THREE.Group()
    group.name = name
    root.add(group)
    return [name, group]
  })) as Record<Part, THREE.Group>
  const blue = new THREE.MeshStandardMaterial({ color: '#258ed1', roughness: .4 })
  const steel = new THREE.MeshStandardMaterial({ color: '#d3d9dd', metalness: .85, roughness: .24 })
  const white = new THREE.MeshStandardMaterial({ color: '#fff8df', roughness: .8 })
  const red = new THREE.MeshStandardMaterial({ color: '#ef3434', roughness: .4 })
  const ink = new THREE.MeshBasicMaterial({ color: '#34424a' })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#cde8ed', transparent: true, opacity: .13, roughness: .12, depthWrite: false, side: THREE.DoubleSide })
  function mesh(part: Part, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const result = new THREE.Mesh(geometry, material)
    result.position.set(x, y, z)
    parts[part].add(result)
    return result
  }
  function box(part: Part, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
    return mesh(part, new THREE.BoxGeometry(w, h, d), material, x, y, z)
  }
  const outline = new THREE.Shape()
  outline.moveTo(-.55, -2.05)
  outline.lineTo(-.55, 2.05)
  outline.quadraticCurveTo(-.55, 2.3, -.3, 2.3)
  outline.lineTo(.3, 2.3)
  outline.quadraticCurveTo(.55, 2.3, .55, 2.05)
  outline.lineTo(.55, -2.05)
  outline.quadraticCurveTo(.55, -2.3, .3, -2.3)
  outline.lineTo(-.3, -2.3)
  outline.quadraticCurveTo(-.55, -2.3, -.55, -2.05)
  mesh('case', new THREE.ExtrudeGeometry(outline, { depth: .12, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 3, steps: 1 }), blue, 0, 0, -.26)
  for (const x of [-.49, .49]) box('case', .12, 4.1, .42, blue, x)
  for (const y of [-2.14, 2.14]) box('case', .98, .28, .42, blue, 0, y)
  for (const x of [-.38, .38]) for (const y of [-2.12, 2.12]) {
    const screw = mesh('case', new THREE.CylinderGeometry(.04, .04, .025, 16), steel, x, y, .23)
    screw.rotation.x = Math.PI / 2
  }
  const ring = mesh('ring', new THREE.TorusGeometry(.28, .045, 12, 48), steel, 0, 2.72)
  ring.scale.y = 1.5
  box('ring', .07, .25, .08, steel, 0, 2.28)
  mesh('spring', new THREE.TubeGeometry(new Coil(), 720, .012, 8, false), steel)
  box('spring', .07, .18, .07, steel, 0, 2.03, -.02)
  box('pointer', .04, 3.85, .04, steel, 0, -.5, -.02)
  box('pointer', .43, .035, .06, red, 0, 1.4, .27)
  box('pointer', .035, .035, .3, steel, 0, 1.4, .1)
  const hook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -2.42, 0), new THREE.Vector3(0, -2.68, 0),
    new THREE.Vector3(-.18, -2.88, 0), new THREE.Vector3(-.14, -3.18, 0),
    new THREE.Vector3(.12, -3.25, 0), new THREE.Vector3(.25, -3.04, 0),
  ])
  mesh('pointer', new THREE.TubeGeometry(hook, 48, .036, 10, false), steel)
  box('scale', .84, 4.12, .04, white, 0, 0, .17)
  for (let i = 0; i <= 50; i++) {
    const width = i % 10 === 0 ? .18 : i % 5 === 0 ? .13 : .08
    box('scale', width, .008, .005, ink, -.05, 1.4 - i * .066, .195)
  }
  box('scale', .009, 3.3, .006, ink, .04, -.25, .195)
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 2048
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#34424a'
    context.textAlign = 'center'
    context.font = '60px Arial'
    context.fillText('N', 105, 112)
    context.fillText('g', 414, 112)
    for (let i = 0; i <= 5; i++) {
      const y = (2.06 - (1.4 - i * .66)) / 4.12 * 2048 + 20
      context.fillText(String(i), 112, y)
      context.font = '42px Arial'
      context.fillText(String(Math.round(i / 9.8 * 1000)), 405, y)
      context.font = '60px Arial'
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    mesh('scale', new THREE.PlaneGeometry(.84, 4.12), new THREE.MeshBasicMaterial({ map: texture, transparent: true }), 0, 0, .201)
  }
  box('cover', .85, 4.12, .02, glass, 0, 0, .31)
  for (const x of [-.44, .44]) box('cover', .025, 4.16, .025, blue, x, 0, .31)
  for (const y of [-2.07, 2.07]) box('cover', .89, .025, .025, blue, 0, y, .31)
  return {
    root, parts,
    setExploded(exploded: boolean) {
      for (const name of Object.keys(parts) as Part[]) {
        const [x, y, z] = exploded ? offsets[name] : [0, 0, 0]
        parts[name].position.set(x, y, z)
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      })
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => {
        if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose()
        material.dispose()
      })
    },
  }
}
