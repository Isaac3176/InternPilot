import { useRef, useState } from "react";
import { askChat, type ChatMessage } from "../ai/chat";
import { hasApiKey } from "../ai/settings";

const SUGGESTIONS = [
  "Which applications have not replied yet?",
  "How is my application search going?",
  "Which companies should I follow up with?",
  "How many rejections have I received?",
];

export default function AIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await askChat(question, history);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>AI Chat</h1>
          <p>Ask questions grounded in your actual application data.</p>
        </div>
      </div>

      <div className="chat-wrap">
        <div className="chat-log" ref={logRef}>
          {messages.length === 0 && (
            <div className="empty" style={{ marginBottom: 8 }}>
              {hasApiKey() ? "Ask me anything about your applications." : "Offline mode — add an OpenAI key in Settings for full answers."}
              <div className="tag-list" style={{ justifyContent: "center", marginTop: 14 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="secondary small" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role === "user" ? "user" : "bot"}`}>{m.content}</div>
          ))}
          {busy && <div className="chat-msg bot">Thinking…</div>}
        </div>

        <div className="chat-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about your applications, resumes, or progress..."
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()}>Send</button>
        </div>
      </div>
    </>
  );
}
