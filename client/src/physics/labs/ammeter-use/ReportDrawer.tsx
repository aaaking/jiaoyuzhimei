import { useState, type ReactNode } from 'react'
import { COMPETITOR_TEXT_PANEL } from './competitorScene'
import reportCircuitImage from '/physics/ammeter/report-circuit.png?inline'

type ReportBlock = { id: string; type: 'text'; text: string } | { id: string; type: 'image'; src: string; alt: string }
type ReportSection = { id: string; title: string; blocks: ReportBlock[] }
type ReportDocument = { title: string; sections: ReportSection[] }
const STORAGE_KEY = 'physics:ammeter-use:instruction-report:v1'
const fieldClass = 'w-full rounded border border-[#d8d2c8] bg-white px-2 py-1 text-sm text-[#4b4742]'
const buttonClass = 'rounded border border-[#d8d2c8] px-2 py-1 text-xs text-[#4b4742] hover:bg-[#eeeae3] disabled:opacity-40'

function initialReport(): ReportDocument {
  return {
    title: '实验报告',
    sections: COMPETITOR_TEXT_PANEL.map((section, index) => {
      const blocks: ReportBlock[] = section.paragraphs.map((text, paragraph) => ({ id: `${index}-${paragraph}`, type: 'text', text }))
      if (section.title === '步骤') blocks.splice(2, 0, { id: 'circuit', type: 'image', src: reportCircuitImage, alt: '串联电路图：电源、开关、电流表和灯泡串联' })
      return { id: `section-${index}`, title: section.title, blocks }
    }),
  }
}

function loadReport(): ReportDocument {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as ReportDocument | null
    if (saved && typeof saved.title === 'string' && Array.isArray(saved.sections)) return {
      ...saved,
      sections: saved.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) => block.type === 'image' && block.id === 'circuit' ? { ...block, src: reportCircuitImage } : block),
      })),
    }
  } catch { /* 无保存内容时使用默认报告。 */ }
  return initialReport()
}

