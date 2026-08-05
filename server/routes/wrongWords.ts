import { Router } from 'express'
import { db } from '../db.js'
import { requireAuth, getUser } from '../auth.js'

export const wrongWordsRouter = Router()
wrongWordsRouter.use(requireAuth)

wrongWordsRouter.get('/', (req, res) => {
  const user = getUser(req)
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.expected, w.written, w.times, w.last_wrong_at, w.page_index,
              d.title AS document_title, d.id AS document_id
       FROM wrong_words w
       LEFT JOIN documents d ON d.id = w.document_id
       WHERE w.user_id = ?
       ORDER BY w.last_wrong_at DESC`,
    )
    .all(user.id)

  res.json({ wrongWords: rows })
})

wrongWordsRouter.delete('/:id', (req, res) => {
  const user = getUser(req)
  const result = db
    .prepare('DELETE FROM wrong_words WHERE id = ? AND user_id = ?')
    .run(req.params.id, user.id)
  if (!result.changes) {
    res.status(404).json({ error: '记录不存在' })
    return
  }
  res.json({ ok: true })
})
