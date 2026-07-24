"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What are my weakest topics?",
  "What should I practice next?",
  "How is my hard-problem coverage?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ messages: Message[] }>("/chat/history")
      .then((r) => setMessages(r.messages))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(question: string) {
    if (!question.trim() || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setSending(true);
    try {
      const res = await api<{ answer: string }>("/chat", { method: "POST", json: { question } });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — something went wrong answering that." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-white">AI Mentor</h1>
        <p className="text-sm text-gray-400">Grounded in your synced LeetCode data.</p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-4 text-gray-400">Ask me anything about your practice.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm text-gray-300 hover:border-[var(--color-accent)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-border)] bg-[var(--color-bg)] text-gray-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-gray-500">Thinking…</div>}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your strengths, weaknesses, what to practice…"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
