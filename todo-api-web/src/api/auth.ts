import { api } from './client'
import type { LoginResult, User } from '../types/auth'

export function register(name: string, email: string, password: string) {
  return api<User>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
}

export function login(email: string, password: string) {
  return api<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}
