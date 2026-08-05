import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-text">EchoWrite</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            听写
          </NavLink>
          <NavLink to="/profile">个人主页</NavLink>
        </nav>
        <div className="user-chip">
          <span>{user?.username}</span>
          <button type="button" className="btn ghost sm" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
