// First version for task 3.1. Task 3.5 adds the rules carousel, the full consent text and the language choice.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { postConsent } from "@/api/client";
import { CONSENT_VERSION, useApp } from "@/app/store";

export default function WelcomePage() {
  const { userId, setConsent } = useApp();
  const [agree, setAgree] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/home";

  const submit = async () => {
    setBusy(true);
    try {
      await postConsent(userId!, CONSENT_VERSION, analytics);
      setConsent(CONSENT_VERSION);
      navigate(from, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold text-brand">Welcome to AI4Brain Rami</h1>
      <div className="mt-4 space-y-2 text-lg text-slate-700">
        <p>Play Rami against the computer and get a coach that explains your decisions.</p>
        <p>Short mini-games train memory, attention, speed, reasoning and flexibility.</p>
        <p className="font-semibold">This is a game for training thinking skills. It is not a medical test.</p>
      </div>
      <section className="card mt-6 space-y-3">
        <p>
          We record your moves, timings, mini-game answers and how you use the coach's hints. We never record your
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
        <button className="btn-primary w-full" disabled={!agree || busy} onClick={submit}>
          Let's play
        </button>
      </section>
    </main>
  );
}
