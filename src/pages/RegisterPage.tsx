import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(username, password, inviteCode)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="eyebrow">Invite Only</p>
        <h1 className="auth-brand">EchoWrite</h1>
        <p className="auth-lead">填写邀请码即可注册，开始英语自动听写。</p>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            用户名
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </label>
          <label>
            邀请码
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              placeholder="请输入邀请码"
              autoComplete="off"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? '注册中…' : '注册'}
          </button>
        </form>
        <div className="auth-switch">
          <p className="muted">已有账号？</p>
          <Link className="btn" to="/login">
            去登录
          </Link>
        </div>
      </div>
    </div>
  )
}
