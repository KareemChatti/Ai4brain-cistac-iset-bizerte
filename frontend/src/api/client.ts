import type {
  CollabScore,
  DimensionKey,
  Event,
  EvidenceSheet,
  Goal,
  Heatmap,
  Hint,
  MatchSummary,
  Plan,
  Profile,
  Projection,
  Review,
  Snapshot,
} from "@shared/types";
import { mockRequest } from "./mock";

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";
const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (USE_MOCK) return mockRequest<T>(method, path, body);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, path, `${method} ${path} failed (${res.status}) ${text}`.trim());
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const createUser = (nickname: string) =>
  request<{ user_id: string }>("POST", "/api/users", { nickname });

export const postConsent = (user_id: string, consent_version: string, analytics: boolean) =>
  request<{ ok: boolean }>("POST", "/api/consent", { user_id, consent_version, analytics });

export const postEvents = (events: Event[]) =>
  request<{ accepted: number }>("POST", "/api/events", { events });

export const getProfile = (userId: string) => request<Profile>("GET", `/api/profile/${enc(userId)}`);

export const getHistory = (userId: string) =>
  request<Snapshot[]>("GET", `/api/profile/${enc(userId)}/history`);

export const getProjection = (userId: string, sessionsPerWeek = 3, weeks = 4) =>
  request<Projection>(
    "GET",
    `/api/profile/${enc(userId)}/projection?sessions_per_week=${sessionsPerWeek}&weeks=${weeks}`,
  );

export const getPlan = (userId: string) => request<Plan>("GET", `/api/plan/${enc(userId)}`);

export const getCollab = (userId: string) => request<CollabScore>("GET", `/api/collab/${enc(userId)}`);

export const getHeatmap = (userId: string) => request<Heatmap>("GET", `/api/heatmap/${enc(userId)}`);

export const getGoals = (userId: string) => request<Goal[]>("GET", `/api/goals/${enc(userId)}`);

export const postGoal = (userId: string, dimension: DimensionKey, target: number) =>
  request<Goal[]>("POST", `/api/goals/${enc(userId)}`, { dimension, target });

export const getMatches = (userId: string, limit = 20) =>
  request<MatchSummary[]>("GET", `/api/matches/${enc(userId)}?limit=${limit}`);

export const getEvidence = (userId: string, roundId: string) =>
  request<EvidenceSheet>("GET", `/api/evidence/${enc(userId)}/${enc(roundId)}`);

export const getReview = (user_id: string, round_id: string) =>
  request<Review>("POST", "/api/coach/review", { user_id, round_id });

export const explainHint = (user_id: string, hint: Hint, state_summary: Record<string, unknown> = {}) =>
  request<{ text: string }>("POST", "/api/coach/explain-hint", { user_id, hint, state_summary });

export const chat = (user_id: string, message: string) =>
  request<{ reply: string; fact_ids: string[]; contains_personal_data?: boolean }>(
    "POST",
    "/api/coach/chat",
    { user_id, message },
  );

export const exportData = (userId: string) =>
  request<Record<string, unknown>>("GET", `/api/data/${enc(userId)}/export`);

export const deleteData = (userId: string) =>
  request<{ deleted: boolean }>("DELETE", `/api/data/${enc(userId)}`);
