import { useState } from 'react'
import type { FormEvent } from 'react'
import { createAdmin } from '../api/admin'

export function AdminForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await createAdmin(name, email, password)
      setMessage('管理员创建成功')
      setName('')
      setEmail('')
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="card admin-form" onSubmit={submit}>
        <div className="modal-title">
          <h2>添加管理员</h2>
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          昵称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
        </label>
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
          初始密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </label>
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
        <button>创建管理员</button>
      </form>
    </div>
  )
}
