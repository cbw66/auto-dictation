import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuid } from 'uuid'
import { db, uploadsDir } from '../db.js'
import { requireAuth, getUser } from '../auth.js'
import { extractPagesFromBuffer } from '../parseDocument.js'
import { scheduleDatabasePush } from '../githubSync.js'
import { decodeUploadFilename } from '../filename.js'

export const documentsRouter = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const original = decodeUploadFilename(file.originalname)
    const ext = path.extname(original).toLowerCase()
    cb(null, `${uuid()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const original = decodeUploadFilename(file.originalname)
    const ok = /\.(pdf|docx|doc|txt)$/i.test(original)
    cb(ok ? null : new Error('仅支持 PDF / Word / TXT'), ok)
  },
})

documentsRouter.use(requireAuth)

documentsRouter.get('/', (req, res) => {
  const user = getUser(req)
  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.original_name, d.page_count, d.created_at,
        (SELECT COUNT(*) FROM page_progress p WHERE p.document_id = d.id AND p.status = 'completed') AS completed_pages
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
  }>

  res.json({
    documents: rows.map((d) => ({
      ...d,
      title: decodeUploadFilename(d.title),
      original_name: decodeUploadFilename(d.original_name),
    })),
  })
})

documentsRouter.get('/:id', (req, res) => {
  const user = getUser(req)
  const row = db
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, user.id) as
    | {
        id: string
        title: string
        original_name: string
        page_count: number
        pages_json: string
        created_at: string
      }
    | undefined

  if (!row) {
    res.status(404).json({ error: '文档不存在' })
    return
  }

  const progress = db
    .prepare('SELECT * FROM page_progress WHERE document_id = ? AND user_id = ?')
    .all(row.id, user.id)

  res.json({
    document: {
      id: row.id,
      title: decodeUploadFilename(row.title),
      originalName: decodeUploadFilename(row.original_name),
      pageCount: row.page_count,
      pages: JSON.parse(row.pages_json) as string[][],
      createdAt: row.created_at,
    },
    progress,
  })
})

documentsRouter.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message || '上传失败' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: '请选择文件' })
      return
    }

    const user = getUser(req)
    const originalName = decodeUploadFilename(req.file.originalname)
    try {
      const buffer = fs.readFileSync(req.file.path)
      const pages = await extractPagesFromBuffer(buffer, originalName)
      if (!pages.length || pages.every((p) => p.length === 0)) {
        fs.unlinkSync(req.file.path)
        res.status(400).json({ error: '未能从文件中提取到英文单词' })
        return
      }

      const id = uuid()
      const title =
        String(req.body?.title || '').trim() ||
        path.basename(originalName, path.extname(originalName))

      db.prepare(
        `INSERT INTO documents (id, user_id, title, original_name, page_count, pages_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, user.id, title, originalName, pages.length, JSON.stringify(pages))

      const insertProgress = db.prepare(
        `INSERT INTO page_progress (id, user_id, document_id, page_index, status, word_count)
         VALUES (?, ?, ?, ?, 'not_started', ?)`,
      )
      const tx = db.transaction(() => {
        pages.forEach((words, index) => {
          insertProgress.run(uuid(), user.id, id, index, words.length)
        })
      })
      tx()
      scheduleDatabasePush()

      res.json({
        document: {
          id,
          title,
          originalName,
          pageCount: pages.length,
          pages,
        },
      })
    } catch (e) {
      console.error(e)
      try {
        fs.unlinkSync(req.file.path)
      } catch {
        /* ignore */
      }
      res.status(500).json({ error: e instanceof Error ? e.message : '解析文件失败' })
    }
  })
})

documentsRouter.delete('/:id', (req, res) => {
  const user = getUser(req)
  const result = db
    .prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .run(req.params.id, user.id)
  if (!result.changes) {
    res.status(404).json({ error: '文档不存在' })
    return
  }
  scheduleDatabasePush()
  res.json({ ok: true })
})
