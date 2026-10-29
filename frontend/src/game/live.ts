// Live session: one WebSocket to the backend (/ws/session/{user_id}) while the app is open.
// Every event is streamed the moment it is logged; the server stores and scores it, then
// pushes back live coach messages and the updated profile. If the socket drops, the
// logger falls back to HTTP batches and the session reconnects by itself, so a bad
// connection never breaks the game. Protocol: backend/app/live.py.

import { create } from "zustand";
import type { Event, Profile } from "@shared/types";
import { ackEvents, attachTransport, detachTransport } from "./logger";

export type LiveStatus = "off" | "connecting" | "live" | "offline";

export type CoachMessage = {
  id: number;
  kind: string;
  text: string;
  turn_no: number | null;
  round_id: string | null;
  at: number;
};

type ServerMessage =
  | { type: "hello"; user_id: string }
  | { type: "ack"; event_ids: string[] }
  | { type: "coach"; kind: string; text: string; turn_no: number | null; round_id: string | null }
  | { type: "profile"; profile: Profile }
  | { type: "pong" }
  | { type: "error"; message: string };

type LiveState = {
  status: LiveStatus;
  messages: CoachMessage[];
  profile: Profile | null;
};

export const useLive = create<LiveState>(() => ({ status: "off", messages: [], profile: null }));

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const MAX_MESSAGES = 20;
const PING_MS = 25_000;

export function liveUrl(userId: string): string {
  const base = (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/$/, "") ?? API_URL.replace(/^http/, "ws");
  return `${base}/ws/session/${encodeURIComponent(userId)}`;
}

let socket: WebSocket | null = null;
let currentUser: string | null = null;
let wanted = false;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let nextId = 1;

function handle(raw: string) {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }
  switch (msg.type) {
    case "ack":
      ackEvents(msg.event_ids);
      break;
    case "coach": {
      const message: CoachMessage = { ...msg, id: nextId++, at: Date.now() };
      useLive.setState((s) => ({ messages: [...s.messages, message].slice(-MAX_MESSAGES) }));
      break;
    }
    case "profile":
      useLive.setState({ profile: msg.profile });
      break;
    case "error":
      console.warn("[live]", msg.message);
      break;
  }
}

function send(events: Event[]): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: "events", events }));
  return true;
}

function stopTimers() {
  if (pingTimer) clearInterval(pingTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pingTimer = retryTimer = null;
}

function open() {
  if (!currentUser) return;
  useLive.setState({ status: "connecting" });
  const ws = new WebSocket(liveUrl(currentUser));
  socket = ws;
  ws.onopen = () => {
    if (socket !== ws) return;
    retries = 0;
    useLive.setState({ status: "live" });
    attachTransport(send);
    pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), PING_MS);
  };
  ws.onmessage = (e) => handle(String(e.data));
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    stopTimers();
    detachTransport(); // unacknowledged events go back to the HTTP path
    if (!wanted) return useLive.setState({ status: "off" });
    useLive.setState({ status: "offline" });
    const delay = Math.min(10_000, 1000 * 2 ** retries++);
    retryTimer = setTimeout(open, delay);
  };
}

/** Open the live session for this user (no-op in mock mode, or if already open). */
export function connectLive(userId: string) {
  if (USE_MOCK || typeof WebSocket === "undefined") return;
  if (wanted && currentUser === userId && socket) return;
  if (currentUser !== userId) disconnectLive();
  currentUser = userId;
  wanted = true;
  open();
}

/** Close the live session (e.g. after "delete my data"). */
export function disconnectLive() {
  wanted = false;
  stopTimers();
  const ws = socket;
  socket = null;
  detachTransport();
  ws?.close();
  useLive.setState({ status: "off", messages: [], profile: null });
}
