// A playing card drawn with HTML/CSS. Shared by the table and the mini-games.

import { parseCard } from "../engine/cards";

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_NAME: Record<string, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" };

export type CardSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<CardSize, string> = {
  xs: "h-12 w-9 text-xs",
  sm: "h-16 w-12 text-sm",
  md: "h-24 w-[4.25rem] text-base sm:h-28 sm:w-20",
  lg: "h-32 w-24 text-lg sm:h-36 sm:w-[6.5rem]",
};

export function cardLabel(id: string): string {
  const card = parseCard(id);
  if (card.joker) return "Joker";
  return `${RANK_NAME[card.rank!] ?? card.rank} of ${SUIT_NAME[card.suit!]}`;
}

export function CardView({
  id,
  size = "md",
  faceDown = false,
  selected = false,
  mark,
  onClick,
  disabled,
  className = "",
}: {
  id?: string;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
  mark?: "good" | "bad" | "hint" | "target" | null;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const ring =
    mark === "good"
      ? "ring-4 ring-emerald-500"
      : mark === "bad"
        ? "ring-4 ring-rose-500"
        : mark === "hint"
          ? "ring-4 ring-amber-400"
          : mark === "target"
            ? "ring-4 ring-brand"
            : "";
  const base = `${SIZES[size]} relative shrink-0 select-none rounded-lg border border-slate-300 shadow-sm transition-transform ${ring} ${
    selected ? "-translate-y-3 border-brand shadow-md" : ""
  } ${onClick && !disabled ? "cursor-pointer hover:-translate-y-1" : ""} ${className}`;

  if (faceDown || !id) {
    return (
      <div className={`${base} bg-[repeating-linear-gradient(45deg,#1E5DA8_0_6px,#2B74C9_6px_12px)] border-white`} aria-label="Face-down card" />
    );
  }

  const card = parseCard(id);
  const Tag = onClick ? "button" : "div";
  const props = onClick ? { type: "button" as const, onClick, disabled, "aria-pressed": selected } : {};

  if (card.joker) {
    return (
      <Tag {...props} className={`${base} flex flex-col items-center justify-center bg-amber-50`} aria-label="Joker">
        <span className="text-[1.6em] leading-none text-rose-600">★</span>
        <span className="mt-1 text-[0.6em] font-bold tracking-wider text-slate-800">JOKER</span>
      </Tag>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const rank = card.rank === "T" ? "10" : card.rank;
  return (
    <Tag {...props} className={`${base} bg-white ${red ? "text-rose-600" : "text-slate-900"}`} aria-label={cardLabel(id)}>
      <span className="absolute left-1 top-0.5 flex flex-col items-center font-bold leading-tight">
        <span>{rank}</span>
        <span className="text-[0.8em]">{SUIT_SYMBOL[card.suit!]}</span>
      </span>
      <span className="absolute inset-0 flex items-center justify-center text-[1.9em]">{SUIT_SYMBOL[card.suit!]}</span>
    </Tag>
  );
}
