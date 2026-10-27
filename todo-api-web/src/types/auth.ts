export type User = {
  id: number
  name: string
  email: string
  role: 'USER' | 'ADMIN'
}

export type LoginResult = {
  token: string
  user: User
}
