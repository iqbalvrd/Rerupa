import { describe, expect, it } from "vitest";
import { HALL, adjacentGalleryIndex, galleryNavigationOrder, angleDelta, lerpPose, overviewPose, paintingSize, planRoom, slotPose } from "./plan";

describe("three-wall plan", () => {
  it("distributes every exhibit once across the back, left and right walls", () => {
    for (const n of [1, 2, 3, 6, 11, 24]) {
      const p = planRoom(n);
      expect(p.slots.map(s => s.index)).toEqual(Array.from({length:n}, (_,i)=>i));
      const counts = ["back", "left", "right"].map(w => p.slots.filter(s=>s.wall===w).length);
      expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1);
      for (const s of p.slots) {
        expect(s.center[1]).toBeGreaterThan(HALL.maxH/2);
        expect(s.center[1]+HALL.maxH/2).toBeLessThan(p.springY);
        if(s.wall==='back') expect(s.center[2]).toBeCloseTo(-p.depth/2+0.04);
        else expect(Math.abs(s.center[0])).toBeCloseTo(p.width/2-0.04);
      }
    }
  });
  it("keeps the same navigation order when the viewport changes", () => {
    expect(planRoom(6,16/9).slots.map(s=>s.wall)).toEqual(planRoom(6,9/19).slots.map(s=>s.wall));
  });
  it("spaces side exhibits without overlapping frames or the entrance", () => {
    const p=planRoom(24);
    for(const wall of ['left','right']) {
      const slots=p.slots.filter(s=>s.wall===wall);
      for(let i=1;i<slots.length;i++) expect(slots[i].center[2]-slots[i-1].center[2]).toBeGreaterThan(HALL.maxW+0.68);
      expect(slots.at(-1)!.center[2]+HALL.maxW/2).toBeLessThan(p.depth/2-1);
    }
  });
});

describe("guided camera", () => {
  it("stays inside the hall and faces each artwork squarely on desktop and phone", () => {
    for(const aspect of [16/9,1,9/19]) {
      const p=planRoom(6,aspect), o=overviewPose(p,aspect);
      expect(Math.abs(o.pos[2])).toBeLessThan(p.depth/2);
      for(const s of p.slots) {
        const pose=slotPose(p,s,paintingSize(1.4),aspect);
        expect(Math.abs(pose.pos[0])).toBeLessThan(p.width/2);
        expect(Math.abs(pose.pos[2])).toBeLessThan(p.depth/2);
        const dx=s.center[0]-pose.pos[0], dz=s.center[2]-pose.pos[2];
        expect(angleDelta(pose.yaw,Math.atan2(dx,-dz))).toBeCloseTo(0);
      }
    }
  });
  it("interpolates a left-to-right turn via the room rather than a full revolution",()=>{
    const p=planRoom(6), size=paintingSize(1);
    const left=slotPose(p,p.slots[2],size,16/9), right=slotPose(p,p.slots[4],size,16/9);
    const mid=lerpPose(left,right,0.5);
    expect(Math.abs(mid.yaw)).toBeCloseTo(0);
    expect(mid.pos[0]).toBeCloseTo(0);
  });
  it("preserves arbitrary painting ratios inside the display limits",()=>{
    for(const aspect of [1200/730,617/1373,4.8,1]) {
      const s=paintingSize(aspect);
      expect(s.w/s.h).toBeCloseTo(aspect);
      expect(s.w).toBeLessThanOrEqual(HALL.maxW);
      expect(s.h).toBeLessThanOrEqual(HALL.maxH);
    }
  });
});


describe("left and right navigation", () => {
  it("walks left wall near-to-far, across the back, then right wall far-to-near", () => {
    expect(galleryNavigationOrder(planRoom(6))).toEqual([3, 2, 0, 1, 4, 5]);
  });

  it("follows the same route on a phone and visits each work exactly once", () => {
    for (const count of [1, 2, 3, 6, 11, 24]) {
      const desktop = galleryNavigationOrder(planRoom(count, 16 / 9));
      const phone = galleryNavigationOrder(planRoom(count, 9 / 19));
      expect(desktop).toEqual(phone);
      expect([...desktop].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });

  it("reverses direction exactly and stops at both ends", () => {
    const order = galleryNavigationOrder(planRoom(6));
    expect(adjacentGalleryIndex(order, order[0], -1)).toBe(order[0]);
    expect(adjacentGalleryIndex(order, order.at(-1)!, 1)).toBe(order.at(-1));
    for (let i = 0; i < order.length - 1; i++) {
      const next = adjacentGalleryIndex(order, order[i], 1);
      expect(next).toBe(order[i + 1]);
      expect(adjacentGalleryIndex(order, next, -1)).toBe(order[i]);
    }
    expect(adjacentGalleryIndex([], 0, 1)).toBe(0);
  });
});
