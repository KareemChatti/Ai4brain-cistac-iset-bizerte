// First version for task 3.1. Task 3.5 adds the rules carousel, the full consent text and the language choice.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, createUser, postConsent } from "@/api/client";
import { CONSENT_VERSION, useApp } from "@/app/store";

/** Same rules as the backend (backend/app/privacy.py): a nickname only, never contact details. */
export function nicknameProblem(raw: string): string | null {
  const nickname = raw.trim().replace(/\s+/g, " ");
  if (!nickname) return "Choose a nickname.";
  if (nickname.length > 32) return "Keep it to 32 characters or fewer.";
  if (/\S+@\S+\.\S+/.test(nickname) || /(?:\+?\d[\s\-.]?){8,}/.test(nickname) || /https?:\/\/|www\./i.test(nickname)) {
    return "Please choose a nickname, not an email, phone number or link.";
  }
  if (!/^[\p{L}\p{N}_ .'()-]+$/u.test(nickname)) return "Use letters, digits, spaces and . ' ( ) - _ only.";
  return null;
}

/** The backend's 422 message, without the technical wrapping. */
function serverMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 422) {
    const match = err.message.match(/"msg":"(?:Value error, )?([^"]+)"/);
    if (match) return match[1];
  }
  return "Something went wrong. Please try again.";
}

export default function WelcomePage() {
  const { userId, setUserId, setConsent } = useApp();
  const [nickname, setNickname] = useState("");
  const [agree, setAgree] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/home";
  const problem = userId ? null : nicknameProblem(nickname);

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      let id = userId;
      if (!id) {
        id = (await createUser(nickname.trim().replace(/\s+/g, " "))).user_id;
        setUserId(id);
      }
      await postConsent(id, CONSENT_VERSION, analytics);
      setConsent(CONSENT_VERSION);
      navigate(from, { replace: true });
    } catch (err) {
      setError(serverMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">Welcome to AI4Brain Rami</h1>
      <div className="mt-4 space-y-2 text-lg text-slate-700">
        <p>Play Rami against the computer and get a coach that explains your decisions.</p>
        <p>
          Play whole matches to 401, 501, 701 or 1001 with your own house rules (the Rules tab). During your turn the
          coach warns you about what it can prove, like a missed lay-off or a discard that helps your opponent. Each
          decision trains memory, attention, speed, reasoning and flexibility.
        </p>
        <p className="font-semibold">This is a game for training thinking skills. It is not a medical test.</p>
      </div>
      <section className="card mt-6 space-y-3">
        {!userId && (
          <label className="block">
            <span className="font-semibold">Your nickname</span>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-brand focus:outline-none"
              placeholder="e.g. RamiFan"
              maxLength={32}
              autoComplete="off"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError(null);
              }}
            />
            <span className="mt-1 block text-sm text-slate-500">
              Just a nickname: no real name, email or phone number.
            </span>
          </label>
        )}
        <p>
          We record your moves, timings, the coach's warnings and how you use the coach's hints. We never record your
          camera, microphone, name or contact details. The coach is an AI and can be wrong. You can export or delete
          everything at any time.
        </p>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree (required)</span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={analytics}
            onChange={(e) => setAnalytics(e.target.checked)}
          />
          <span>Use my anonymised data to improve the app (optional)</span>
        </label>
        {error && (
          <p className="rounded-xl bg-rose-50 p-3 text-rose-700" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" disabled={!agree || busy || (!userId && !nickname.trim())} onClick={submit}>
          Let's play
        </button>
      </section>
    </main>
  );
}
