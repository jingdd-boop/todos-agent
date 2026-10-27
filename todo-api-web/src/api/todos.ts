import { api } from './client'
import type { Todo, TodoResult } from '../types/todo'

export function getTodos(filter: string) {
  const query = filter ? `?completed=${filter}` : ''
  return api<TodoResult>(`/api/todos${query}`)
}

export function createTodo(title: string) {
  return api<Todo>('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function updateTodo(id: number, completed: boolean) {
  return api<Todo>(`/api/todos/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ completed }),
  })
}

export function deleteTodo(id: number) {
  return api<void>(`/api/todos/${id}`, { method: 'DELETE' })
}
