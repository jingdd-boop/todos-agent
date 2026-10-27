import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { chatWithAssistant, confirmAssistantAction, streamAssistant } from '../api/assistant'
import type { AssistantResponse } from '../api/assistant'
import type { Todo } from '../types/todo'
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  type Conversation,
} from '../api/conversations'

type Message = { role: 'user' | 'assistant'; content: string; tool?: string; todos?: Todo[] }
type Confirmation = { confirmationId: string; todoId: number }
type TraceEvent = { id: number; event: string; data: unknown; time: string }
type Trace = {
  request: unknown
  response: unknown
  tool?: string
  status: number
  hasAuthorization: boolean
  modelSteps: AssistantResponse['data']['modelSteps']
  events: TraceEvent[]
}

function todoResult(value: unknown): Todo[] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as { result?: unknown; tool?: string; todos?: unknown }
  const result = source.result && typeof source.result === 'object' ? source.result as { tool?: string; todos?: unknown } : source
  if (result.tool !== 'list_todos' || !Array.isArray(result.todos)) return undefined
  return result.todos.filter(
    (todo): todo is Todo =>
      Boolean(todo) &&
      typeof todo === 'object' &&
      typeof (todo as Todo).id === 'number' &&
      typeof (todo as Todo).title === 'string' &&
      typeof (todo as Todo).completed === 'boolean',
  )
}

