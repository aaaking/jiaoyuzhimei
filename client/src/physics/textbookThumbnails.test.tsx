// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import TextbookPhysicsCatalog from './TextbookPhysicsCatalog'
import { textbookPhysicsExperiments } from './curriculum/catalog'

function catalog() {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<MemoryRouter><TextbookPhysicsCatalog /></MemoryRouter>)
  return host
}

afterEach(() => vi.unstubAllEnvs())

describe('教材实验主视觉缩略图', () => {
  it('子路径部署时图片跟随实际部署基础路径', () => {
    vi.stubEnv('BASE_URL', '/jiaoyuzhimei/')
    const images = catalog().querySelectorAll('a img')
    expect(images).toHaveLength(4)
    for (const image of images) {
      expect(image.getAttribute('src')).toMatch(/^\/jiaoyuzhimei\/physics\/thumbnails\/[^/]+\.png$/)
    }
  })
  it('四个可用实验的图片在章节与名称之间，沿用正确的详情链接', () => {
    const host = catalog()
    const available = textbookPhysicsExperiments.filter(item => item.availability === 'available')
    expect(host.querySelectorAll('a img')).toHaveLength(available.length)
    for (const item of available) {
      const card = host.querySelector(`a[href="/physics/labs/${item.id}"]`)!
      const image = card.querySelector('img')!
      expect(image.alt).toBe(`${item.title}实验主视觉`)
      expect(image.previousElementSibling?.textContent).toContain(item.chapter)
      expect(image.nextElementSibling?.tagName).toBe('H3')
      expect(image.nextElementSibling?.textContent).toBe(item.title)
      expect(card.querySelector('p')?.textContent).toBe(item.purpose[0])
      expect(card.firstElementChild?.textContent).toContain('必做')
      expect(card.lastElementChild?.textContent).toContain(item.sourceType)
      expect(card.lastElementChild?.textContent).toContain('进入实验')
    }
  })
  it('每个缩略图都对应有效的 640×360 PNG，制作中实验保持不可进入', () => {
    const host = catalog()
    for (const image of host.querySelectorAll('a img')) {
      const source = image.getAttribute('src')!
      const data = readFileSync(join(process.cwd(), 'public', source.slice(1)))
      expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([640, 360])
    }
    for (const card of host.querySelectorAll('[aria-disabled="true"]')) {
      expect(card.querySelector('a,img')).toBeNull()
      expect(card.textContent).toContain('制作中')
    }
  })
})
