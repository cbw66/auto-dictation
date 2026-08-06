import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

const ADMIN_TOKEN_KEY = 'echowrite_admin_token'
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

type Overview = {
  userCount: number
  documentCount: number
  wrongWordCount: number
  completedPages: number
  recentUsers: Array<{ username: string; created_at: string }>
}

type UserRow = {
  id: string
  username: string
  created_at: string
  document_count: number
  completed_pages: number
  total_pages: number
  correct_total: number
  wrong_total: number
  wrong_word_entries: number
  last_practiced_at: string | null
}

type UserDetail = {
  user: { id: string; username: string; created_at: string }
  documents: Array<{
    id: string
    title: string
    original_name: string
    page_count: number
    created_at: string
    completed_pages: number
    wrong_total: number
    correct_total: number
  }>
  progress: Array<{
    document_id: string
    document_title: string | null
    page_index: number
    status: string
    word_count: number
    correct_count: number
    wrong_count: number
    last_practiced_at: string | null
  }>
  wrongWords: Array<{
    id: string
    word: string
    expected: string
    written: string | null
    times: number
    last_wrong_at: string
    page_index: number | null
    document_title: string | null
  }>
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 (${res.status})`)
  return data as T
}

export function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)))
  const [error, setError] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadList() {
    const [ov, list] = await Promise.all([
      adminRequest<Overview>('/api/admin/overview'),
      adminRequest<{ users: UserRow[] }>('/api/admin/users'),
    ])
    setOverview(ov)
    setUsers(list.users)
  }

  useEffect(() => {
    if (!authed) return
    loadList().catch((e) => {
      setError(e instanceof Error ? e.message : '加载失败')
      if (String(e.message).includes('登录') || String(e.message).includes('过期')) {
        localStorage.removeItem(ADMIN_TOKEN_KEY)
        setAuthed(false)
      }
    })
  }, [authed])

  useEffect(() => {
    if (!authed || !selectedId) {
      setDetail(null)
      return
    }
    adminRequest<UserDetail>(`/api/admin/users/${selectedId}`)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : '加载用户失败'))
  }, [authed, selectedId])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await adminRequest<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token)
      setAuthed(true)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    setAuthed(false)
    setOverview(null)
    setUsers([])
    setSelectedId(null)
    setDetail(null)
  }

  async function deleteUser(userId: string, username: string) {
    if (!confirm(`确定删除账户「${username}」？\n将同时删除其文档、听写进度和错词，且不可恢复。`)) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await adminRequest(`/api/admin/users/${userId}`, { method: 'DELETE' })
      if (selectedId === userId) {
        setSelectedId(null)
        setDetail(null)
      }
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  if (!authed) {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <p className="eyebrow">Admin</p>
          <h1 className="auth-brand">账户监控</h1>
          <p className="auth-lead">输入管理员密码查看全部用户数据。</p>
          <form className="stack" onSubmit={onLogin}>
            <label>
              管理员密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? '登录中…' : '进入后台'}
            </button>
          </form>
          <p className="muted">
            <Link to="/login">返回用户登录</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page admin-page">
      <div className="admin-top">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>账户监控</h1>
        </div>
        <div className="row-actions">
          <button type="button" className="btn sm" onClick={() => loadList().catch(() => {})}>
            刷新
          </button>
          <button type="button" className="btn ghost sm" onClick={logout}>
            退出管理
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {overview && (
        <div className="admin-stats">
          <div>
            <strong>{overview.userCount}</strong>
            <span>用户</span>
          </div>
          <div>
            <strong>{overview.documentCount}</strong>
            <span>文档</span>
          </div>
          <div>
            <strong>{overview.completedPages}</strong>
            <span>已完成页</span>
          </div>
          <div>
            <strong>{overview.wrongWordCount}</strong>
            <span>错词条目</span>
          </div>
        </div>
      )}

      <div className="admin-grid">
        <section className="section">
          <h2>全部用户</h2>
          {users.length === 0 ? (
            <p className="muted">暂无用户</p>
          ) : (
            <ul className="doc-list">
              {users.map((u) => (
                <li key={u.id} className={`doc-row ${selectedId === u.id ? 'admin-selected' : ''}`}>
                  <div>
                    <button
                      type="button"
                      className="doc-title linkish"
                      onClick={() => setSelectedId(u.id)}
                    >
                      {u.username}
                    </button>
                    <p className="muted sm">
                      注册 {u.created_at} · 文档 {u.document_count} · 进度 {u.completed_pages}/
                      {u.total_pages} · 错词 {u.wrong_word_entries}
                      {u.last_practiced_at ? ` · 最近练习 ${u.last_practiced_at}` : ''}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn sm" onClick={() => setSelectedId(u.id)}>
                      详情
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm danger-btn"
                      disabled={busy}
                      onClick={() => deleteUser(u.id, u.username)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="section">
          <h2>{detail ? `${detail.user.username} 的详情` : '用户详情'}</h2>
          {!detail ? (
            <p className="muted">点击左侧用户查看文档、进度与错词。</p>
          ) : (
            <>
              <div className="admin-detail-head">
                <p className="muted sm">注册于 {detail.user.created_at}</p>
                <button
                  type="button"
                  className="btn ghost sm danger-btn"
                  disabled={busy}
                  onClick={() => deleteUser(detail.user.id, detail.user.username)}
                >
                  删除此账户
                </button>
              </div>

              <h3 className="admin-sub">文档（{detail.documents.length}）</h3>
              <ul className="doc-list">
                {detail.documents.map((d) => (
                  <li key={d.id} className="doc-row">
                    <div>
                      <strong>{d.title}</strong>
                      <p className="muted sm">
                        {d.original_name} · 完成 {d.completed_pages}/{d.page_count} · 对{' '}
                        {d.correct_total} / 错 {d.wrong_total}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <h3 className="admin-sub">错词（{detail.wrongWords.length}）</h3>
              {detail.wrongWords.length === 0 ? (
                <p className="muted sm">无错词记录</p>
              ) : (
                <ul className="wrong-list">
                  {detail.wrongWords.map((w) => (
                    <li key={w.id}>
                      <div>
                        <strong className="wrong-word">{w.expected}</strong>
                        <p className="muted sm">
                          写的是「{w.written || '空'}」· {w.times} 次
                          {w.document_title
                            ? ` · ${w.document_title}${
                                w.page_index != null ? ` 第 ${w.page_index + 1} 页` : ''
                              }`
                            : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="admin-sub">分页进度</h3>
              <ul className="result-list">
                {detail.progress.map((p) => (
                  <li key={`${p.document_id}-${p.page_index}`}>
                    <span>
                      {p.document_title || p.document_id} · 第 {p.page_index + 1} 页
                    </span>
                    <span>{p.status}</span>
                    <span>
                      对 {p.correct_count} / 错 {p.wrong_count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