export default function ReportDrawer({ open, onClose, footer }: { open: boolean; onClose(): void; footer?: ReactNode }) {
  const [document, setDocument] = useState(loadReport)
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
      setError('')
      return true
    } catch {
      setError('未能保存到本机，修改仍保留在本页。请减少较大图片后重试。')
      return false
    }
  }
  function updateSection(id: string, change: (section: ReportSection) => ReportSection) {
    setDocument((current) => ({ ...current, sections: current.sections.map((section) => section.id === id ? change(section) : section) }))
  }
  function updateBlock(sectionId: string, id: string, change: (block: ReportBlock) => ReportBlock) {
    updateSection(sectionId, (section) => ({ ...section, blocks: section.blocks.map((block) => block.id === id ? change(block) : block) }))
  }
  function addImage(sectionId: string, file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result
      if (typeof src === 'string') updateSection(sectionId, (section) => ({ ...section, blocks: [...section.blocks, { id: crypto.randomUUID(), type: 'image', src, alt: file.name }] }))
      setUploading(false)
    }
    reader.onerror = () => { setUploading(false); setError('图片读取失败，请重新选择。') }
    reader.readAsDataURL(file)
  }

  if (!open) return null
  return (
    <aside data-canvas-pan-block data-selectable-content className="absolute right-0 top-16 z-40 flex h-[calc(100%-4rem)] w-[min(420px,92%)] flex-col border-l border-[#d8d2c8] bg-[#fbfaf7] shadow-2xl" aria-label="实验报告">
      <header className="flex items-center gap-2 border-b border-[#e2ddd3] px-5 py-3">
        {editing ? <input aria-label="报告标题" value={document.title} onInput={(event) => setDocument({ ...document, title: event.currentTarget.value })} className={`${fieldClass} min-w-0 flex-1 font-bold`} /> : <h2 className="min-w-0 flex-1 break-words text-base font-bold text-[#242424]">{document.title}</h2>}
        <button type="button" disabled={uploading} aria-label={editing ? '保存实验报告' : '编辑实验报告'} className={buttonClass} onClick={() => {
          if (!editing) setEditing(true)
          else if (save()) setEditing(false)
        }}>{editing ? '保存' : '编辑'}</button>
        <button type="button" disabled={uploading} aria-label="收起实验报告" className={buttonClass} onClick={() => {
          if (editing && !save()) return
          setEditing(false)
          onClose()
        }}>收起</button>
      </header>
      {error && <p role="status" className="px-5 pt-3 text-xs text-[#a44924]">{error}</p>}
      {uploading && <p role="status" className="px-5 pt-3 text-xs text-[#4b4742]">正在读取图片…</p>}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {document.sections.map((section, sectionIndex) => <section key={section.id}>
          {editing ? <div className="flex items-center gap-2">
            <input aria-label={`第${sectionIndex + 1}节标题`} value={section.title} onInput={(event) => { const title = event.currentTarget.value; updateSection(section.id, (current) => ({ ...current, title })) }} className={`${fieldClass} font-bold`} />
            <button type="button" aria-label={`删除第${sectionIndex + 1}节`} className={`${buttonClass} shrink-0`} onClick={() => setDocument((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))}>删除章节</button>
          </div> : <h3 className="text-sm font-bold text-[#165DFF]">{section.title}</h3>}
          <div className="mt-2 space-y-1.5">
            {section.blocks.map((block, blockIndex) => block.type === 'text' ? editing ? <div key={block.id} className="space-y-1">
              <textarea aria-label={`第${sectionIndex + 1}节第${blockIndex + 1}段`} value={block.text} rows={Math.max(2, Math.ceil(block.text.length / 24))} onInput={(event) => { const text = event.currentTarget.value; updateBlock(section.id, block.id, (current) => current.type === 'text' ? { ...current, text } : current) }} className={`${fieldClass} resize-y leading-6`} />
              <button type="button" aria-label={`删除第${sectionIndex + 1}节第${blockIndex + 1}块文字`} className={buttonClass} onClick={() => updateSection(section.id, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}>删除文字</button>
            </div> : <p key={block.id} className="whitespace-pre-wrap break-words text-sm leading-6 text-[#4b4742]">{block.text}</p> : <figure key={block.id} className="py-2">
              <img src={block.src} alt={block.alt} className="max-h-96 max-w-full object-contain" />
              {editing && <div className="mt-2 flex items-center gap-2">
                <input aria-label={`第${sectionIndex + 1}节第${blockIndex + 1}块图片说明`} value={block.alt} onInput={(event) => { const alt = event.currentTarget.value; updateBlock(section.id, block.id, (current) => current.type === 'image' ? { ...current, alt } : current) }} className={fieldClass} />
                <button type="button" aria-label={`删除第${sectionIndex + 1}节第${blockIndex + 1}块图片`} className={`${buttonClass} shrink-0`} onClick={() => updateSection(section.id, (current) => ({ ...current, blocks: current.blocks.filter((item) => item.id !== block.id) }))}>删除图片</button>
              </div>}
            </figure>)}
          </div>
          {editing && <div className="mt-3 flex items-center gap-2">
            <button type="button" aria-label={`为第${sectionIndex + 1}节添加文字`} className={buttonClass} onClick={() => updateSection(section.id, (current) => ({ ...current, blocks: [...current.blocks, { id: crypto.randomUUID(), type: 'text', text: '' }] }))}>添加文字</button>
            <label className={`${buttonClass} cursor-pointer`}>添加图片<input type="file" accept="image/*" disabled={uploading} aria-label={`为第${sectionIndex + 1}节添加图片`} className="sr-only" onChange={(event) => { addImage(section.id, event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label>
          </div>}
        </section>)}
        {editing && <button type="button" className={buttonClass} onClick={() => setDocument((current) => ({ ...current, sections: [...current.sections, { id: crypto.randomUUID(), title: '新章节', blocks: [{ id: crypto.randomUUID(), type: 'text', text: '' }] }] }))}>添加章节</button>}
      </div>
      {footer && <div className="border-t border-[#e2ddd3] px-5 py-3">{footer}</div>}
    </aside>
  )
}
