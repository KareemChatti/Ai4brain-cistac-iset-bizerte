// First version for task 3.1. Task 3.3 adds logging and the personal-data reminder.
import { FormEvent, useState } from "react";
import { chat } from "@/api/client";
import { useApp } from "@/app/store";
import { PageTitle } from "@/app/ui";

type Line = { from: "me" | "coach"; text: string };

export default function ChatPage() {
  const userId = useApp((s) => s.userId)!;
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    setText("");
    setLines((l) => [...l, { from: "me", text: message }]);
    setBusy(true);
    try {
      const r = await chat(userId, message);
      setLines((l) => [...l, { from: "coach", text: r.reply }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle sub="Ask about your games and your progress. Please don't share personal details.">Coach</PageTitle>
      <div className="card flex min-h-[50vh] flex-col gap-3">
        <div className="flex-1 space-y-2">
          {lines.length === 0 && <p className="text-slate-500">Try: "What should I work on next?"</p>}
          {lines.map((l, i) => (
            <p
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                l.from === "me" ? "ml-auto bg-brand text-white" : "bg-slate-100"
              }`}
            >
              {l.text}
            </p>
          ))}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a question"
            aria-label="Message"
          />
          <button className="btn-primary" disabled={busy}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}
