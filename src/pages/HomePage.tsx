import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

type Doc = {
  id: string
  title: string
  original_name: string
  page_count: number
  completed_pages: number
  created_at: string
}

export function HomePage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await api.documents()
    setDocs(res.documents)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.uploadDocument(file)
      setMessage(`已导入「${res.document.title}」，共 ${res.document.pageCount} 页`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(id: string) {
    if (!confirm('确定删除该文件及对应进度？')) return
    await api.deleteDocument(id)
    await load()
  }

  return (
    <div className="page">
      <section className="hero-block">
        <h1>导入词表，开始听写</h1>
        <p>支持 PDF、Word、TXT。导入后选择页码，听写过程中页面不显示任何单词。</p>
        <div className="upload-row">
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? '解析中…' : '导入文件'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <span className="hint">PDF / Word / TXT · 最大 25MB</span>
        </div>
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="section">
        <h2>我的文件</h2>
        {docs.length === 0 ? (
          <p className="muted">还没有文件。导入一份英语词表开始吧。</p>
        ) : (
          <ul className="doc-list">
            {docs.map((d) => {
              const pct = d.page_count
                ? Math.round((Number(d.completed_pages) / d.page_count) * 100)
                : 0
              return (
                <li key={d.id} className="doc-row">
                  <div>
                    <Link to={`/docs/${d.id}`} className="doc-title">
                      {d.title}
                    </Link>
                    <p className="muted sm">
                      {d.original_name} · {d.page_count} 页 · 完成 {d.completed_pages}/{d.page_count}{' '}
                      ({pct}%)
                    </p>
                    <div className="progress-bar" aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link className="btn sm" to={`/docs/${d.id}`}>
                      选页听写
                    </Link>
                    <button type="button" className="btn ghost sm" onClick={() => remove(d.id)}>
                      删除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section tip-section">
        <h2>操作说明</h2>
        <ul className="tips">
          <li>
            <kbd>→</kbd> / 小键盘右键：下一个词
          </li>
          <li>
            <kbd>←</kbd> / 小键盘左键：上一个词
          </li>
          <li>
            <kbd>Space</kbd>：再读一遍
          </li>
          <li>听写结束后拍照上传，自动 OCR 批改并记录错词</li>
        </ul>
      </section>
    </div>
  )
}
