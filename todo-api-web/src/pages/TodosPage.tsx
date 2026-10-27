import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createTodo, deleteTodo, getTodos, updateTodo } from '../api/todos'
import { TOKEN_KEY } from '../api/client'
import { TodoItem } from '../components/TodoItem'
import { AdminForm } from '../components/AdminForm'
import type { User } from '../types/auth'
import type { Todo } from '../types/todo'

const USER_KEY = 'todo_user'

export function TodosPage() {
  const currentUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [showAdminForm, setShowAdminForm] = useState(false)

  async function loadTodos() {
    try {
      const result = await getTodos(filter)
      setTodos(result.data)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败')
    }
  }

  useEffect(() => {
    void loadTodos()
  }, [filter])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    await createTodo(title.trim())
    setTitle('')
    void loadTodos()
  }

  async function handleToggle(todo: Todo) {
    await updateTodo(todo.id, !todo.completed)
    void loadTodos()
  }

  async function handleDelete(todo: Todo) {
    if (!confirm(`删除「${todo.title}」？`)) return
    await deleteTodo(todo.id)
    void loadTodos()
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    location.href = '/login'
  }

  return (
    <main className="page">
      <header>
        <div>
          <p className="eyebrow">TODO SPACE</p>
          <h1>我的任务</h1>
        </div>
        <div>
          {currentUser?.name} <b>{currentUser?.role}</b>{' '}
          {currentUser?.role === 'ADMIN' && (
            <button className="ghost" onClick={() => setShowAdminForm(true)}>
              添加管理员
            </button>
          )}{' '}
          <button className="ghost" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      <section className="content">
        <form className="create" onSubmit={handleCreate}>
          <input
            placeholder="接下来要完成什么？"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button>添加 Todo</button>
        </form>
        <nav>
          <div>
            <button onClick={() => setFilter('')}>全部</button>
            <button onClick={() => setFilter('false')}>未完成</button>
            <button onClick={() => setFilter('true')}>已完成</button>
          </div>
          <span>
            {currentUser?.role === 'ADMIN' ? '管理员：全部 Todo' : '只显示你的 Todo'}{' '}
            <Link to="/assistant" className="assistant-link">
              打开任务助手
            </Link>
          </span>
        </nav>
        {error && <p className="error">{error}</p>}
        <div className="list">
          {todos.length ? (
            todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() => void handleToggle(todo)}
                onDelete={() => void handleDelete(todo)}
              />
            ))
          ) : (
            <p className="empty">还没有 Todo</p>
          )}
        </div>
      </section>
      {showAdminForm && <AdminForm onClose={() => setShowAdminForm(false)} />}
    </main>
  )
}
