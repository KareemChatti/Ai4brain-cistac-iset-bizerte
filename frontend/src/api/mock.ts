import collab from "@shared/fixtures/collab.json";
import evidence from "@shared/fixtures/evidence.json";
import heatmap from "@shared/fixtures/heatmap.json";
import history from "@shared/fixtures/history.json";
import plan from "@shared/fixtures/plan.json";
import profile from "@shared/fixtures/profile.json";
import projection from "@shared/fixtures/projection.json";
import review from "@shared/fixtures/review.json";
import type { DimensionKey, Goal, Projection } from "@shared/types";

export const MOCK_DELAY_MS = 300;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let goals: Goal[] = [];

export function resetMock() {
  goals = [];
}

function route(method: string, path: string, body: any): unknown {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const parts = pathname.split("/").filter(Boolean);
  const key = `${method} /${parts.slice(0, 2).join("/")}`;

  switch (key) {
    case "POST /api/users":
      return { user_id: crypto.randomUUID() };
    case "POST /api/consent":
      return { ok: true };
    case "POST /api/events":
      return { accepted: Array.isArray(body?.events) ? body.events.length : 0 };
    case "GET /api/profile": {
      if (parts[3] === "history") return history;
      if (parts[3] === "projection") {
        const p = clone(projection) as Projection;
        p.sessions_per_week = Number(params.get("sessions_per_week") ?? p.sessions_per_week);
        return p;
      }
      return profile;
    }
    case "GET /api/matches":
      return [];
    case "GET /api/plan":
      return plan;
    case "GET /api/collab":
      return collab;
    case "GET /api/heatmap":
      return heatmap;
    case "GET /api/goals":
      return goals;
    case "POST /api/goals": {
      const dimension = body.dimension as DimensionKey;
      const current = (profile.dimensions as Record<DimensionKey, { score: number }>)[dimension]?.score ?? 0;
      goals = goals.filter((g) => g.dimension !== dimension);
      goals.push({
        dimension,
        target: body.target,
        created_at: new Date().toISOString(),
        progress: Math.min(1, current / body.target),
      });
      return goals;
    }
    case "GET /api/evidence":
      return { ...evidence, round_id: parts[3] ?? evidence.round_id };
    case "POST /api/coach":
      if (parts[2] === "review") return { ...review, round_id: body?.round_id ?? review.round_id };
      if (parts[2] === "explain-hint")
        return {
          text:
            `This is a sample explanation (mock mode). The hint is based on: ${(body?.hint?.reason_codes ?? []).join(", ") || "no reasons"}. ` +
            `I'm only ${Math.round((body?.hint?.confidence ?? 0) * 100)}% sure, so check it yourself.`,
        };
      if (parts[2] === "chat") return { reply: "This is a sample coach reply (mock mode).", fact_ids: [] };
      break;
    case "GET /api/data":
      return { profile, history, goals, events: [] };
    case "DELETE /api/data":
      goals = [];
      return { deleted: true };
  }
  throw new Error(`No mock for ${method} ${path}`);
}

export async function mockRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await sleep(MOCK_DELAY_MS);
  return clone(route(method, path, body)) as T;
}
