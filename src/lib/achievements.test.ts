import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS, buildAchievements } from "@/lib/achievements";

describe("buildAchievements", () => {
  it("unlocks first-check-in milestone at one practice", () => {
    const states = buildAchievements({ best: 1, totalDays: 1 });
    const unlocked = states.filter((state) => state.unlocked).map((s) => s.def.id);
    expect(unlocked).toContain("total-1");
    expect(unlocked).not.toContain("streak-3"); // best=1 不足 3
  });

  it("unlocks streak milestones from best consecutive days", () => {
    const states = buildAchievements({ best: 7, totalDays: 7 });
    const unlocked = states.filter((state) => state.unlocked).map((s) => s.def.id);
    expect(unlocked).toContain("streak-3");
    expect(unlocked).toContain("streak-7");
    expect(unlocked).not.toContain("streak-30");
  });

  it("tracks total-days milestones independently", () => {
    const states = buildAchievements({ best: 2, totalDays: 100 });
    const unlocked = states.filter((state) => state.unlocked).map((s) => s.def.id);
    expect(unlocked).toContain("total-100");
    expect(unlocked).not.toContain("streak-7");
  });

  it("reports progress values for locked achievements", () => {
    const states = buildAchievements({ best: 5, totalDays: 9 });
    const streakSeven = states.find((state) => state.def.id === "streak-7");
    const totalTen = states.find((state) => state.def.id === "total-10");
    expect(streakSeven?.value).toBe(5);
    expect(totalTen?.value).toBe(9);
  });

  it("defines a non-empty curated list", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });
});
