import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { DocumentPage } from './pages/DocumentPage'
import { DictationPage } from './pages/DictationPage'
import { GradePage } from './pages/GradePage'
import { ProfilePage } from './pages/ProfilePage'

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-screen">加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function GuestOnly() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-screen">加载中…</div>
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/docs/:id" element={<DocumentPage />} />
          <Route path="/docs/:id/page/:pageIndex/dictation" element={<DictationPage />} />
          <Route path="/docs/:id/page/:pageIndex/grade" element={<GradePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
