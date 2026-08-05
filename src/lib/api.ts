import { extractPagesFromFile } from './parseDocument'

const TOKEN_KEY = 'echowrite_token'
const DB_KEY = 'echowrite_db'
const INVITE_CODE = 'cbwnb'

export type User = { id: string; username: string }

type StoredUser = User & { passwordHash: string }

type DocumentRow = {
  id: string
  userId: string
  title: string
  originalName: string
  pages: string[][]
  createdAt: string
}

type ProgressRow = {
  id: string
  userId: string
  documentId: string
  pageIndex: number
  status: string
  wordCount: number
  correctCount: number
  wrongCount: number
  lastPracticedAt: string | null
}

type WrongWordRow = {
  id: string
  userId: string
  documentId: string | null
  pageIndex: number | null
  word: string
  expected: string
  written: string | null
  times: number
  lastWrongAt: string
}

type Db = {
  users: StoredUser[]
  documents: DocumentRow[]
  progress: ProgressRow[]
  wrongWords: WrongWordRow[]
}

function uid() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

function loadDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    /* ignore */
  }
  return { users: [], documents: [], progress: [], wrongWords: [] }
}

function saveDb(db: Db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db))
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`echowrite:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function currentUserId(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function requireUser(db: Db): StoredUser {
  const id = currentUserId()
  const user = db.users.find((u) => u.id === id)
  if (!user) throw new Error('请先登录')
  return user
}

export const api = {
  async register(body: { username: string; password: string; inviteCode: string }) {
    const username = body.username.trim()
    const password = body.password
    if (username.length < 2) throw new Error('用户名至少 2 个字符')
    if (password.length < 4) throw new Error('密码至少 4 个字符')
    if (body.inviteCode.trim() !== INVITE_CODE) throw new Error('邀请码不正确')

    const db = loadDb()
    if (db.users.some((u) => u.username === username)) throw new Error('用户名已被占用')

    const user: StoredUser = {
      id: uid(),
      username,
      passwordHash: await hashPassword(password),
    }
    db.users.push(user)
    saveDb(db)
    localStorage.setItem(TOKEN_KEY, user.id)
    return { token: user.id, user: { id: user.id, username: user.username } }
  },

  async login(body: { username: string; password: string }) {
    const db = loadDb()
    const user = db.users.find((u) => u.username === body.username.trim())
    const hash = await hashPassword(body.password)
    if (!user || user.passwordHash !== hash) throw new Error('用户名或密码错误')
    localStorage.setItem(TOKEN_KEY, user.id)
    return { token: user.id, user: { id: user.id, username: user.username } }
  },

  async me() {
    const db = loadDb()
    const user = requireUser(db)
    return { user: { id: user.id, username: user.username } }
  },

  async documents() {
    const db = loadDb()
    const user = requireUser(db)
    const documents = db.documents
      .filter((d) => d.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => {
        const completed = db.progress.filter(
          (p) => p.documentId === d.id && p.status === 'completed',
        ).length
        return {
          id: d.id,
          title: d.title,
          original_name: d.originalName,
          page_count: d.pages.length,
          completed_pages: completed,
          created_at: d.createdAt,
        }
      })
    return { documents }
  },

  async document(id: string) {
    const db = loadDb()
    const user = requireUser(db)
    const d = db.documents.find((x) => x.id === id && x.userId === user.id)
    if (!d) throw new Error('文档不存在')
    const progress = db.progress
      .filter((p) => p.documentId === id && p.userId === user.id)
      .map((p) => ({
        page_index: p.pageIndex,
        status: p.status,
        word_count: p.wordCount,
        correct_count: p.correctCount,
        wrong_count: p.wrongCount,
        last_practiced_at: p.lastPracticedAt,
      }))
    return {
      document: {
        id: d.id,
        title: d.title,
        originalName: d.originalName,
        pageCount: d.pages.length,
        pages: d.pages,
        createdAt: d.createdAt,
      },
      progress,
    }
  },

  async uploadDocument(file: File, title?: string) {
    const db = loadDb()
    const user = requireUser(db)
    const pages = await extractPagesFromFile(file)
    if (!pages.length || pages.every((p) => p.length === 0)) {
      throw new Error('未能从文件中提取到英文单词')
    }
    const id = uid()
    const docTitle = (title || '').trim() || file.name.replace(/\.[^.]+$/, '')
    const doc: DocumentRow = {
      id,
      userId: user.id,
      title: docTitle,
      originalName: file.name,
      pages,
      createdAt: now(),
    }
    db.documents.push(doc)
    pages.forEach((words, pageIndex) => {
      db.progress.push({
        id: uid(),
        userId: user.id,
        documentId: id,
        pageIndex,
        status: 'not_started',
        wordCount: words.length,
        correctCount: 0,
        wrongCount: 0,
        lastPracticedAt: null,
      })
    })
    saveDb(db)
    return {
      document: {
        id,
        title: docTitle,
        originalName: file.name,
        pageCount: pages.length,
        pages,
      },
    }
  },

  async deleteDocument(id: string) {
    const db = loadDb()
    const user = requireUser(db)
    const before = db.documents.length
    db.documents = db.documents.filter((d) => !(d.id === id && d.userId === user.id))
    if (db.documents.length === before) throw new Error('文档不存在')
    db.progress = db.progress.filter((p) => p.documentId !== id)
    db.wrongWords = db.wrongWords.map((w) =>
      w.documentId === id ? { ...w, documentId: null } : w,
    )
    saveDb(db)
    return { ok: true }
  },

  async progressSummary() {
    const db = loadDb()
    const user = requireUser(db)
    const documents = db.documents
      .filter((d) => d.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => {
        const prog = db.progress.filter((p) => p.documentId === d.id)
        return {
          id: d.id,
          title: d.title,
          original_name: d.originalName,
          page_count: d.pages.length,
          completed_pages: prog.filter((p) => p.status === 'completed').length,
          in_progress_pages: prog.filter((p) => p.status === 'in_progress').length,
          wrong_total: prog.reduce((s, p) => s + p.wrongCount, 0),
          correct_total: prog.reduce((s, p) => s + p.correctCount, 0),
          created_at: d.createdAt,
        }
      })
    return { documents }
  },

  async submitGrade(body: {
    documentId: string
    pageIndex: number
    results: Array<{ expected: string; written: string; correct: boolean }>
  }) {
    const db = loadDb()
    const user = requireUser(db)
    const doc = db.documents.find((d) => d.id === body.documentId && d.userId === user.id)
    if (!doc) throw new Error('文档不存在')

    const correctCount = body.results.filter((r) => r.correct).length
    const wrongCount = body.results.length - correctCount
    let prog = db.progress.find(
      (p) =>
        p.userId === user.id &&
        p.documentId === body.documentId &&
        p.pageIndex === body.pageIndex,
    )
    if (!prog) {
      prog = {
        id: uid(),
        userId: user.id,
        documentId: body.documentId,
        pageIndex: body.pageIndex,
        status: 'completed',
        wordCount: body.results.length,
        correctCount,
        wrongCount,
        lastPracticedAt: now(),
      }
      db.progress.push(prog)
    } else {
      prog.status = 'completed'
      prog.correctCount = correctCount
      prog.wrongCount = wrongCount
      prog.wordCount = body.results.length
      prog.lastPracticedAt = now()
    }

    for (const r of body.results) {
      if (r.correct) continue
      const word = r.expected.trim().toLowerCase()
      const existing = db.wrongWords.find(
        (w) =>
          w.userId === user.id &&
          w.word === word &&
          w.documentId === body.documentId &&
          w.pageIndex === body.pageIndex,
      )
      if (existing) {
        existing.times += 1
        existing.written = r.written || ''
        existing.expected = r.expected
        existing.lastWrongAt = now()
      } else {
        db.wrongWords.push({
          id: uid(),
          userId: user.id,
          documentId: body.documentId,
          pageIndex: body.pageIndex,
          word,
          expected: r.expected,
          written: r.written || '',
          times: 1,
          lastWrongAt: now(),
        })
      }
    }

    saveDb(db)
    return {
      correctCount,
      wrongCount,
      total: body.results.length,
      accuracy: body.results.length ? Math.round((correctCount / body.results.length) * 100) : 0,
    }
  },

  async wrongWords() {
    const db = loadDb()
    const user = requireUser(db)
    const wrongWords = db.wrongWords
      .filter((w) => w.userId === user.id)
      .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt))
      .map((w) => {
        const doc = db.documents.find((d) => d.id === w.documentId)
        return {
          id: w.id,
          word: w.word,
          expected: w.expected,
          written: w.written,
          times: w.times,
          last_wrong_at: w.lastWrongAt,
          page_index: w.pageIndex,
          document_title: doc?.title ?? null,
          document_id: w.documentId,
        }
      })
    return { wrongWords }
  },

  async deleteWrongWord(id: string) {
    const db = loadDb()
    const user = requireUser(db)
    const before = db.wrongWords.length
    db.wrongWords = db.wrongWords.filter((w) => !(w.id === id && w.userId === user.id))
    if (db.wrongWords.length === before) throw new Error('记录不存在')
    saveDb(db)
    return { ok: true }
  },
}

export { TOKEN_KEY }
