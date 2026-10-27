import { useCallback, useRef, useState } from "react";

/**
 * 2-up/1-down staircase: two correct answers in a row raise the level, one wrong answer
 * lowers it. Success then settles near 71%, so the level reached says how far the player can go.
 */
export function useStaircase(start: number, min: number, max: number) {
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const [level, setLevel] = useState(clamp(start));
  const streak = useRef(0);
  const levelRef = useRef(clamp(start));

  const update = useCallback(
    (correct: boolean) => {
      let next = levelRef.current;
      if (correct) {
        streak.current += 1;
        if (streak.current >= 2) {
          next = clamp(next + 1);
          streak.current = 0;
        }
      } else {
        streak.current = 0;
        next = clamp(next - 1);
      }
      levelRef.current = next;
      setLevel(next);
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max],
  );

  return { level, update, current: () => levelRef.current };
}

/** The same rule without React, for tests and simulations. */
export function stepStaircase(level: number, streak: number, correct: boolean, min: number, max: number) {
  if (!correct) return { level: Math.max(min, level - 1), streak: 0 };
  if (streak + 1 >= 2) return { level: Math.min(max, level + 1), streak: 0 };
  return { level, streak: streak + 1 };
}
