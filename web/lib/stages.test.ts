// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Lesson } from "./schemas";
import {
  availableLayers,
  cellsBox,
  columnName,
  defaultVisibility,
  gridSize,
  initialStageIndex,
  isStepped,
  mixFor,
  mixPosition,
  parseCell,
  phaseView,
  regionNumber,
  regionsUpTo,
} from "./stages";

const lesson = Lesson.parse(JSON.parse(readFileSync(join(__dirname, "../../api/examples/lesson_detail.json"), "utf8")));

describe("regionsUpTo", () => {
  it("is cumulative: stage N shows every region from stages 1..N", () => {
    expect([...regionsUpTo(lesson.stages, 1)]).toEqual([]); // grid + sketch
    expect([...regionsUpTo(lesson.stages, 2)]).toEqual(["r02"]);
    expect([...regionsUpTo(lesson.stages, 4)]).toEqual(["r02", "r01", "r03", "r04", "r05", "r06"]);
  });
});

describe("layers", () => {
  it("offers only layers the lesson has, and no terang-gelap without use_shading", () => {
    expect(availableLayers(lesson)).toEqual(["grid", "sketch", "lineart", "regions", "original_photo"]);
  });

  it("starts each stage with its own layers, original photo off", () => {
    const finishing = lesson.stages.at(-1)!; // layers: regions, lineart, original_photo
    const v = defaultVisibility(finishing, availableLayers(lesson));
    expect(v.regions).toBe(true);
    expect(v.lineart).toBe(true);
    expect(v.original_photo).toBe(false);
    expect(v.grid).toBe(false);
  });
});

describe("small helpers", () => {
  it("numbers regions from their code", () => {
    expect(regionNumber("r07")).toBe("7");
    expect(regionNumber("r12")).toBe("12");
  });

  it("opens at the session's stage, clamped", () => {
    expect(initialStageIndex(8, 3)).toBe(2);
    expect(initialStageIndex(8, 99)).toBe(7);
    expect(initialStageIndex(8, undefined)).toBe(0);
  });
});

describe("tutorial v2 (bertahap)", () => {
  const v2 = Lesson.parse(JSON.parse(readFileSync(join(__dirname, "../../api/examples/lesson_detail_v2.json"), "utf8")));

  it("parses the v2 contract and keeps v1 lessons v1", () => {
    expect(isStepped(v2)).toBe(true);
    expect(isStepped(lesson)).toBe(false);
    expect(v2.region_colors).toEqual([]);
    expect(v2.mixes?.length).toBeGreaterThan(0);
  });

  it("places the open step in its phase and counts finished steps per phase", () => {
    const done = new Set(["step_1", "step_2", "step_8"]);
    const view = phaseView(v2, 8, (c) => done.has(c)); // step_9, the first paint_mix
    expect(view.phase).toEqual({ code: "color", title: "Warna", step: 2, count: 7 });
    expect(view.phases.map((p) => [p.code, p.done, p.count, p.current])).toEqual([
      ["sketch", 2, 7, false],
      ["color", 1, 7, true],
      ["finishing", 0, 2, false],
    ]);
    expect(phaseView(lesson, 0, () => false)).toEqual({ phases: [], phase: null });
  });

  it("offers the new line layers as toggles", () => {
    expect(availableLayers(v2)).toEqual(expect.arrayContaining(["landmarks", "block_in", "background_lines", "sketch"]));
  });

  it("zooms to the step's grid cells, not to a whole-grid step", () => {
    const grid = gridSize(v2)!;
    expect(grid).toEqual({ cols: 4, rows: 6 });
    expect(parseCell("B3")).toEqual({ col: 1, row: 2 });
    expect(columnName(3)).toBe("D");
    const W = 400;
    const H = 600;
    expect(cellsBox(["B1", "C2"], grid, W, H)).toEqual([100, 0, 200, 200]);
    const everything = v2.stages.find((s) => s.kind === "block_in")!.grid_cells;
    expect(cellsBox(everything, grid, W, H)).toBeNull();
    expect(cellsBox([], grid, W, H)).toBeNull();
  });

  it("finds the one mix of a paint step and its place among the mixes", () => {
    const step = v2.stages.find((s) => s.kind === "paint_mix")!;
    const mix = mixFor(v2, step)!;
    expect(mix.mix_id).toBe(step.mix_id);
    expect(mixPosition(v2, mix)).toEqual({ n: 1, of: v2.mixes!.length });
    expect(mixFor(v2, v2.stages[0])).toBeNull();
  });
});
