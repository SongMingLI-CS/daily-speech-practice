import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  getTodayDateString,
  isValidTimeZone,
  resolveTimeZone,
} from "@/lib/date";

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

describe("isValidTimeZone", () => {
  it("accepts IANA timezone identifiers", () => {
    expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
  });

  it("rejects invalid identifiers", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Asia Shanghai")).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("keeps valid zones", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("falls back for invalid or missing zones", () => {
    expect(resolveTimeZone("garbage")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_TIME_ZONE);
  });
});
