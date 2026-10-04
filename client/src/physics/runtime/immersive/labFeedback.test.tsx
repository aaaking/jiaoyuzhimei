// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import ImmersiveLabStage from './ImmersiveLabStage'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter><ImmersiveLabStage title="练习使用电流表" editableTitleStorageKey="feedback-title" backTo="/physics" showActionLabels><div /></ImmersiveLabStage></MemoryRouter>))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })
function openFeedback() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="反馈"]')
  expect(button, '顶部应有反馈入口').toBeTruthy()
  act(() => button!.click())
  return host.querySelector<HTMLDialogElement>('dialog[aria-label="实验反馈"]')!
}
function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
  act(() => { field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('实验反馈入口', () => {
  it('默认带入当前显示标题，反馈中修改名称不改变页面标题', () => {
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="编辑实验标题"]')!.click())
    const title = host.querySelector<HTMLInputElement>('[aria-label="实验标题"]')!
    title.value = '我的电流练习'
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('full') })
    act(() => title.blur())
    const dialog = openFeedback()
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="实验名称"]')?.value).toBe('我的电流练习')
    input('实验名称', '另一个反馈名称')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="实验名称"]')?.value).toBe('另一个反馈名称')
    expect(host.querySelector('[data-editable-lab-title]')?.textContent).toContain('我的电流练习')
    act(() => dialog.querySelector<HTMLButtonElement>('[aria-label="关闭反馈"]')!.click())
    expect(host.querySelector('dialog')).toBeNull()
    expect(openFeedback().querySelector<HTMLInputElement>('[aria-label="实验名称"]')?.value).toBe('我的电流练习')
  })
  it('本地演示提交关闭弹窗并提示成功，不发送网络请求', () => {
    const fetch = vi.spyOn(window, 'fetch')
    const dialog = openFeedback()
    input('反馈描述', '灯泡亮度与电压不符，先闭合 S1 再调电压。')
    expect(dialog.querySelector<HTMLTextAreaElement>('[aria-label="反馈描述"]')?.value).toContain('闭合 S1')
    expect(dialog.textContent).toContain('暂不上传数据')
    act(() => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.querySelector('dialog')).toBeNull()
    expect(host.textContent).toContain('提交成功')
    expect(host.textContent).toContain('未上传')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('上传和粘贴图片都显示截图，普通文字粘贴不被拦截', async () => {
    const read = FileReader.prototype.readAsDataURL
    let imageLoaded: Promise<void>
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader, file) {
      imageLoaded = new Promise((resolve) => this.addEventListener('loadend', () => resolve(), { once: true }))
      read.call(this, file)
    })
    const dialog = openFeedback()
    const upload = dialog.querySelector<HTMLInputElement>('[aria-label="上传截图"]')!
    Object.defineProperty(upload, 'files', { configurable: true, value: [new File(['upload'], 'upload.png', { type: 'image/png' })] })
    await act(async () => { upload.dispatchEvent(new Event('change', { bubbles: true })); await imageLoaded })
    expect(dialog.querySelector('img')?.src).toBe('data:image/png;base64,dXBsb2Fk')
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [new File(['paste'], 'paste.png', { type: 'image/png' })] } })
    await act(async () => { dialog.querySelector('textarea')!.dispatchEvent(paste); await imageLoaded })
    expect(paste.defaultPrevented).toBe(true)
    expect(dialog.querySelector('img')?.src).toBe('data:image/png;base64,cGFzdGU=')
    const textPaste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(textPaste, 'clipboardData', { value: { files: [] } })
    act(() => dialog.querySelector('textarea')!.dispatchEvent(textPaste))
    expect(textPaste.defaultPrevented).toBe(false)
  })
  it('Esc 关闭反馈，并阻止编辑按键传到实验快捷键', () => {
    const dialog = openFeedback()
    const parentKey = vi.fn()
    document.addEventListener('keydown', parentKey)
    act(() => dialog.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })))
    expect(parentKey).not.toHaveBeenCalled()
    document.removeEventListener('keydown', parentKey)
    act(() => dialog.dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(host.querySelector('dialog')).toBeNull()
  })
})
