import { describe, expect, it } from "vitest";

import { getTodayDateString } from "@/lib/date";

describe("getTodayDateString", () => {
  const instant = new Date("2026-01-01T00:30:00.000Z");

  it("formats as YYYY-MM-DD in the requested timezone", () => {
    expect(getTodayDateString("Asia/Shanghai", instant)).toBe("2026-01-01");
  });

  it("shifts the date based on timezone", () => {
    expect(getTodayDateString("America/New_York", instant)).toBe("2025-12-31");
    expect(getTodayDateString("UTC", instant)).toBe("2026-01-01");
  });

  it("defaults to Asia/Shanghai and current time", () => {
    expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
