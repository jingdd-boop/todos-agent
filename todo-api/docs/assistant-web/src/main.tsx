import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Message = { role: "user" | "assistant"; content: string; tool?: string };

async function chat(message: string) {
  const token = localStorage.getItem("todo_token");
  const response = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "请求失败");
  return body.data as { answer: string; toolCalls: Array<{ name: string }> };
}

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "你好！你可以说“查看我的 Todo”，或“创建一个 Todo：学习 Agent”。" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput(""); setError(""); setLoading(true);
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      const result = await chat(text);
      setMessages((current) => [...current, { role: "assistant", content: result.answer, tool: result.toolCalls[0]?.name }]);
    } catch (err) { setError(err instanceof Error ? err.message : "请求失败"); }
    finally { setLoading(false); }
  }

  return <main className="shell">
    <section className="panel">
      <header><div><span className="eyebrow">TODO AGENT</span><h1>任务助手</h1></div><span className="status">● 本地工具模式</span></header>
      <div className="messages">{messages.map((item, index) => <article className={`message ${item.role}`} key={index}>
        <div className="bubble">{item.content.split("\n").map((line) => <div key={line}>{line || "\u00a0"}</div>)}{item.tool && <small>调用工具：{item.tool}</small>}</div>
      </article>)}{loading && <article className="message assistant"><div className="bubble muted">正在执行工具…</div></article>}</div>
      {error && <p className="error">{error}（请确认已登录，并把 JWT 保存到 localStorage.todo_token）</p>}
      <form onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：创建一个 Todo：阅读 Agent 文档" disabled={loading} /><button disabled={loading || !input.trim()}>发送</button></form>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
