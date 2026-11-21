// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Lesson } from "./schemas";
import {
  availableLayers,
  defaultVisibility,
  initialStageIndex,
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