function TodoResultView({ todos }: { todos: Todo[] }) {
  const completed = todos.filter((todo) => todo.completed).length
  const pending = todos.length - completed
  const completionRate = todos.length ? Math.round((completed / todos.length) * 100) : 0

  return (
    <div className="todo-result-view">
      <div className="todo-summary">
        <div>
          <div
            className="todo-donut"
            style={{ background: `conic-gradient(#c8557e ${completionRate}%, #f6dce6 0)` }}
            role="img"
            aria-label={`完成比例 ${completionRate}%`}
          >
            <span>{completionRate}%</span>
          </div>
          <span>完成比例</span>
        </div>
        <div>
          <strong>{pending}</strong>
          <span>未完成</span>
        </div>
        <div>
          <strong>{completed}</strong>
          <span>已完成</span>
        </div>
      </div>
      <div className="todo-progress" aria-label={`完成比例 ${completionRate}%`}>
        <span style={{ width: `${completionRate}%` }} />
      </div>
      {todos.length === 0 ? (
        <p className="todo-result-empty">暂时没有符合条件的 Todo。</p>
      ) : (
        <div className="todo-table-wrap">
          <table className="todo-result-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>任务</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((todo) => (
                <tr key={todo.id}>
                  <td>
                    <span className={`todo-status ${todo.completed ? 'done' : 'pending'}`}>
                      {todo.completed ? '已完成' : '未完成'}
                    </span>
                  </td>
                  <td>{todo.title}</td>
                  <td>{new Date(todo.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！你可以说“查看我的 Todo”，或“创建一个 Todo：学习 Agent”。',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [trace, setTrace] = useState<Trace | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [conversationId, setConversationId] = useState<number>()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [streaming, setStreaming] = useState(true)

  function appendTraceEvent(event: string, data: unknown) {
    setTrace((current) =>
      current
        ? {
            ...current,
            events: [
              ...current.events,
              {
                id: Date.now() + current.events.length,
                event,
                data,
                time: new Date().toLocaleTimeString(),
              },
            ],
          }
        : current,
    )
  }

  async function loadConversations() {
    const result = await getConversations()
    setConversations(result.data)
  }

  useEffect(() => {
    void loadConversations()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return
    setMessages((current) => [...current, { role: 'user', content: message }])
    setInput('')
    setError('')
    setLoading(true)
    setTrace({
      request: { message, ...(conversationId ? { conversationId } : {}) },
      response: null,
      status: 0,
      hasAuthorization: Boolean(localStorage.getItem('todo_token')),
      modelSteps: [],
      events: [],
    })
    try {
      if (streaming) {
        let answer = ''
        setMessages((current) => [...current, { role: 'assistant', content: '' }])
        await streamAssistant(
          message,
          (event, data) => {
            appendTraceEvent(event, data)
            if (event === 'token') {
              answer += data.text
              setMessages((current) => {
                const last = current[current.length - 1]
                return [
                  ...current.slice(0, -1),
                  {
                    role: 'assistant',
                    content: answer,
                    ...(last?.role === 'assistant'
                      ? { todos: last.todos, tool: last.tool }
                      : {}),
                  },
                ]
              })
            }
            if (event === 'retrieval')
              setTrace((current) =>
                current ? { ...current, response: data, status: 200, tool: 'RAG search' } : current,
              )
            if (event === 'tool_call_ready')
              setTrace((current) =>
                current ? { ...current, tool: data.name, response: data } : current,
              )
            if (event === 'tool_result') {
              const todos = todoResult(data.result)
              if (todos) {
                setMessages((current) => {
                  const last = current[current.length - 1]
                  if (!last || last.role !== 'assistant') return current
                  return [...current.slice(0, -1), { ...last, todos }]
                })
              }
            }
            if (event === 'confirmation_required' && data.confirmationId && data.todoId)
              setConfirmation({ confirmationId: data.confirmationId, todoId: data.todoId })
          },
          conversationId,
        )
        setMessages((current) => {
          const last = current[current.length - 1]
          return [
            ...current.slice(0, -1),
            {
              role: 'assistant',
              content: answer,
              ...(last?.role === 'assistant' ? { todos: last.todos, tool: last.tool } : {}),
            },
          ]
        })
        return
      }
      const result = await chatWithAssistant(message, conversationId)
      setConversationId(result.body.data.conversationId)
      void loadConversations()
      const call = result.body.data.toolCalls[0]
      const pending = call?.result as Partial<Confirmation> | undefined
      if (call?.name === 'delete_todo' && pending?.confirmationId && pending.todoId) {
        setConfirmation({ confirmationId: pending.confirmationId, todoId: pending.todoId })
      }
      setTrace({
        request: result.meta.body,
        response: result.body,
        status: result.meta.status,
        hasAuthorization: result.meta.hasAuthorization,
        tool: call?.name,
        modelSteps: result.body.data.modelSteps,
        events: [
          {
            id: Date.now(),
            event: 'response',
            data: result.body,
            time: new Date().toLocaleTimeString(),
          },
        ],
      })
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: result.body.data.answer,
          tool: call?.name,
          todos: todoResult(call?.result),
        },
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  async function newConversation() {
    const result = await createConversation('新的 Todo 对话')
    setConversationId(result.data.id)
    setMessages([{ role: 'assistant', content: '新对话已创建。你可以开始管理 Todo。' }])
    void loadConversations()
  }

  async function switchConversation(id: number) {
    const result = await getConversation(id)
    setConversationId(id)
    setMessages(
      result.data.messages
        .filter((item) => item.content)
        .map((item) => ({
          role: item.role === 'user' ? 'user' : 'assistant',
          content: item.content || '',
          tool: item.toolName || undefined,
        })),
    )
  }

  async function confirmDelete() {
    if (!confirmation) return
    setLoading(true)
    try {
      await confirmAssistantAction(confirmation.confirmationId)
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: `已确认并删除 Todo #${confirmation.todoId}。` },
      ])
      setConfirmation(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '确认失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="assistant-page">
      <section className="assistant-panel">
        <header className="assistant-header">
          <div>
            <p className="eyebrow">TODO AGENT</p>
            <h1>任务助手</h1>
            <small>Conversation: {conversationId ?? '尚未创建'}</small>
          </div>
          <div className="assistant-actions">
            <span>● 本地工具模式</span>
            <Link to="/todos">返回 Todo</Link>
          </div>
        </header>
        <div className="assistant-workspace">
          <div className="assistant-messages">
            <label className="stream-toggle">
              <input
                type="checkbox"
                checked={streaming}
                onChange={(event) => setStreaming(event.target.checked)}
              />{' '}
              启用流式响应
            </label>
            <div className="conversation-bar">
              <button onClick={() => void newConversation()}>新建对话</button>
              {conversations.map((item) => (
                <button
                  key={item.id}
                  className={item.id === conversationId ? 'active' : ''}
                  onClick={() => void switchConversation(item.id)}
                >
                  {item.title || `对话 ${item.id}`}
                </button>
              ))}
              {conversationId && (
                <button
                  className="danger-link"
                  onClick={() => {
                    void deleteConversation(conversationId).then(() => {
                      setConversationId(undefined)
                      setMessages([])
                      void loadConversations()
                    })
                  }}
                >
                  删除当前对话
                </button>
              )}
            </div>
            {messages.map((item, index) => (
              <article className={`assistant-message ${item.role}`} key={`${item.role}-${index}`}>
                <div className="assistant-bubble">
                  {item.content.split('\n').map((line, lineIndex) => (
                    <div key={lineIndex}>{line || '\u00a0'}</div>
                  ))}
                  {item.tool && <small>调用工具：{item.tool}</small>}
                  {item.todos && <TodoResultView todos={item.todos} />}
                </div>
              </article>
            ))}
            {loading && (
              <article className="assistant-message assistant">
                <div className="assistant-bubble muted">正在执行工具…</div>
              </article>
            )}
          </div>
          <aside className="assistant-trace">
            <div className="trace-title">
              <div>
                <p className="eyebrow">REQUEST TRACE</p>
                <h2>一次请求的完整流程</h2>
              </div>
              {trace && <span className="trace-status">HTTP {trace.status}</span>}
            </div>
            <div className="flow">
              <span>① 输入消息</span>
              <i>→</i>
              <span>② POST /api/assistant/chat</span>
              <i>→</i>
              <span>③ 执行工具</span>
              <i>→</i>
              <span>④ 返回回复</span>
            </div>
            {!trace ? (
              <p className="trace-empty">发送一条消息后，这里会展示真实请求和响应。</p>
            ) : (
              <>
                <p className="trace-auth">
                  Authorization：{trace.hasAuthorization ? '已携带 JWT' : '未携带 JWT'}
                </p>
                <details open>
                  <summary>请求 Request</summary>
                  <pre>{JSON.stringify(trace.request, null, 2)}</pre>
                </details>
                <details open>
                  <summary>接口 Response</summary>
                  <pre>{JSON.stringify(trace.response, null, 2)}</pre>
                </details>
                <details open>
                  <summary>流式事件时间线（{trace.events.length}）</summary>
                  <div className="trace-events">
                    {trace.events.map((item, index) => (
                      <div className={`trace-event trace-event-${item.event}`} key={item.id}>
                        <div className="trace-event-head">
                          <b>
                            {index + 1}. {item.event}
                          </b>
                          <small>{item.time}</small>
                        </div>
                        <pre>{JSON.stringify(item.data, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </details>
                <p className="trace-tool">
                  工具执行：<b>{trace.tool}</b>
                </p>
                <details open>
                  <summary>大模型调用与意图识别</summary>
                  <div className="model-steps">
                    {trace.modelSteps.map((step) => (
                      <div className="model-step" key={step.step}>
                        <b>
                          Step {step.step} ·{' '}
                          {step.phase === 'intent' ? '意图识别 / 工具决策' : '最终回答'}
                        </b>
                        <span>{step.decision}</span>
                        <small>
                          模型：{step.model} · 上下文消息数：{step.messageCount}
                        </small>
                        {step.toolCalls.length > 0 && (
                          <pre>{JSON.stringify(step.toolCalls, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
            {confirmation && (
              <div className="confirmation-card">
                <b>需要人工确认</b>
                <span>Agent 请求删除 Todo #{confirmation.todoId}</span>
                <button onClick={() => void confirmDelete()} disabled={loading}>
                  确认删除
                </button>
              </div>
            )}
          </aside>
        </div>
        {error && <p className="error assistant-error">{error}</p>}
        <form className="assistant-form" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：创建一个 Todo：阅读 Agent 文档"
            disabled={loading}
          />
          <button disabled={loading || !input.trim()}>发送</button>
        </form>
      </section>
    </main>
  )
}
