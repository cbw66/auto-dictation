import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { db, uploadsDir } from './db.js'
import { authRouter } from './routes/auth.js'
import { documentsRouter } from './routes/documents.js'
import { progressRouter } from './routes/progress.js'
import { wrongWordsRouter } from './routes/wrongWords.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 8787

app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/progress', progressRouter)
app.use('/api/wrong-words', wrongWordsRouter)

const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: '前端尚未构建，请使用 npm run dev' })
  })
})

app.listen(PORT, () => {
  console.log(`Auto Dictation API http://localhost:${PORT}`)
})

// Keep db reference so process doesn't drop it early in some bundlers
void db
