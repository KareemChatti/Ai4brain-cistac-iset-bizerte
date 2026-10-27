// Web Worker: grades every user turn of a finished round off the main thread and posts
// the results back one by one. Message in: { id, items: GradeJob[] }.

import { GradeInput, TurnGrade, gradeTurn } from "./grader";

export type GradeJob = { turnNo: number; input: GradeInput; played: string };
export type GradeMessage =
  | { id: string; type: "graded"; turnNo: number; grade: TurnGrade }
  | { id: string; type: "done" };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: string; items: GradeJob[] }>) => void) | null;
  postMessage: (m: GradeMessage) => void;
};

ctx.onmessage = (e) => {
  const { id, items } = e.data;
  for (const item of items) {
    ctx.postMessage({ id, type: "graded", turnNo: item.turnNo, grade: gradeTurn(item.input, item.played) });
  }
  ctx.postMessage({ id, type: "done" });
};
