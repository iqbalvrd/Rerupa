import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as s from "./schemas";

// Every response example the backend publishes must parse with our schemas.
// If this fails, Pydantic (api/routes) and Zod (lib/schemas.ts) drifted apart.
const EXAMPLES_DIR = join(__dirname, "../../api/examples");

const SCHEMA_FOR: Record<string, z.ZodType> = {
  "artwork_detail.json": s.ArtworkDetail,
  "artworks_list.json": z.array(s.ArtworkCard),
  "checkpoint_feedback.json": s.Checkpoint,
  "checkpoint_retake.json": s.Checkpoint,
  "error.json": s.ApiErrorBody,
  "job_failed.json": s.Job,
  "job_processing.json": s.Job,
  "job_queued.json": s.Job,
  "job_succeeded.json": s.Job,
  "lesson_detail.json": s.Lesson,
  "palettes.json": z.array(s.Palette),
  "progress.json": s.Progress,
  "session.json": s.Session,
};

describe("API examples match Zod schemas", () => {
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json"));

  it("has a schema for every example file", () => {
    expect(files.filter((f) => !(f in SCHEMA_FOR))).toEqual([]);
  });

  it.each(files)("%s", (file) => {
    const data = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8"));
    const result = SCHEMA_FOR[file].safeParse(data);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });
});

describe("Scope", () => {
  it("accepts an area inside the photo", () => {
    expect(s.Scope.safeParse({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 }).success).toBe(true);
  });

  it("rejects an area that leaves the photo", () => {
    expect(s.Scope.safeParse({ x: 0.6, y: 0, w: 0.5, h: 0.5 }).success).toBe(false);
  });

  it("rejects a sliver the API would reject (w ≤ 0.05)", () => {
    expect(s.Scope.safeParse({ x: 0, y: 0, w: 0.05, h: 0.5 }).success).toBe(false);
  });
});
