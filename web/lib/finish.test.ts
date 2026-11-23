// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Lesson, Progress } from "./schemas";
import { isValidReflection, summarize } from "./finish";

const lesson = Lesson.parse(JSON.parse(readFileSync(join(__dirname, "../../api/examples/lesson_detail.json"), "utf8")));

function progressWith(statuses: Record<string, "viewed" | "completed">, feedback: Record<string, number> = {}): Progress {
  const stages = lesson.stages.map((s) => ({
    code: s.code,
    order_no: s.order_no,
    is_checkpoint: s.is_checkpoint,
    status: statuses[s.code] ?? ("not_started" as const),
    viewed_at: null,
    completed_at: null,
    feedback_count: feedback[s.code] ?? 0,
  }));
  return {
    lesson_version_id: lesson.id,
    current_stage_order: 1,
    completed_count: stages.filter((s) => s.status === "completed").length,
    stage_count: stages.length,
    stages,
  };
}

describe("summarize", () => {
  it("counts completed stages and finds the first open one", () => {
    const s = summarize(lesson, progressWith({ stage_1: "completed", stage_2: "viewed" }));
    expect(s.total).toBe(lesson.stages.length);
    expect(s.completed).toBe(1);
    expect(s.allDone).toBe(false);
    expect(s.firstOpen?.code).toBe("stage_2");
  });

  it("is all done only when every stage is completed (viewing is not completing)", () => {
    const all = Object.fromEntries(lesson.stages.map((st) => [st.code, "completed" as const]));
    expect(summarize(lesson, progressWith(all)).allDone).toBe(true);
    const viewed = Object.fromEntries(lesson.stages.map((st) => [st.code, "viewed" as const]));
    expect(summarize(lesson, progressWith(viewed)).allDone).toBe(false);
  });

  it("keeps a skipped checkpoint at 0 feedback", () => {
    const cp = lesson.stages.find((st) => st.is_checkpoint)!;
    const s = summarize(lesson, progressWith({ [cp.code]: "completed" }));
    const row = s.stages.find((r) => r.code === cp.code)!;
    expect(row.isCheckpoint).toBe(true);
    expect(row.feedbackCount).toBe(0);
  });
});

describe("isValidReflection", () => {
  it("rejects null and out-of-range answers", () => {
    expect(isValidReflection(null)).toBe(false);
    expect(isValidReflection({ question: "q", options: ["a", "b"], correct_option: 2, source: null })).toBe(false);
    expect(isValidReflection({ question: "q", options: ["a", "b"], correct_option: 1, source: null })).toBe(true);
  });
});
