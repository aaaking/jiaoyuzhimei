import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

export default function LabFeedbackDialog({ name, onClose, onSubmit }: { name: string; onClose(): void; onSubmit(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  useEffect(() => { dialog.current?.showModal() }, [])

  function close() {
    dialog.current?.close()
    onClose()
  }

  function readScreenshot(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => { setScreenshot(String(reader.result)); setImageError(false) }
    reader.onerror = () => setImageError(true)
    reader.readAsDataURL(file)
  }

  return <dialog
    ref={dialog}
    aria-label="实验反馈"
    data-canvas-pan-block
    data-selectable-content
    onCancel={(event) => { event.preventDefault(); close() }}
    onKeyDown={(event) => event.stopPropagation()}
    onPaste={(event) => {
      const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
      if (image) { event.preventDefault(); readScreenshot(image) }
    }}
    className="pointer-events-auto m-auto max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-white/15 bg-[#22262c] p-0 text-[#e6ebf1] shadow-2xl backdrop:bg-black/55"
  >
    <form onSubmit={(event) => { event.preventDefault(); dialog.current?.close(); onSubmit() }} className="space-y-5 p-6">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">反馈</h2>
        <button type="button" aria-label="关闭反馈" onClick={close} className="rounded p-1 text-[#9aa4b2] hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
      </header>
      <label className="block space-y-2 text-sm">
        <span>实验名称</span>
        <input aria-label="实验名称" autoFocus defaultValue={name} className="block w-full rounded-md border border-white/15 bg-[#181b20] px-3 py-2 outline-none focus:border-blue-400" />
      </label>
      <label className="block space-y-2 text-sm">
        <span>反馈描述</span>
        <p id="feedback-description-hint" className="text-[12px] text-[#9aa4b2]">请详细描述您所遇到的问题以及操作步骤</p>
        <textarea aria-label="反馈描述" aria-describedby="feedback-description-hint" rows={4} className="block w-full resize-y rounded-md border border-white/15 bg-[#181b20] px-3 py-2 outline-none focus:border-blue-400" />
      </label>
      <div className="space-y-2 text-sm">
        <span>截图</span>
        <div className="rounded-md border border-dashed border-white/20 bg-[#181b20] p-3 text-center">
          {screenshot && <img src={screenshot} alt="反馈截图预览" className="mx-auto mb-3 max-h-44 max-w-full rounded object-contain" />}
          <p className="mb-3 text-[12px] text-[#9aa4b2]">可在弹窗内直接粘贴截图，或上传本地图片</p>
          <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-md border border-white/15 px-3 py-2 hover:bg-white/10">
            <ImagePlus className="size-4" aria-hidden="true" />{screenshot ? '更换截图' : '上传截图'}
            <input type="file" accept="image/*" aria-label="上传截图" className="absolute inset-0 w-full cursor-pointer opacity-0" onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) readScreenshot(file)
              event.currentTarget.value = ''
            }} />
          </label>
          {imageError && <p role="status" className="mt-2 text-xs text-red-300">图片读取失败，请重试</p>}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-[#9aa4b2]">预留功能演示，暂不上传数据</p>
        <button type="submit" className="shrink-0 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500">提交</button>
      </footer>
    </form>
  </dialog>
}
