import { describe, expect, it } from "vitest";

import {
  diffReferenceSegments,
  diffReferenceTokens,
  diffSentences,
  splitSentences,
} from "@/lib/speech-diff";

describe("splitSentences", () => {
  it("splits on Chinese punctuation", () => {
    expect(splitSentences("你好。世界！再见？").map((s) => s.text)).toEqual([
      "你好。",
      "世界！",
      "再见？",
    ]);
  });

  it("splits on English punctuation", () => {
    expect(splitSentences("Hello world. How are you? Fine!").map((s) => s.text)).toEqual([
      "Hello world.",
      "How are you?",
      "Fine!",
    ]);
  });

  it("splits on newlines and trims whitespace", () => {
    expect(splitSentences("First line.\nSecond line.  ").map((s) => s.text)).toEqual([
      "First line.",
      "Second line.",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(splitSentences("")).toEqual([]);
  });
});

describe("diffReferenceTokens", () => {
  it("marks all tokens matched for an exact English match", () => {
    const tokens = diffReferenceTokens("the cat sat", "the cat sat", "en");
    expect(tokens.map((t) => t.matched)).toEqual([true, true, true]);
  });

  it("marks missed tokens for missing words", () => {
    const tokens = diffReferenceTokens("the cat sat", "the cat", "en");
    expect(tokens.map((t) => t.matched)).toEqual([true, true, false]);
  });

  it("tokenizes Chinese by character and highlights misses", () => {
    const tokens = diffReferenceTokens("你好世界", "你好", "zh");
    expect(tokens.map((t) => t.matched)).toEqual([true, true, false, false]);
  });

  it("is case-insensitive", () => {
    const tokens = diffReferenceTokens("Hello World", "hello world", "en");
    expect(tokens.every((t) => t.matched)).toBe(true);
  });
});

describe("diffReferenceSegments", () => {
  it("keeps punctuation as neutral matched segments", () => {
    const segments = diffReferenceSegments("Hello, world", "hello world", "en");
    expect(segments.every((s) => s.matched)).toBe(true);
  });

  it("highlights only the missed word", () => {
    const segments = diffReferenceSegments("the cat sat", "the cat", "en");
    const missed = segments.filter((s) => !s.matched).map((s) => s.text);
    expect(missed).toEqual(["sat"]);
  });
});

describe("diffSentences", () => {
  it("classifies per-sentence coverage", () => {
    const result = diffSentences("你好世界。今天天气真好。", "你好世界。今天", "zh");
    expect(result.length).toBe(2);
    expect(result[0].passed).toBe(true);
    expect(result[0].coverage).toBe(100);
    expect(result[1].passed).toBe(false);
  });

  it("passes sentences that have no tokens", () => {
    const result = diffSentences("……", "x", "zh");
    expect(result[0].passed).toBe(true);
  });

  it("respects a custom pass threshold", () => {
    const result = diffSentences("the cat sat on the mat", "the cat", "en", 90);
    expect(result[0].passed).toBe(false);
  });
});
