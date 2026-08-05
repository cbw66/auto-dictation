const TOKEN_KEY = 'echowrite_token'

export type User = { id: string; username: string }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`)
  }
  return data as T
}

export const api = {
  register: (body: { username: string; password: string; inviteCode: string }) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { username: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => request<{ user: User }>('/api/auth/me'),
  documents: () =>
    request<{
      documents: Array<{
        id: string
        title: string
        original_name: string
        page_count: number
        completed_pages: number
        created_at: string
      }>
    }>('/api/documents'),
  document: (id: string) =>
    request<{
      document: {
        id: string
        title: string
        originalName: string
        pageCount: number
        pages: string[][]
        createdAt: string
      }
      progress: Array<{
        page_index: number
        status: string
        word_count: number
        correct_count: number
        wrong_count: number
        last_practiced_at: string | null
      }>
    }>(`/api/documents/${id}`),
  uploadDocument: (file: File, title?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (title) fd.append('title', title)
    return request<{
      document: {
        id: string
        title: string
        originalName: string
        pageCount: number
        pages: string[][]
      }
    }>('/api/documents', { method: 'POST', body: fd })
  },
  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/api/documents/${id}`, { method: 'DELETE' }),
  progressSummary: () =>
    request<{
      documents: Array<{
        id: string
        title: string
        original_name: string
        page_count: number
        completed_pages: number
        in_progress_pages: number
        wrong_total: number
        correct_total: number
        created_at: string
      }>
    }>('/api/progress/summary'),
  submitGrade: (body: {
    documentId: string
    pageIndex: number
    results: Array<{ expected: string; written: string; correct: boolean }>
  }) =>
    request<{
      correctCount: number
      wrongCount: number
      total: number
      accuracy: number
    }>('/api/progress/grade', { method: 'POST', body: JSON.stringify(body) }),
  wrongWords: () =>
    request<{
      wrongWords: Array<{
        id: string
        word: string
        expected: string
        written: string | null
        times: number
        last_wrong_at: string
        page_index: number | null
        document_title: string | null
        document_id: string | null
      }>
    }>('/api/wrong-words'),
  deleteWrongWord: (id: string) =>
    request<{ ok: boolean }>(`/api/wrong-words/${id}`, { method: 'DELETE' }),
}

export { TOKEN_KEY }
