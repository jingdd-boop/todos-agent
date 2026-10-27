import { api } from './client'
import type { User } from '../types/auth'

export function createAdmin(name: string, email: string, password: string) {
  return api<User>('/api/auth/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
}
