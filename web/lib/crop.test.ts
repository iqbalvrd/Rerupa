import { describe, expect, it } from "vitest";
import { DEFAULT_CROP, MIN_SIDE, WHOLE_PHOTO, moveBox, resizeBox, toScope } from "./crop";
import { Scope } from "./schemas";

describe("moveBox", () => {
  it("keeps the box inside the photo", () => {
    expect(moveBox(DEFAULT_CROP, 1, 1)).toMatchObject({ x: 1 - DEFAULT_CROP.w, y: 1 - DEFAULT_CROP.h });
    expect(moveBox(DEFAULT_CROP, -1, -1)).toMatchObject({ x: 0, y: 0 });
  });
});

describe("resizeBox", () => {
  it("moves only the dragged corner", () => {
    const b = resizeBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "se", 0.1, 0.1);
    expect(b.x).toBeCloseTo(0.2);
    expect(b.y).toBeCloseTo(0.2);
    expect(b.w).toBeCloseTo(0.5);
    expect(b.h).toBeCloseTo(0.5);
  });

  it("never shrinks below the minimum side or flips over", () => {
    const b = resizeBox({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "nw", 0.9, 0.9);
    expect(b.w).toBeCloseTo(MIN_SIDE);
    expect(b.h).toBeCloseTo(MIN_SIDE);
  });
});

describe("toScope", () => {
  it("sends nothing for the whole photo", () => {
    expect(toScope(WHOLE_PHOTO)).toBeNull();
  });

  it("produces a scope the API accepts, even at the edges", () => {
    const edge = moveBox(DEFAULT_CROP, 1, 1);
    expect(Scope.safeParse(toScope(edge)).success).toBe(true);
  });
});
