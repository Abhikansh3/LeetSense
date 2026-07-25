"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TopBar } from "@/components/TopBar";
import { SendIcon, SparkIcon } from "@/components/icons";

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
    <div className="flex h-screen flex-col">
      <TopBar title="AI Mentor" subtitle="Grounded in your synced LeetCode data." />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-8">
        <div className="flex-1 space-y-5 overflow-y-auto py-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <SparkIcon size={22} />
              </div>
              <p className="text-[15px] font-medium">Ask about your practice</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Answers are grounded in your synced data.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-accent)] px-4 py-2.5 text-sm text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <SparkIcon size={15} />
                </div>
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm leading-relaxed">
                  {m.content}
                </div>
              </div>
            ),
          )}

          {sending && (
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <SparkIcon size={15} />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-faint)]"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mb-6 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 focus-within:border-[var(--color-accent)]"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your strengths, weaknesses, what to practice…"
            className="flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--color-faint)]"
          />
          <button type="submit" disabled={sending || !input.trim()} className="btn btn-primary h-9 w-9 !px-0">
            <SendIcon size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
