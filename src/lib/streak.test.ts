import { describe, expect, it } from "vitest";

import { addDaysToDateKey, buildStreakStats } from "@/lib/streak";

describe("addDaysToDateKey", () => {
  it("moves across plain dates", () => {
    expect(addDaysToDateKey("2026-01-10", 1)).toBe("2026-01-11");
    expect(addDaysToDateKey("2026-01-10", -1)).toBe("2026-01-09");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDateKey("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("respects leap years", () => {
    expect(addDaysToDateKey("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildStreakStats", () => {
  const today = "2026-01-15";

  it("returns zeros for an empty history", () => {
    expect(buildStreakStats([], today)).toEqual({
      current: 0,
      best: 0,
      totalDays: 0,
      todayPracticed: false,
      lastPracticedDate: null,
    });
  });

  it("counts a single practice today", () => {
    expect(buildStreakStats([today], today)).toMatchObject({
      current: 1,
      best: 1,
      totalDays: 1,
      todayPracticed: true,
      lastPracticedDate: today,
    });
  });

  it("keeps a live streak when the last practice was yesterday", () => {
    const yesterday = addDaysToDateKey(today, -1);
    expect(buildStreakStats([yesterday], today)).toMatchObject({
      current: 1,
      best: 1,
      totalDays: 1,
      todayPracticed: false,
    });
  });

  it("breaks the streak when neither today nor yesterday was practiced", () => {
    const older = [addDaysToDateKey(today, -4), addDaysToDateKey(today, -3)];
    const stats = buildStreakStats(older, today);
    expect(stats.current).toBe(0);
    expect(stats.best).toBe(2);
    expect(stats.totalDays).toBe(2);
    expect(stats.todayPracticed).toBe(false);
  });

  it("computes current and best streaks from scattered runs", () => {
    const dates = [
      addDaysToDateKey(today, -10),
      addDaysToDateKey(today, -9),
      addDaysToDateKey(today, -8),
      addDaysToDateKey(today, -5),
      addDaysToDateKey(today, -4),
      addDaysToDateKey(today, -3),
      addDaysToDateKey(today, -2),
      addDaysToDateKey(today, -1),
      today,
    ];
    const stats = buildStreakStats(dates, today);
    expect(stats.current).toBe(6); // today-5 … today
    expect(stats.best).toBe(6);
    expect(stats.totalDays).toBe(9);
    expect(stats.todayPracticed).toBe(true);
  });

  it("is robust to unsorted and duplicated input", () => {
    const stats = buildStreakStats(
      [today, today, addDaysToDateKey(today, -1), addDaysToDateKey(today, -2)],
      today,
    );
    expect(stats).toMatchObject({ current: 3, best: 3, totalDays: 3 });
  });
});
