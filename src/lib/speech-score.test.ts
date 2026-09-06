import { describe, expect, it } from "vitest";

import {
  calculateCompletenessScore,
  calculateFluencyScore,
  calculateOverallScore,
  calculatePronunciationConfidence,
} from "@/lib/speech-score";

describe("calculateCompletenessScore", () => {
  it("returns 0 for an empty reference", () => {
    expect(calculateCompletenessScore("", "anything", "en")).toBe(0);
  });

  it("returns 100 for an exact match (case-insensitive)", () => {
    expect(calculateCompletenessScore("Hello World", "hello world", "en")).toBe(100);
  });

  it("returns 0 when nothing matches", () => {
    expect(calculateCompletenessScore("abc", "xyz", "en")).toBe(0);
  });

  it("computes a partial score using LCS for English", () => {
    expect(calculateCompletenessScore("the cat sat", "the cat", "en")).toBe(67);
  });

  it("tokenizes Chinese by character", () => {
    expect(calculateCompletenessScore("你好世界", "你好", "zh")).toBe(50);
  });
});

describe("calculatePronunciationConfidence", () => {
  it("falls back to 70 without logprobs", () => {
    expect(calculatePronunciationConfidence(undefined)).toBe(70);
    expect(calculatePronunciationConfidence([])).toBe(70);
  });

  it("returns 100 when every token has zero logprob", () => {
    expect(
      calculatePronunciationConfidence([{ logprob: 0 }, { logprob: 0 }]),
    ).toBe(100);
  });

  it("averages token probabilities", () => {
    expect(
      calculatePronunciationConfidence([{ logprob: -1 }, { logprob: -1 }]),
    ).toBe(37);
  });

  it("ignores missing or non-finite logprobs", () => {
    expect(
      calculatePronunciationConfidence([
        { logprob: 0 },
        { logprob: undefined },
        { logprob: Number.NaN },
      ]),
    ).toBe(100);
  });

  it("clamps very low confidence to 0", () => {
    expect(calculatePronunciationConfidence([{ logprob: -100 }])).toBe(0);
  });
});

describe("calculateFluencyScore", () => {
  it("returns 0 for an empty reference", () => {
    expect(calculateFluencyScore("", 5_000, "en")).toBe(0);
  });

  it("returns 0 for non-positive duration", () => {
    expect(calculateFluencyScore("the cat sat on the mat", 0, "en")).toBe(0);
    expect(calculateFluencyScore("the cat sat on the mat", -1_000, "en")).toBe(0);
  });

  it("returns 100 at the expected speaking rate", () => {
    const reference = "the cat sat on the mat"; // 6 units
    const durationMs = (60_000 * 6) / 140; // 140 words/min for English
    expect(calculateFluencyScore(reference, durationMs, "en")).toBe(100);
  });

  it("penalizes speaking too slowly or too fast", () => {
    const reference = "the cat sat on the mat";
    const slowDuration = (60_000 * 6) / 70;
    const fastDuration = (60_000 * 6) / 280;
    expect(calculateFluencyScore(reference, slowDuration, "en")).toBe(69);
    expect(calculateFluencyScore(reference, fastDuration, "en")).toBe(69);
  });
});

describe("calculateOverallScore", () => {
  it("applies the documented weights", () => {
    expect(
      calculateOverallScore({ pronunciation: 80, fluency: 60, completeness: 50 }),
    ).toBe(64);
  });

  it("returns 100 when all dimensions are perfect", () => {
    expect(
      calculateOverallScore({
        pronunciation: 100,
        fluency: 100,
        completeness: 100,
      }),
    ).toBe(100);
  });

  it("clamps out-of-range input to 0-100", () => {
    expect(
      calculateOverallScore({ pronunciation: 150, fluency: 0, completeness: 0 }),
    ).toBe(53);
    expect(
      calculateOverallScore({
        pronunciation: 200,
        fluency: 200,
        completeness: 200,
      }),
    ).toBe(100);
  });
});
