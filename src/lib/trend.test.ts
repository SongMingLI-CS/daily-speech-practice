import { describe, expect, it } from "vitest";

import { aggregateScoresByDate } from "@/lib/trend";

describe("aggregateScoresByDate", () => {
  it("averages multiple scores on the same date", () => {
    expect(
      aggregateScoresByDate([
        { date: "2026-09-01", score: 80 },
        { date: "2026-09-01", score: 90 },
      ]),
    ).toEqual([{ date: "2026-09-01", score: 85 }]);
  });

  it("sorts ascending by date", () => {
    const result = aggregateScoresByDate([
      { date: "2026-09-03", score: 70 },
      { date: "2026-09-01", score: 80 },
    ]);
    expect(result.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-03"]);
  });

  it("rounds averages to one decimal", () => {
    expect(
      aggregateScoresByDate([
        { date: "2026-09-01", score: 81 },
        { date: "2026-09-01", score: 82 },
        { date: "2026-09-01", score: 82 },
      ]),
    ).toEqual([{ date: "2026-09-01", score: 81.7 }]);
  });

  it("returns empty for empty input", () => {
    expect(aggregateScoresByDate([])).toEqual([]);
  });
});
