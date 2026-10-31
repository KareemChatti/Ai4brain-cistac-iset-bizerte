import { TurnGrade, gradeTurn } from "../engine/grader";
import type { GradeJob, GradeMessage } from "../engine/worker";

export type { GradeJob };

function gradeInline(jobs: GradeJob[], onGrade: (turnNo: number, grade: TurnGrade) => void): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      if (i >= jobs.length) return resolve();
      const job = jobs[i++];
      onGrade(job.turnNo, gradeTurn(job.input, job.played));
      setTimeout(step, 0);
    };
    step();
  });
}

export function gradeInBackground(jobs: GradeJob[], onGrade: (turnNo: number, grade: TurnGrade) => void): Promise<void> {
  if (!jobs.length) return Promise.resolve();
  if (typeof Worker === "undefined") return gradeInline(jobs, onGrade);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    } catch {
      return void gradeInline(jobs, onGrade).then(resolve);
    }
    const id = Math.random().toString(36).slice(2);
    worker.onmessage = (e: MessageEvent<GradeMessage>) => {
      if (e.data.id !== id) return;
      if (e.data.type === "graded") onGrade(e.data.turnNo, e.data.grade);
      else {
        worker.terminate();
        resolve();
      }
    };
    worker.onerror = () => {
      worker.terminate();
      void gradeInline(jobs, onGrade).then(resolve);
    };
    worker.postMessage({ id, items: jobs });
  });
}
