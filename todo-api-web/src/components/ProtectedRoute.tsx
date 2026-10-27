import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { TOKEN_KEY } from '../api/client'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  return localStorage.getItem(TOKEN_KEY) ? <>{children}</> : <Navigate to="/login" replace />
}
