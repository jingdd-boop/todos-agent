import { TOKEN_KEY } from './client'

export type AssistantResponse = {
  success: boolean
  data: {
    answer: string
    toolCalls: Array<{ name: string; arguments: Record<string, unknown>; result?: unknown }>
    modelSteps: Array<{
      step: number
      phase: 'intent' | 'final_answer'
      model: string
      messageCount: number
      decision: string
      toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>
    }>
    conversationId: number
  }
}

export function chatWithAssistant(message: string, conversationId?: number) {
  const request = {
    method: 'POST',
    url: '/api/assistant/chat',
    body: { message, ...(conversationId ? { conversationId } : {}) },
  }
  const token = localStorage.getItem(TOKEN_KEY)
  return fetch(request.url, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request.body),
  }).then(async (response) => {
    const body = (await response.json().catch(() => ({}))) as AssistantResponse & {
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(body.error?.message || '请求失败')
    return { body, meta: { ...request, status: response.status, hasAuthorization: Boolean(token) } }
  })
}

export function confirmAssistantAction(confirmationId: string) {
  return fetch('/api/assistant/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
    },
    body: JSON.stringify({ confirmationId }),
  }).then(async (response) => {
    const body = await response.json()
    if (!response.ok) throw new Error(body.error?.message || '确认失败')
    return body
  })
}

export async function streamAssistant(
  message: string,
  onEvent: (event: string, data: any) => void,
  conversationId?: number,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 60_000)
  const response = await fetch('/api/assistant/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
    },
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
    signal: controller.signal,
  })
  try {
    if (!response.ok || !response.body) throw new Error('流式请求失败')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const block of events) {
        const event = block.match(/^event:\s*(.+)$/m)?.[1]
        const data = block.match(/^data:\s*(.+)$/m)?.[1]
        if (!event || data === undefined) continue
        const parsed = JSON.parse(data)
        if (event === 'error') throw new Error(parsed.message || '流式请求失败')
        onEvent(event, parsed)
        if (event === 'done') {
          await reader.cancel()
          return
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error('流式请求超时，请检查模型服务是否可用')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
