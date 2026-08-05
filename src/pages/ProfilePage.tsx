import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export function ProfilePage() {
  const { user } = useAuth()
  const [docs, setDocs] = useState<
    Array<{
      id: string
      title: string
      page_count: number
      completed_pages: number
      wrong_total: number
      correct_total: number
    }>
  >([])
  const [wrongWords, setWrongWords] = useState<
    Array<{
      id: string
      expected: string
      written: string | null
      times: number
      last_wrong_at: string
      page_index: number | null
      document_title: string | null
      document_id: string | null
    }>
  >([])
  const [error, setError] = useState('')

  async function load() {
    const [summary, wrong] = await Promise.all([api.progressSummary(), api.wrongWords()])
    setDocs(summary.documents)
    setWrongWords(wrong.wrongWords)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  async function removeWrong(id: string) {
    await api.deleteWrongWord(id)
    await load()
  }

  return (
    <div className="page">
      <h1>{user?.username} 的主页</h1>
      <p className="muted">查看上传文件的听写进度与全部错词。</p>
      {error && <p className="error">{error}</p>}

      <section className="section">
        <h2>听写进度</h2>
        {docs.length === 0 ? (
          <p className="muted">
            还没有上传文件。<Link to="/">去导入</Link>
          </p>
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
                      进度 {d.completed_pages}/{d.page_count} 页（{pct}%）· 累计对{' '}
                      {d.correct_total} / 错 {d.wrong_total}
                    </p>
                    <div className="progress-bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <Link className="btn sm" to={`/docs/${d.id}`}>
                    继续
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>错词本（{wrongWords.length}）</h2>
        {wrongWords.length === 0 ? (
          <p className="muted">暂无错词。批改后会自动出现在这里。</p>
        ) : (
          <ul className="wrong-list">
            {wrongWords.map((w) => (
              <li key={w.id}>
                <div>
                  <strong className="wrong-word">{w.expected}</strong>
                  <p className="muted sm">
                    写的是「{w.written || '空'}」· 错 {w.times} 次
                    {w.document_title
                      ? ` · ${w.document_title}${
                          w.page_index != null ? ` 第 ${w.page_index + 1} 页` : ''
                        }`
                      : ''}
                  </p>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => removeWrong(w.id)}>
                  已掌握
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
