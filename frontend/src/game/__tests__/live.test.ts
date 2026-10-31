import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  reply(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

async function load() {
  vi.resetModules();
  const logger = await import("../logger");
  const live = await import("../live");
  logger.setLogContext(USER, SESSION);
  return { logger, live };
}

describe("live session", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv("VITE_USE_MOCK", "false");
    vi.stubEnv("VITE_API_URL", "http://api.test");
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("connects to the session URL of the user", async () => {
    const { live } = await load();
    live.connectLive(USER);
    expect(FakeSocket.instances[0].url).toBe(`ws://api.test/ws/session/${USER}`);
    expect(live.useLive.getState().status).toBe("connecting");
    FakeSocket.instances[0].open();
    expect(live.useLive.getState().status).toBe("live");
  });

  it("streams every event at once instead of waiting for a batch of 10", async () => {
    const { live, logger } = await load();
    live.connectLive(USER);
    const ws = FakeSocket.instances[0];
    ws.open();
    const e = logger.logEvent("rami", "turn", { turn_no: 1 }, "r1")!;
    await Promise.resolve();
    expect(ws.sent).toEqual([{ type: "events", events: [e] }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger._inflight.has(e.event_id)).toBe(true);
    ws.reply({ type: "ack", event_ids: [e.event_id] });
    expect(logger._inflight.size).toBe(0);
  });

  it("sends what was buffered before the socket opened", async () => {
    const { live, logger } = await load();
    logger.logEvent("rami", "round_start", {}, "r1");
    logger.logEvent("rami", "turn", { turn_no: 1 }, "r1");
    live.connectLive(USER);
    FakeSocket.instances[0].open();
    await Promise.resolve();
    const sent = FakeSocket.instances[0].sent as { events: unknown[] }[];
    expect(sent.flatMap((m) => m.events)).toHaveLength(2);
  });

  it("falls back to HTTP for unacknowledged events when the socket drops, then reconnects", async () => {
    vi.useFakeTimers();
    const { live, logger } = await load();
    live.connectLive(USER);
    const ws = FakeSocket.instances[0];
    ws.open();
    const e = logger.logEvent("rami", "turn", { turn_no: 1 }, "r1")!;
    await Promise.resolve();
    ws.drop();
    expect(live.useLive.getState().status).toBe("offline");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events.map((x: { event_id: string }) => x.event_id)).toEqual([e.event_id]);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("keeps the coach messages and the pushed profile", async () => {
    const { live } = await load();
    live.connectLive(USER);
    const ws = FakeSocket.instances[0];
    ws.open();
    ws.reply({ type: "coach", kind: "pace", text: "Three quick discards in a row.", turn_no: 4, round_id: "r1" });
    ws.reply({ type: "profile", profile: { user_id: USER } });
    const state = live.useLive.getState();
    expect(state.messages.map((m) => m.kind)).toEqual(["pace"]);
    expect(state.profile?.user_id).toBe(USER);
  });

  it("stays off in mock mode", async () => {
    vi.stubEnv("VITE_USE_MOCK", "true");
    const { live } = await load();
    live.connectLive(USER);
    expect(FakeSocket.instances).toHaveLength(0);
    expect(live.useLive.getState().status).toBe("off");
  });

  it("disconnecting clears the session", async () => {
    const { live } = await load();
    live.connectLive(USER);
    FakeSocket.instances[0].open();
    live.disconnectLive();
    expect(live.useLive.getState()).toMatchObject({ status: "off", messages: [], profile: null });
  });
});
