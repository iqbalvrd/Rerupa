import { describe, expect, it } from "vitest";
import { HALL, arcadeColumns, lerpPose, overviewPose, paintingSize, planRoom, slotPose } from "./plan";

describe("planRoom", () => {
  it("hangs every painting on the wall facing the visitor, in reading order", () => {
    const plan = planRoom(6, 16 / 9);
    expect(plan.slots).toHaveLength(6);
    for (const s of plan.slots) expect(s.center[2]).toBeCloseTo(-plan.depth / 2);
    expect(plan.slots.map((s) => [s.row, s.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it("shapes the arcade like the screen: wide on a laptop, tall on an upright phone", () => {
    expect(arcadeColumns(6, 16 / 9)).toBeGreaterThan(arcadeColumns(6, 9 / 19));
    const phone = planRoom(6, 9 / 19);
    expect(phone.rows).toBeGreaterThan(phone.cols);
  });

  it("keeps the arcade inside the hall, above the plinth", () => {
    for (const [n, aspect] of [
      [1, 1.6],
      [5, 1.6],
      [6, 0.46],
      [9, 1.2],
    ] as const) {
      const plan = planRoom(n, aspect);
      for (const s of plan.slots) {
        expect(Math.abs(s.center[0])).toBeLessThan(plan.width / 2 - 1);
        expect(s.center[1] - HALL.levelH / 2).toBeGreaterThanOrEqual(HALL.plinth - 1e-9);
      }
    }
  });

  it("centers a last row that is not full", () => {
    const plan = planRoom(5, 16 / 9);
    const last = plan.slots.filter((s) => s.row === plan.rows - 1);
    const mid = last.reduce((sum, s) => sum + s.center[0], 0) / last.length;
    expect(mid).toBeCloseTo(0);
  });
});

describe("poses", () => {
  it("sees the whole arcade from inside the hall", () => {
    for (const aspect of [16 / 9, 1, 9 / 19]) {
      const plan = planRoom(6, aspect);
      const pose = overviewPose(plan, aspect);
      expect(pose.pos[2]).toBeLessThan(plan.depth / 2);
      expect(pose.pos[2]).toBeGreaterThan(-plan.depth / 2);
    }
  });

  it("stands straight in front of a painting, closer than the overview", () => {
    const plan = planRoom(6, 16 / 9);
    const overview = overviewPose(plan, 16 / 9);
    for (const slot of plan.slots) {
      const pose = slotPose(plan, slot, paintingSize(1.4), 16 / 9);
      expect(pose.pos[0]).toBeCloseTo(slot.center[0]);
      expect(pose.yaw).toBe(0);
      expect(pose.pos[2]).toBeLessThan(overview.pos[2]);
    }
  });

  it("interpolates position and pitch", () => {
    const plan = planRoom(6, 16 / 9);
    const a = overviewPose(plan, 16 / 9);
    const b = slotPose(plan, plan.slots[0], paintingSize(1), 16 / 9);
    const mid = lerpPose(a, b, 0.5);
    expect(mid.pos[2]).toBeCloseTo((a.pos[2] + b.pos[2]) / 2);
    expect(mid.pitch).toBeCloseTo((a.pitch + b.pitch) / 2);
  });

  it("fits wide and tall paintings in the same box", () => {
    expect(paintingSize(3).w).toBeCloseTo(HALL.maxW);
    expect(paintingSize(0.5).h).toBeCloseTo(HALL.maxH);
  });
});
