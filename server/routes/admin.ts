import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../db.js'
import { scheduleDatabasePush } from '../githubSync.js'
import { rateLimit } from '../rateLimit.js'
import { decodeUploadFilename } from '../filename.js'

export const adminRouter = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'auto-dictation-dev-secret-change-me'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '11111'

type AdminPayload = { role: 'admin' }

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: 'admin-login',
  message: '管理员登录尝试过多，请 15 分钟后再试',
})

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '请先登录管理员' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AdminPayload
    if (payload.role !== 'admin') {
      res.status(403).json({ error: '无管理员权限' })
      return
    }
    next()
  } catch {
    res.status(401).json({ error: '管理员登录已过期' })
  }
}

adminRouter.post('/login', adminLoginLimiter, (req, res) => {
  const password = String(req.body?.password || '')
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: '管理员密码错误' })
    return
  }
  const token = jwt.sign({ role: 'admin' } satisfies AdminPayload, JWT_SECRET, {
    expiresIn: '7d',
  })
  res.json({ token })
})

adminRouter.get('/overview', requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  const documents = db.prepare('SELECT COUNT(*) AS c FROM documents').get() as { c: number }
  const wrong = db.prepare('SELECT COUNT(*) AS c FROM wrong_words').get() as { c: number }
  const completed = db
    .prepare(`SELECT COUNT(*) AS c FROM page_progress WHERE status = 'completed'`)
    .get() as { c: number }
  const recent = db
    .prepare(
      `SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 5`,
    )
    .all() as Array<{ username: string; created_at: string }>

  res.json({
    userCount: users.c,
    documentCount: documents.c,
    wrongWordCount: wrong.c,
    completedPages: completed.c,
    recentUsers: recent,
  })
})

adminRouter.get('/users', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
        u.id,
        u.username,
        u.created_at,
        (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) AS document_count,
        (SELECT COUNT(*) FROM page_progress p WHERE p.user_id = u.id AND p.status = 'completed') AS completed_pages,
        (SELECT COUNT(*) FROM page_progress p WHERE p.user_id = u.id) AS total_pages,
        (SELECT COALESCE(SUM(p.correct_count), 0) FROM page_progress p WHERE p.user_id = u.id) AS correct_total,
        (SELECT COALESCE(SUM(p.wrong_count), 0) FROM page_progress p WHERE p.user_id = u.id) AS wrong_total,
        (SELECT COUNT(*) FROM wrong_words w WHERE w.user_id = u.id) AS wrong_word_entries,
        (SELECT MAX(p.last_practiced_at) FROM page_progress p WHERE p.user_id = u.id) AS last_practiced_at
      FROM users u
      ORDER BY u.created_at DESC`,
    )
    .all()

  res.json({ users: rows })
})

adminRouter.get('/users/:id', requireAdmin, (req, res) => {
  const user = db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(req.params.id) as { id: string; username: string; created_at: string } | undefined

  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  const documents = db
    .prepare(
      `SELECT
        d.id,
        d.title,
        d.original_name,
        d.page_count,
        d.created_at,
        (SELECT COUNT(*) FROM page_progress p WHERE p.document_id = d.id AND p.status = 'completed') AS completed_pages,
        (SELECT COALESCE(SUM(p.wrong_count), 0) FROM page_progress p WHERE p.document_id = d.id) AS wrong_total,
        (SELECT COALESCE(SUM(p.correct_count), 0) FROM page_progress p WHERE p.document_id = d.id) AS correct_total
      FROM documents d
      WHERE d.user_id = ?
      ORDER BY d.created_at DESC`,
    )
    .all(user.id) as Array<{
    id: string
    title: string
    original_name: string
    page_count: number
    created_at: string
    completed_pages: number
    wrong_total: number
    correct_total: number
  }>

  const fixedDocuments = documents.map((d) => ({
    ...d,
    title: decodeUploadFilename(d.title),
    original_name: decodeUploadFilename(d.original_name),
  }))

  const progress = db
    .prepare(
      `SELECT
        p.document_id,
        d.title AS document_title,
        p.page_index,
        p.status,
        p.word_count,
        p.correct_count,
        p.wrong_count,
        p.last_practiced_at
      FROM page_progress p
      LEFT JOIN documents d ON d.id = p.document_id
      WHERE p.user_id = ?
      ORDER BY IFNULL(p.last_practiced_at, '') DESC, p.document_id, p.page_index`,
    )
    .all(user.id) as Array<{
    document_id: string
    document_title: string | null
    page_index: number
    status: string
    word_count: number
    correct_count: number
    wrong_count: number
    last_practiced_at: string | null
  }>

  const fixedProgress = progress.map((p) => ({
    ...p,
    document_title: p.document_title ? decodeUploadFilename(p.document_title) : p.document_title,
  }))

  const wrongWords = db
    .prepare(
      `SELECT
        w.id,
        w.word,
        w.expected,
        w.written,
        w.times,
        w.last_wrong_at,
        w.page_index,
        d.title AS document_title
      FROM wrong_words w
      LEFT JOIN documents d ON d.id = w.document_id
      WHERE w.user_id = ?
      ORDER BY w.last_wrong_at DESC
      LIMIT 200`,
    )
    .all(user.id) as Array<{
    id: string
    word: string
    expected: string
    written: string | null
    times: number
    last_wrong_at: string
    page_index: number | null
    document_title: string | null
  }>

  const fixedWrongWords = wrongWords.map((w) => ({
    ...w,
    document_title: w.document_title ? decodeUploadFilename(w.document_title) : w.document_title,
  }))

  res.json({
    user,
    documents: fixedDocuments,
    progress: fixedProgress,
    wrongWords: fixedWrongWords,
  })
})

adminRouter.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db
    .prepare('SELECT id, username FROM users WHERE id = ?')
    .get(req.params.id) as { id: string; username: string } | undefined

  if (!user) {
    res.status(404).json({ error: '用户不存在' })
    return
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM wrong_words WHERE user_id = ?').run(user.id)
    db.prepare('DELETE FROM page_progress WHERE user_id = ?').run(user.id)
    db.prepare('DELETE FROM documents WHERE user_id = ?').run(user.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
  })
  tx()
  scheduleDatabasePush()

  res.json({ ok: true, deleted: { id: user.id, username: user.username } })
})
