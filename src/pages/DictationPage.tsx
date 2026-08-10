import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { prefetchWordAudio, preloadVoices, speakWord, stopSpeaking } from '../lib/speech'
import {
  loadSpeechSettings,
  saveSpeechSettings,
  type SpeechSettings,
} from '../lib/speechSettings'

type Result = { expected: string; written: string; correct: boolean }

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z']/g, '')
}

export function DictationPage() {
  const { id, pageIndex } = useParams()
  const pageIdx = Number(pageIndex)
  const [words, setWords] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [finishedPage, setFinishedPage] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [results, setResults] = useState<Result[] | null>(null)
  const [summary, setSummary] = useState<{
    correctCount: number
    wrongCount: number
    accuracy: number
  } | null>(null)
  const [grading, setGrading] = useState(false)
  const [settings, setSettings] = useState<SpeechSettings>(() => loadSpeechSettings())
  const indexRef = useRef(0)
  const wordsRef = useRef<string[]>([])
  const settingsRef = useRef(settings)
  const finishedRef = useRef(false)
  const playGenRef = useRef(0)
  const autoTimerRef = useRef<number | undefined>(undefined)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const draftKey = `echowrite-draft:${id}:${pageIdx}`

  useEffect(() => {
    preloadVoices()
  }, [])

  useEffect(() => {
    settingsRef.current = settings
    saveSpeechSettings(settings)
  }, [settings])

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
        prefetchWordAudio(page, loadSpeechSettings().accent)
        const saved = localStorage.getItem(draftKey)
        if (saved) {
          try {
            const draft = JSON.parse(saved) as string[]
            setAnswers(Array.from({ length: page.length }, (_, i) => draft[i] || ''))
          } catch {
            setAnswers(Array(page.length).fill(''))
          }
        } else {
          setAnswers(Array(page.length).fill(''))
        }
      })
      .catch((e) => setError(e.message))
  }, [id, pageIdx, draftKey])

  useEffect(() => {
    indexRef.current = index
    if (started && !finishedPage) {
      window.setTimeout(() => inputRefs.current[index]?.focus(), 0)
    }
  }, [index, started, finishedPage])

  useEffect(() => {
    if (!started || !answers.length) return
    localStorage.setItem(draftKey, JSON.stringify(answers))
  }, [answers, draftKey, started])

  useEffect(() => {
    return () => {
      window.clearTimeout(autoTimerRef.current)
      stopSpeaking()
    }
  }, [])

  function markFinished() {
    finishedRef.current = true
    setFinishedPage(true)
    window.clearTimeout(autoTimerRef.current)
    stopSpeaking()
  }

  async function playAt(nextIndex: number) {
    const list = wordsRef.current
    if (!list.length) return
    const clamped = Math.max(0, Math.min(list.length - 1, nextIndex))
    const gen = ++playGenRef.current
    setIndex(clamped)
    indexRef.current = clamped
    finishedRef.current = false
    setFinishedPage(false)
    window.clearTimeout(autoTimerRef.current)
    await speakWord(list[clamped], settingsRef.current)
    if (gen !== playGenRef.current || finishedRef.current) return

    if (settingsRef.current.autoAdvance && clamped < list.length - 1) {
      autoTimerRef.current = window.setTimeout(() => {
        if (gen !== playGenRef.current || finishedRef.current) return
        void playAt(clamped + 1)
      }, settingsRef.current.intervalMs)
    } else if (settingsRef.current.autoAdvance && clamped >= list.length - 1) {
      markFinished()
    }
  }

  useEffect(() => {
    if (!started || results) return

    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      const isRight =
        e.ctrlKey &&
        (e.code === 'ArrowRight' ||
          e.key === 'ArrowRight' ||
          e.code === 'Numpad6')
      const isLeft =
        e.ctrlKey &&
        (e.code === 'ArrowLeft' || e.key === 'ArrowLeft' || e.code === 'Numpad4')
      // Ctrl+↑ 重读（不用 Ctrl+Space，避免与中文输入法切换冲突）
      const isReplay =
        e.ctrlKey && (e.code === 'ArrowUp' || e.key === 'ArrowUp' || e.code === 'Numpad8')

      if (!isRight && !isLeft && !isReplay) return
      e.preventDefault()
      e.stopPropagation()

      const list = wordsRef.current
      if (!list.length) return

      if (isReplay) {
        void playAt(indexRef.current)
        return
      }

      if (isRight) {
        if (indexRef.current >= list.length - 1) {
          markFinished()
          return
        }
        void playAt(indexRef.current + 1)
        return
      }

      if (isLeft) {
        void playAt(Math.max(0, indexRef.current - 1))
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [started, results])

  async function begin() {
    setStarted(true)
    setResults(null)
    setSummary(null)
    setFinishedPage(false)
    finishedRef.current = false
    await playAt(0)
    inputRefs.current[0]?.focus()
  }

  function updateAnswer(answerIndex: number, value: string) {
    setAnswers((current) => {
      const next = [...current]
      next[answerIndex] = value
      return next
    })
  }

  async function finishAndGrade() {
    if (!id) return
    const emptyCount = answers.filter((answer) => !answer.trim()).length
    if (
      emptyCount > 0 &&
      !confirm(`还有 ${emptyCount} 个位置没有填写，确定直接批改吗？`)
    ) {
      return
    }

    setGrading(true)
    setError('')
    try {
      const graded = words.map((expected, answerIndex) => ({
        expected,
        written: answers[answerIndex]?.trim() || '',
        correct: normalize(expected) === normalize(answers[answerIndex] || ''),
      }))
      const saved = await api.submitGrade({
        documentId: id,
        pageIndex: pageIdx,
        results: graded,
      })
      setResults(graded)
      setSummary({
        correctCount: saved.correctCount,
        wrongCount: saved.wrongCount,
        accuracy: saved.accuracy,
      })
      localStorage.removeItem(draftKey)
      stopSpeaking()
      setFinishedPage(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '批改失败')
    } finally {
      setGrading(false)
    }
  }

  function exportWord() {
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_') || '听写'
    const count = answers.length
    const columns = count > 72 ? 4 : count > 40 ? 3 : 2
    const rows = Math.ceil(count / columns)
    const fontSize = count > 72 ? 8 : 10

    function escapeHtml(value: string) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    const tableRows = Array.from({ length: rows }, (_, row) => {
      const cells = Array.from({ length: columns }, (_, column) => {
        const answerIndex = column * rows + row
        if (answerIndex >= count) {
          return '<td style="border-bottom:1px solid #cccccc;padding:3pt 4pt;"></td>'
        }

        const writtenRaw = answers[answerIndex]?.trim() || '（空）'
        const written = escapeHtml(writtenRaw)
        const result = results?.[answerIndex]
        const num = `<font color="#666666">${answerIndex + 1}.</font>`

        let body: string
        if (result && !result.correct) {
          const expected = escapeHtml(result.expected)
          // <font color> 比 span+CSS 在 Mac Word / Pages 里更稳
          body = `<font color="#CC0000"><b>${written}</b>（${expected}）</font>`
        } else {
          body = `<font color="#000000">${written}</font>`
        }

        return `<td style="border-bottom:1px solid #cccccc;padding:3pt 4pt;color:#000000;background-color:#ffffff;">${num} ${body}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')

    // Word HTML：显式白底黑字 + Office xmlns，避免 Mac 上白字/被裁切看不见
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="EchoWrite">
<!--[if gte mso 9]><xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
 </w:WordDocument>
</xml><![endif]-->
<style>
/* Word / Pages 保守样式：不用 overflow:hidden、不用深色主题色 */
@page { size: A4; margin: 12mm; }
body {
  background: #ffffff !important;
  color: #000000 !important;
  font-family: Arial, Helvetica, "Microsoft YaHei", sans-serif;
  font-size: ${fontSize}pt;
  margin: 0;
}
h1 {
  text-align: center;
  font-size: 16pt;
  color: #000000 !important;
  background: #ffffff !important;
  margin: 0 0 8pt 0;
}
p.meta {
  text-align: center;
  font-size: 9pt;
  color: #333333 !important;
  margin: 0 0 10pt 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff !important;
  color: #000000 !important;
}
td {
  vertical-align: top;
  color: #000000 !important;
  background: #ffffff !important;
}
</style>
</head>
<body bgcolor="#ffffff" style="background-color:#ffffff;color:#000000;">
<h1>${escapeHtml(safeTitle)} · 第 ${pageIdx + 1} 页听写</h1>
<p class="meta">共 ${count} 项${summary ? ` · 正确率 ${summary.accuracy}%` : ''}${results ? ' · 红色为错词' : ''}</p>
<table border="0" cellspacing="0" cellpadding="0">${tableRows}</table>
</body>
</html>`

    const blob = new Blob(['\ufeff', html], {
      type: 'application/msword;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeTitle}-第${pageIdx + 1}页-听写.doc`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (error && !words.length) {
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
            共 <strong>{words.length}</strong> 个英语单词。开始后页面<strong>不显示原词</strong>
            ，在答题纸里直接输入。
          </p>

          <p className="muted speech-engine-note">
            发音优先使用词典真人音频（美音/英音），找不到时再回退系统语音。
          </p>

          <div className="speech-settings">
            <label>
              口音（词典）
              <select
                value={settings.accent}
                onChange={(e) => {
                  const accent = e.target.value === 'en-GB' ? 'en-GB' : 'en-US'
                  setSettings((s) => ({ ...s, accent }))
                  prefetchWordAudio(wordsRef.current, accent)
                }}
              >
                <option value="en-US">美式 English (US)</option>
                <option value="en-GB">英式 English (UK)</option>
              </select>
            </label>
            <label>
              语速
              <select
                value={settings.rate}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    rate: Number(e.target.value) as SpeechSettings['rate'],
                  }))
                }
              >
                <option value={0.6}>0.6x 慢</option>
                <option value={0.8}>0.8x 适中</option>
                <option value={1.0}>1.0x 正常</option>
              </select>
            </label>
            <label>
              每词重复
              <select
                value={settings.repeats}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    repeats: Number(e.target.value) === 2 ? 2 : 1,
                  }))
                }
              >
                <option value={1}>读 1 遍</option>
                <option value={2}>读 2 遍</option>
              </select>
            </label>
            <label>
              自动下一词间隔
              <select
                value={settings.intervalMs}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, intervalMs: Number(e.target.value) }))
                }
              >
                <option value={800}>0.8 秒</option>
                <option value={1200}>1.2 秒</option>
                <option value={1800}>1.8 秒</option>
                <option value={2500}>2.5 秒</option>
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.autoAdvance}
                onChange={(e) => setSettings((s) => ({ ...s, autoAdvance: e.target.checked }))}
              />
              自动播放下一个词
            </label>
          </div>

          <ul className="tips compact">
            <li>
              <kbd>Ctrl</kbd> + <kbd>→</kbd> 下一个 · <kbd>Ctrl</kbd> + <kbd>←</kbd> 上一个 ·{' '}
              <kbd>Ctrl</kbd> + <kbd>↑</kbd> 重读
            </li>
            <li>
              最后一个词后再按 <kbd>Ctrl</kbd> + <kbd>→</kbd> 会进入本页完成状态
            </li>
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
        <div className="dictation-live dictation-editor" tabIndex={0}>
          <p className="live-meta">
            {title} · 第 {pageIdx + 1} 页
          </p>
          <div className="live-counter" aria-live="polite">
            <span className="live-num">{Math.min(index + 1, words.length)}</span>
            <span className="live-den">/ {words.length}</span>
          </div>
          <p className="live-hint">
            {finishedPage
              ? `本页 ${words.length} 个词已全部播放`
              : '正在听写 · 原词已隐藏 · 直接在答题纸输入'}
          </p>
          <div className="key-hints">
            <span>
              <kbd>Ctrl</kbd> + <kbd>←</kbd> 上一个
            </span>
            <span>
              <kbd>Ctrl</kbd> + <kbd>↑</kbd> 重读
            </span>
            <span>
              <kbd>Ctrl</kbd> + <kbd>→</kbd> 下一个
            </span>
          </div>

          {finishedPage && !results && (
            <div className="finish-banner">
              <p>本页 {words.length} 个词已全部播放完毕。</p>
              <div className="row-actions">
                <button type="button" className="btn" onClick={() => void playAt(0)}>
                  再检查一遍
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={grading}
                  onClick={finishAndGrade}
                >
                  {grading ? '批改中…' : '直接批改'}
                </button>
                <Link className="btn ghost" to={`/docs/${id}/page/${pageIdx}/grade`}>
                  去拍照批改
                </Link>
              </div>
            </div>
          )}

          <div className="typing-sheet">
            {answers.map((answer, answerIndex) => (
              <label
                key={answerIndex}
                className={`typing-row ${index === answerIndex && !finishedPage ? 'active' : ''}`}
              >
                <span>{answerIndex + 1}.</span>
                <input
                  ref={(element) => {
                    inputRefs.current[answerIndex] = element
                  }}
                  value={answer}
                  disabled={Boolean(results)}
                  aria-label={`第 ${answerIndex + 1} 个单词`}
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={() => {
                    setIndex(answerIndex)
                    finishedRef.current = false
                    setFinishedPage(false)
                  }}
                  onChange={(e) => updateAnswer(answerIndex, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (answerIndex < words.length - 1) void playAt(answerIndex + 1)
                      else markFinished()
                    }
                  }}
                />
                {results && (
                  <strong className={results[answerIndex].correct ? 'answer-ok' : 'answer-bad'}>
                    {results[answerIndex].correct ? '✓' : `✗ ${results[answerIndex].expected}`}
                  </strong>
                )}
              </label>
            ))}
          </div>
          {summary && (
            <div className="inline-grade-summary">
              正确 <strong>{summary.correctCount}</strong> · 错误{' '}
              <strong>{summary.wrongCount}</strong> · 正确率{' '}
              <strong>{summary.accuracy}%</strong>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <div className="live-actions">
            <button type="button" className="btn" onClick={() => void playAt(index)}>
              再读一遍
            </button>
            <button
              type="button"
              className="btn"
              disabled={index <= 0}
              onClick={() => void playAt(index - 1)}
            >
              上一个
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (index >= words.length - 1) markFinished()
                else void playAt(index + 1)
              }}
            >
              下一个
            </button>
            {!results ? (
              <button
                type="button"
                className="btn primary"
                disabled={grading}
                onClick={finishAndGrade}
              >
                {grading ? '批改中…' : '完成并直接批改'}
              </button>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={exportWord}>
                  导出 Word（单页）
                </button>
                <Link className="btn" to="/profile">
                  查看错词本
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
