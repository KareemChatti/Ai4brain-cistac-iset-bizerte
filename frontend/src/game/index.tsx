// Member 1's game module. The app shell (src/app/slots.tsx) picks up RamiTable from here.
export { RamiTable } from "./RamiTable";
export type { RamiTableProps } from "./RamiTable";
export { CardView, cardLabel } from "./Card";
export { logEvent, flush, setLogContext, onEvent } from "./logger";
export { useMatch, DEFAULT_RULES, QUICK_RULES, MATCH_TARGETS, gameConfigOf } from "./match";
export type { RamiRules, Match, MatchTarget } from "./match";
export { connectLive, disconnectLive, useLive } from "./live";
export type { CoachMessage, LiveStatus } from "./live";
