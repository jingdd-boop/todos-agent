import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, register } from '../api/auth'
import { TOKEN_KEY } from '../api/client'
import type { LoginResult } from '../types/auth'

const USER_KEY = 'todo_user'

export function AuthForm({ isRegister = false }: { isRegister?: boolean }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    try {
      if (isRegister) {
        await register(name, email, password)
        navigate('/login')
        return
      }

      const result: LoginResult = await login(email, password)
      localStorage.setItem(TOKEN_KEY, result.token)
      localStorage.setItem(USER_KEY, JSON.stringify(result.user))
      navigate('/todos')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败')
    }
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={handleSubmit}>
        <p className="eyebrow">TODO SPACE</p>
        <h1>{isRegister ? '创建账号' : '欢迎回来'}</h1>

        {isRegister && (
          <label>
            昵称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              required
            />
          </label>
        )}

        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button>{isRegister ? '注册' : '登录'}</button>
        <p>
          {isRegister ? '已有账号？' : '还没有账号？'}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? '去登录' : '去注册'}</Link>
        </p>
      </form>
    </main>
  )
}
