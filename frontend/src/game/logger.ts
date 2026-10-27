// The single event logger used by the Rami table and the mini-games.
// logEvent builds a contract Event (docs/contracts.md section 4), buffers it, and sends
// batches to POST /api/events every 10 events, at round end (flush) and on page hide.
// With VITE_USE_MOCK=true the batches are only printed to the console.

import type { Event, EventSource } from "@shared/types";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const ENDPOINT = `${BASE_URL}/api/events`;
const BATCH_SIZE = 10;

let context: { userId: string | null; sessionId: string | null } = { userId: null, sessionId: null };
const buffer: Event[] = [];
const listeners = new Set<(event: Event) => void>();

/** Watch every event as it is logged (used by tests and the dev pages). Returns an unsubscribe function. */
export function onEvent(listener: (event: Event) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLogContext(userId: string, sessionId: string) {
  context = { userId, sessionId };
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export function logEvent(
  source: EventSource,
  type: string,
  payload: Record<string, unknown>,
  roundId: string | null = null,
): Event | null {
  if (!context.userId || !context.sessionId) {
    console.warn(`[logger] no user yet, "${type}" not recorded`);
    return null;
  }
  const event: Event = {
    event_id: uuid(),
    user_id: context.userId,
    session_id: context.sessionId,
    round_id: roundId,
    ts: new Date().toISOString(),
    source,
    type,
    payload,
  };
  buffer.push(event);
  listeners.forEach((listener) => listener(event));
  if (buffer.length >= BATCH_SIZE) void flush();
  return event;
}

/** Send everything buffered. Failed batches go back to the buffer for the next try. */
export async function flush(): Promise<void> {
  if (!buffer.length) return;
  const events = buffer.splice(0, buffer.length);
  if (USE_MOCK) {
    console.log(`[logger] ${events.length} event(s)`, events);
    return;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`POST /api/events ${res.status}`);
  } catch (err) {
    buffer.unshift(...events);
    console.warn("[logger] could not send events, will retry", err);
  }
}

/** On page hide, hand the rest to the browser with sendBeacon (survives closing the tab). */
function flushOnHide() {
  if (!buffer.length || USE_MOCK) return;
  const events = buffer.splice(0, buffer.length);
  const sent = typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, JSON.stringify({ events }));
  if (!sent) buffer.unshift(...events);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushOnHide);

/** For tests only. */
export const _buffer = buffer;
