import { it } from "vitest";
import { writeFileSync } from "node:fs";
import type { Event } from "@shared/types";
import { chooseAction, mulberry32 } from "../../engine";
import { onEvent, setLogContext } from "../logger";
import { createRoundStore } from "../store";

const USER = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";

it.skipIf(!process.env.DUMP_EVENTS)("dumps the events of a real round", async () => {
  const events: Event[] = [];
  setLogContext(USER, SESSION);
  onEvent((e) => events.push(e));
  const store = createRoundStore({ userId: USER, sessionId: SESSION, opponentLevel: 3, quickMode: true, hintsEnabled: true, seed: 21, aiDelayMs: 0 });
  const rng = mulberry32(21);
  store.getState().start();
  for (let i = 0; i < 3000 && !store.getState().result; i++) {
    const s = store.getState();
    if (s.aiThinking || s.game.current !== 0) { await new Promise((r) => setTimeout(r, 0)); continue; }
    if (s.probe) { s.answerProbe(s.probe.options[0]); continue; }
    if (!s.hint && s.userTurn === 2) { s.requestHint(); continue; }
    const a = chooseAction(s.game, 2, rng);
    if (a.type === "drawStock") s.drawStock();
    else if (a.type === "drawDiscard") s.drawDiscard();
    else if (a.type === "layDown") { store.setState({ staged: a.melds }); s.layDown(); }
    else if (a.type === "layOff" || a.type === "swapJoker") { store.setState({ selected: [a.cardId] }); s.playOnMeld(a.meldId, a.type === "layOff" ? "layOff" : "swap"); }
    else s.discard(a.cardId);
  }
  for (let i = 0; i < 500 && store.getState().result?.grading; i++) await new Promise((r) => setTimeout(r, 5));
  writeFileSync(process.env.DUMP_EVENTS!, JSON.stringify({ events }, null, 1));
  console.info(`round ${store.getState().roundId}: ${events.length} events`);
}, 60_000);
