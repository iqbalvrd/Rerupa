import { describe, expect, it } from "vitest";
import { fullPhotoCorners, polygonOrder, toCornersPayload, toNatural } from "./corners";

describe("toNatural", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  const natural = { width: 4000, height: 2000 };

  it("maps a tap on the displayed image to natural photo pixels", () => {
    expect(toNatural(110, 70, rect, natural)).toEqual({ x: 2000, y: 1000 });
  });

  it("clamps taps just outside the image to its edge", () => {
    expect(toNatural(0, 500, rect, natural)).toEqual({ x: 0, y: 2000 });
  });
});

describe("corners payload", () => {
  it("rounds to whole pixels in tap order", () => {
    const pts = [
      { x: 1.4, y: 2.6 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    expect(toCornersPayload(pts)).toEqual([1, 3, 100, 0, 100, 50, 0, 50]);
  });

  it("requires exactly four corners", () => {
    expect(() => toCornersPayload(fullPhotoCorners(10, 10).slice(0, 3))).toThrow();
  });
});

describe("polygonOrder", () => {
  it("draws a non-crossing outline whatever the tap order", () => {
    const crossed = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const ordered = polygonOrder(crossed);
    // Neighbours in the outline share an x or a y (they are sides of the square, not diagonals).
    for (let i = 0; i < 4; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % 4];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });
});
