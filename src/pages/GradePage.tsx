import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { gradeWords, ocrImage } from '../lib/grade'

type Result = { expected: string; written: string; correct: boolean }

export function GradePage() {
  const { id, pageIndex } = useParams()
  const pageIdx = Number(pageIndex)
  const [words, setWords] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [results, setResults] = useState<Result[] | null>(null)
  const [summary, setSummary] = useState<{
    correctCount: number
    wrongCount: number
    accuracy: number
  } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id || Number.isNaN(pageIdx)) return
    api
      .document(id)
      .then((res) => {
        setTitle(res.document.title)
        setWords(res.document.pages[pageIdx] || [])
      })
      .catch((e) => setError(e.message))
  }, [id, pageIdx])

  async function handleFile(file: File | undefined) {
    if (!file || !id) return
    setBusy(true)
    setError('')
    setResults(null)
    setSummary(null)
    setPreview(URL.createObjectURL(file))
    try {
      const ocrWords = await ocrImage(file)
      const graded = gradeWords(words, ocrWords)
      setResults(graded)
      const saved = await api.submitGrade({
        documentId: id,
        pageIndex: pageIdx,
        results: graded,
      })
      setSummary({
        correctCount: saved.correctCount,
        wrongCount: saved.wrongCount,
        accuracy: saved.accuracy,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '批改失败')
    } finally {
      setBusy(false)
    }
  }

  if (error && !words.length) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to={`/docs/${id}`}>返回</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="breadcrumb">
        <Link to="/">听写</Link> / <Link to={`/docs/${id}`}>{title || '文档'}</Link> / 第{' '}
        {pageIdx + 1} 页批改
      </p>
      <h1>拍照批改</h1>
      <p className="muted">
        上传听写纸照片，系统用 OCR 识别后与标准答案比对，错词会自动记入个人主页。
      </p>

      <div className="upload-row">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !words.length}
          onClick={() => camRef.current?.click()}
        >
          拍照上传
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !words.length}
          onClick={() => fileRef.current?.click()}
        >
          从相册选择
        </button>
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {busy && <p className="muted">正在识别并批改，请稍候…</p>}
      {error && <p className="error">{error}</p>}

      {preview && (
        <div className="grade-preview">
          <img src={preview} alt="听写照片预览" />
        </div>
      )}

      {summary && (
        <div className="grade-summary">
          <p>
            正确 <strong>{summary.correctCount}</strong> · 错误{' '}
            <strong>{summary.wrongCount}</strong> · 正确率{' '}
            <strong>{summary.accuracy}%</strong>
          </p>
          <div className="row-actions">
            <Link className="btn" to="/profile">
              查看错词本
            </Link>
            <Link className="btn ghost" to={`/docs/${id}`}>
              返回选页
            </Link>
          </div>
        </div>
      )}

      {results && (
        <ul className="result-list">
          {results.map((r, i) => (
            <li key={`${r.expected}-${i}`} className={r.correct ? 'ok' : 'bad'}>
              <span className="idx">{i + 1}</span>
              <span>
                标准：<strong>{r.expected}</strong>
              </span>
              <span>识别：{r.written || '（空）'}</span>
              <span>{r.correct ? '✓' : '✗'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
