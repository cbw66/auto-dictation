import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { db } from '../db.js'
import { requireAuth, getUser } from '../auth.js'
import { scheduleDatabasePush } from '../githubSync.js'
import { decodeUploadFilename } from '../filename.js'

export const progressRouter = Router()
progressRouter.use(requireAuth)

progressRouter.get('/summary', (req, res) => {
  const user = getUser(req)
  const documents = db
    .prepare(
      `SELECT d.id, d.title, d.original_name, d.page_count, d.created_at,
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_pages,
        COALESCE(SUM(CASE WHEN p.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress_pages,
        COALESCE(SUM(p.wrong_count), 0) AS wrong_total,
        COALESCE(SUM(p.correct_count), 0) AS correct_total
       FROM documents d
       LEFT JOIN page_progress p ON p.document_id = d.id AND p.user_id = d.user_id
       WHERE d.user_id = ?
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
    )
    .all(user.id) as Array<{
    id: string
    title: string
    original_name: string
    page_count: number
    created_at: string
    completed_pages: number
    in_progress_pages: number
    wrong_total: number
    correct_total: number
  }>

  res.json({
    documents: documents.map((d) => ({
      ...d,
      title: decodeUploadFilename(d.title),
      original_name: decodeUploadFilename(d.original_name),
    })),
  })
})

progressRouter.post('/grade', (req, res) => {
  const user = getUser(req)
  const documentId = String(req.body?.documentId || '')
  const pageIndex = Number(req.body?.pageIndex)
  const results = req.body?.results as
    | Array<{ expected: string; written: string; correct: boolean }>
    | undefined

  if (!documentId || Number.isNaN(pageIndex) || !Array.isArray(results)) {
    res.status(400).json({ error: '参数不完整' })
    return
  }

  const doc = db
    .prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
    .get(documentId, user.id)
  if (!doc) {
    res.status(404).json({ error: '文档不存在' })
    return
  }

  const correctCount = results.filter((r) => r.correct).length
  const wrongCount = results.length - correctCount

  const existing = db
    .prepare(
      'SELECT id FROM page_progress WHERE user_id = ? AND document_id = ? AND page_index = ?',
    )
    .get(user.id, documentId, pageIndex) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE page_progress
       SET status = 'completed', correct_count = ?, wrong_count = ?, word_count = ?, last_practiced_at = datetime('now')
       WHERE id = ?`,
    ).run(correctCount, wrongCount, results.length, existing.id)
  } else {
    db.prepare(
      `INSERT INTO page_progress (id, user_id, document_id, page_index, status, word_count, correct_count, wrong_count, last_practiced_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, datetime('now'))`,
    ).run(uuid(), user.id, documentId, pageIndex, results.length, correctCount, wrongCount)
  }

  const upsertWrong = db.prepare(
    `SELECT id, times FROM wrong_words
     WHERE user_id = ? AND word = ? COLLATE NOCASE
       AND IFNULL(document_id, '') = IFNULL(?, '')
       AND IFNULL(page_index, -1) = IFNULL(?, -1)`,
  )
  const updateWrong = db.prepare(
    `UPDATE wrong_words SET times = times + 1, written = ?, expected = ?, last_wrong_at = datetime('now') WHERE id = ?`,
  )
  const insertWrong = db.prepare(
    `INSERT INTO wrong_words (id, user_id, document_id, page_index, word, expected, written)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  const tx = db.transaction(() => {
    for (const r of results) {
      if (r.correct) continue
      const word = r.expected.trim().toLowerCase()
      const found = upsertWrong.get(user.id, word, documentId, pageIndex) as
        | { id: string; times: number }
        | undefined
      if (found) {
        updateWrong.run(r.written || '', r.expected, found.id)
      } else {
        insertWrong.run(uuid(), user.id, documentId, pageIndex, word, r.expected, r.written || '')
      }
    }
  })
  tx()
  scheduleDatabasePush()

  res.json({
    correctCount,
    wrongCount,
    total: results.length,
    accuracy: results.length ? Math.round((correctCount / results.length) * 100) : 0,
  })
})
