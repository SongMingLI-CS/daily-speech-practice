import { describe, expect, it } from "vitest";

import {
  extensionFor,
  MAX_AUDIO_BYTES,
  MAX_DURATION_MS,
  uploadCompleteSchema,
  uploadRequestSchema,
} from "@/lib/upload-validation";

describe("uploadRequestSchema", () => {
  it("accepts a valid upload request", () => {
    const result = uploadRequestSchema.parse({
      exerciseId: 1,
      contentType: "audio/webm",
      sizeBytes: 1_000,
    });
    expect(result.sizeBytes).toBe(1_000);
  });

  it("accepts ogg and mp4 content types", () => {
    expect(
      uploadRequestSchema.parse({
        exerciseId: 1,
        contentType: "audio/ogg; codecs=opus",
        sizeBytes: 1,
      }).contentType,
    ).toContain("audio/ogg");
    expect(
      uploadRequestSchema.parse({
        exerciseId: 1,
        contentType: "audio/mp4",
        sizeBytes: 1,
      }).contentType,
    ).toBe("audio/mp4");
  });

  it("rejects non-audio content types", () => {
    expect(
      uploadRequestSchema.safeParse({
        exerciseId: 1,
        contentType: "video/mp4",
        sizeBytes: 1,
      }).success,
    ).toBe(false);
    expect(
      uploadRequestSchema.safeParse({
        exerciseId: 1,
        contentType: "application/octet-stream",
        sizeBytes: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects oversized uploads", () => {
    expect(
      uploadRequestSchema.safeParse({
        exerciseId: 1,
        contentType: "audio/webm",
        sizeBytes: MAX_AUDIO_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive exercise id", () => {
    expect(
      uploadRequestSchema.safeParse({
        exerciseId: 0,
        contentType: "audio/webm",
        sizeBytes: 1,
      }).success,
    ).toBe(false);
  });
});

describe("uploadCompleteSchema", () => {
  it("accepts a valid completion payload", () => {
    const result = uploadCompleteSchema.parse({
      exerciseId: 1,
      objectKey: "audio/u/1/k.webm",
      durationMs: 5_000,
    });
    expect(result.durationMs).toBe(5_000);
  });

  it("rejects a duration below the minimum", () => {
    expect(
      uploadCompleteSchema.safeParse({
        exerciseId: 1,
        objectKey: "audio/u/1/k.webm",
        durationMs: 999,
      }).success,
    ).toBe(false);
  });

  it("rejects a duration above the maximum", () => {
    expect(
      uploadCompleteSchema.safeParse({
        exerciseId: 1,
        objectKey: "audio/u/1/k.webm",
        durationMs: MAX_DURATION_MS + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty object key", () => {
    expect(
      uploadCompleteSchema.safeParse({
        exerciseId: 1,
        objectKey: "",
        durationMs: 5_000,
      }).success,
    ).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps content types to file extensions", () => {
    expect(extensionFor("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/webm")).toBe("webm");
  });
});
