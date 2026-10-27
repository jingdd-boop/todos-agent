const TOKEN_KEY = 'todo_token'
const API_HOST = import.meta.env.VITE_API_HOST || 'http://localhost:3000'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_HOST}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body.error?.message || body.message || '请求失败')
  }

  return body as T
}

export { TOKEN_KEY }
