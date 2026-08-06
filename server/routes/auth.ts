import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { db } from '../db.js'
import { requireAuth, signToken, getUser } from '../auth.js'
import { scheduleDatabasePush } from '../githubSync.js'
import { rateLimit } from '../rateLimit.js'

export const authRouter = Router()

const INVITE_CODE = 'cbwnb'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: 'auth-login',
  message: '登录尝试过多，请 15 分钟后再试',
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  key: 'auth-register',
  message: '注册过于频繁，请稍后再试',
})

authRouter.post('/register', registerLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const inviteCode = String(req.body?.inviteCode || '').trim()

  if (!username || username.length < 2) {
    res.status(400).json({ error: '用户名至少 2 个字符' })
    return
  }
  if (password.length < 4) {
    res.status(400).json({ error: '密码至少 4 个字符' })
    return
  }
  if (inviteCode !== INVITE_CODE) {
    res.status(400).json({ error: '邀请码不正确' })
    return
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    res.status(400).json({ error: '用户名已被占用' })
    return
  }

  const id = uuid()
  const password_hash = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
    id,
    username,
    password_hash,
  )

  const user = { id, username }
  scheduleDatabasePush()
  res.json({ token: signToken(user), user })
})

authRouter.post('/login', loginLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')

  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as { id: string; username: string; password_hash: string } | undefined

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  const user = { id: row.id, username: row.username }
  res.json({ token: signToken(user), user })
})

authRouter.get('/me', requireAuth, (req, res) => {
  const user = getUser(req)
  res.json({ user })
})
