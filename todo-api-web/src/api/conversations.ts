import { api } from './client'

export type Conversation = {
  id: number
  title: string | null
  status: string
  _count: { messages: number }
}

export function getConversations() {
  return api<{ success: boolean; data: Conversation[] }>('/api/conversations')
}

export function createConversation(title?: string) {
  return api<{ success: boolean; data: Conversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function deleteConversation(id: number) {
  return api<void>(`/api/conversations/${id}`, { method: 'DELETE' })
}

export function getConversation(id: number) {
  return api<{
    success: boolean
    data: Conversation & {
      messages: Array<{ role: string; content: string | null; toolName: string | null }>
    }
  }>(`/api/conversations/${id}`)
}
