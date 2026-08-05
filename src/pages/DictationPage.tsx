import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { preloadVoices, speakWord } from '../lib/speech'

export function DictationPage() {
  const { id, pageIndex } = useParams()
  const navigate = useNavigate()
  const pageIdx = Number(pageIndex)
  const [words, setWords] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState('')
  const indexRef = useRef(0)
  const wordsRef = useRef<string[]>([])

  useEffect(() => {
    preloadVoices()
  }, [])

  useEffect(() => {
    if (!id || Number.isNaN(pageIdx)) return
    api
      .document(id)
      .then((res) => {
        const page = res.document.pages[pageIdx]
        if (!page?.length) {
          setError('该页没有单词')
          return
        }
        setTitle(res.document.title)
        setWords(page)
        wordsRef.current = page
      })
      .catch((e) => setError(e.message))
  }, [id, pageIdx])

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    if (!started) return

    function onKey(e: KeyboardEvent) {
      const isRight =
        e.code === 'ArrowRight' || e.code === 'Numpad6' || e.key === 'ArrowRight'
      const isLeft = e.code === 'ArrowLeft' || e.code === 'Numpad4' || e.key === 'ArrowLeft'
      const isReplay = e.code === 'Space' || e.key === ' '

      if (!isRight && !isLeft && !isReplay) return
      e.preventDefault()

      const list = wordsRef.current
      if (!list.length) return

      if (isReplay) {
        void speakWord(list[indexRef.current])
        return
      }

      if (isRight) {
        if (indexRef.current >= list.length - 1) {
          // finished last word replay then offer grade
          void speakWord(list[indexRef.current])
          return
        }
        const next = indexRef.current + 1
        setIndex(next)
        void speakWord(list[next])
        return
      }

      if (isLeft) {
        const prev = Math.max(0, indexRef.current - 1)
        setIndex(prev)
        void speakWord(list[prev])
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started])

  async function begin() {
    setStarted(true)
    setIndex(0)
    indexRef.current = 0
    await speakWord(words[0])
  }

  if (error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link to={`/docs/${id}`}>返回</Link>
      </div>
    )
  }

  if (!words.length) return <div className="center-screen">加载中…</div>

  return (
    <div className="dictation-screen">
      {!started ? (
        <div className="dictation-ready">
          <p className="eyebrow">{title} · 第 {pageIdx + 1} 页</p>
          <h1>准备听写</h1>
          <p>
            共 <strong>{words.length}</strong> 个英语单词。开始后页面<strong>不显示任何单词</strong>
            。
          </p>
          <ul className="tips compact">
            <li>
              <kbd>→</kbd> 下一个 · <kbd>←</kbd> 上一个 · <kbd>Space</kbd> 重读
            </li>
            <li>请把纸笔准备好，再点击开始</li>
          </ul>
          <div className="row-actions">
            <button type="button" className="btn primary" onClick={begin}>
              开始听写
            </button>
            <Link className="btn ghost" to={`/docs/${id}`}>
              返回选页
            </Link>
          </div>
        </div>
      ) : (
        <div className="dictation-live" tabIndex={0}>
          <p className="live-meta">
            {title} · 第 {pageIdx + 1} 页
          </p>
          <div className="live-counter" aria-live="polite">
            <span className="live-num">{index + 1}</span>
            <span className="live-den">/ {words.length}</span>
          </div>
          <p className="live-hint">正在听写 · 单词已隐藏</p>
          <div className="key-hints">
            <span>
              <kbd>←</kbd> 上一个
            </span>
            <span>
              <kbd>Space</kbd> 再读
            </span>
            <span>
              <kbd>→</kbd> 下一个
            </span>
          </div>
          <div className="live-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void speakWord(words[index])}
            >
              再读一遍
            </button>
            <button
              type="button"
              className="btn"
              disabled={index <= 0}
              onClick={() => {
                const prev = Math.max(0, index - 1)
                setIndex(prev)
                void speakWord(words[prev])
              }}
            >
              上一个
            </button>
            <button
              type="button"
              className="btn"
              disabled={index >= words.length - 1}
              onClick={() => {
                const next = Math.min(words.length - 1, index + 1)
                setIndex(next)
                void speakWord(words[next])
              }}
            >
              下一个
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => navigate(`/docs/${id}/page/${pageIdx}/grade`)}
            >
              听写完成 · 去批改
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
