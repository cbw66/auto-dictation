import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'

export function DocumentPage() {
  const { id } = useParams()
  const [title, setTitle] = useState('')
  const [pages, setPages] = useState<string[][]>([])
  const [progress, setProgress] = useState<
    Record<number, { status: string; correct_count: number; wrong_count: number }>
  >({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api
      .document(id)
      .then((res) => {
        setTitle(res.document.title)
        setPages(res.document.pages)
        const map: typeof progress = {}
        for (const p of res.progress) {
          map[p.page_index] = {
            status: p.status,
            correct_count: p.correct_count,
            wrong_count: p.wrong_count,
          }
        }
        setProgress(map)
      })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) return <p className="error page">{error}</p>
  if (!pages.length && !title) return <div className="center-screen">加载中…</div>

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/">听写</Link> / {title}
      </p>
      <h1>{title}</h1>
      <p className="muted">选择要听写的页。听写开始后不会显示任何单词。</p>

      <ul className="page-grid">
        {pages.map((words, index) => {
          const p = progress[index]
          const status = p?.status || 'not_started'
          const label =
            status === 'completed' ? '已完成' : status === 'in_progress' ? '进行中' : '未开始'
          return (
            <li key={index} className={`page-tile status-${status}`}>
              <div>
                <strong>第 {index + 1} 页</strong>
                <p className="muted sm">
                  {words.length} 词 · {label}
                  {status === 'completed' && p
                    ? ` · 对 ${p.correct_count} / 错 ${p.wrong_count}`
                    : ''}
                </p>
                <p className="preview muted sm" title="预览（听写时不会显示）">
                  预览：{words.slice(0, 6).join(', ')}
                  {words.length > 6 ? '…' : ''}
                </p>
              </div>
              <div className="row-actions">
                <Link className="btn primary sm" to={`/docs/${id}/page/${index}/dictation`}>
                  开始听写
                </Link>
                <Link className="btn ghost sm" to={`/docs/${id}/page/${index}/grade`}>
                  拍照批改
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
