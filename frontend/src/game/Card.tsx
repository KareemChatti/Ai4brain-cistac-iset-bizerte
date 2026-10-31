import type { CSSProperties } from "react";
import { parseCard } from "../engine/cards";

const SUIT_NAME: Record<string, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAME: Record<string, string> = { A: "Ace", T: "10", J: "Jack", Q: "Queen", K: "King" };

const SUIT_PATH: Record<string, string> = {
  H: "M50 90 C20 66 4 50 4 30 C4 15 16 5 29 5 C39 5 46 11 50 19 C54 11 61 5 71 5 C84 5 96 15 96 30 C96 50 80 66 50 90 Z",
  D: "M50 4 L86 50 L50 96 L14 50 Z",
  S: "M50 4 C74 26 95 40 95 60 C95 75 83 83 71 83 C62 83 56 79 53 73 C55 83 59 90 67 96 L33 96 C41 90 45 83 47 73 C44 79 38 83 29 83 C17 83 5 75 5 60 C5 40 26 26 50 4 Z",
  C: "M50 6 A19 19 0 0 1 66 36 A19 19 0 1 1 57 66 C58 80 62 89 69 96 L31 96 C38 89 42 80 43 66 A19 19 0 1 1 34 36 A19 19 0 0 1 50 6 Z",
};

function Suit({ suit }: { suit: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d="M50 4 L62 37 L97 38 L69 59 L79 94 L50 73 L21 94 L31 59 L3 38 L38 37 Z" fill="currentColor" />
    </svg>
  );
}

export type CardSize = "xs" | "sm" | "md" | "lg";

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
  index,
  animate,
  style,
}: {
  id?: string;
  size?: CardSize;
  faceDown?: boolean;
  selected?: boolean;
  mark?: "good" | "bad" | "hint" | "target" | null;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  index?: number;
  animate?: "deal" | "land";
  style?: CSSProperties;
}) {
  const classes = [
    "pcard",
    `pcard--${size}`,
    mark ? `pcard--${mark}` : "",
    animate ? `pcard--${animate}` : "",
    className,
  ];
  const vars = { ...(index !== undefined ? { "--i": index } : {}), ...style } as CSSProperties;

  if (faceDown || !id) {
    return <div className={[...classes, "pcard--back"].join(" ")} style={vars} aria-label="Face-down card" role="img" />;
  }

  const card = parseCard(id);
  const label = cardLabel(id);
  const Tag = onClick ? "button" : "div";
  const props = onClick
    ? { type: "button" as const, onClick, disabled, "aria-pressed": selected, "aria-label": label }
    : { role: "img", "aria-label": label };

  if (card.joker) {
    return (
      <Tag {...props} className={[...classes, "pcard--joker"].join(" ")} style={vars}>
        <span className="pcard__joker">
          <Star />
          <span>Joker</span>
        </span>
      </Tag>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const rank = card.rank === "T" ? "10" : card.rank!;
  const face = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  return (
    <Tag {...props} className={[...classes, red ? "pcard--red" : ""].join(" ")} style={vars}>
      <span className="pcard__corner" aria-hidden="true">
        <span className="pcard__rank">{rank}</span>
        <Suit suit={card.suit!} />
      </span>
      <span className="pcard__pip" aria-hidden="true">
        {face ? <span className="pcard__face">{rank}</span> : <Suit suit={card.suit!} />}
      </span>
      <span className="pcard__corner pcard__corner--end" aria-hidden="true">
        <span className="pcard__rank">{rank}</span>
        <Suit suit={card.suit!} />
      </span>
    </Tag>
  );
}
