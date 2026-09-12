import { describe, expect, it } from "vitest";

import { isR2Configured } from "@/lib/audio-storage-config";

const REAL_ENV = {
  R2_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "ACCESSKEY123",
  R2_SECRET_ACCESS_KEY: "SECRETKEY456",
  R2_BUCKET_NAME: "daily-speech-practice",
};

describe("isR2Configured", () => {
  it("returns true for a complete real configuration", () => {
    expect(isR2Configured(REAL_ENV)).toBe(true);
  });

  it("returns false when any required value is missing", () => {
    expect(isR2Configured({ ...REAL_ENV, R2_ENDPOINT: undefined })).toBe(false);
    expect(isR2Configured({ ...REAL_ENV, R2_BUCKET_NAME: "" })).toBe(false);
    expect(isR2Configured({})).toBe(false);
  });

  it("ignores .env.example placeholder values", () => {
    expect(
      isR2Configured({
        R2_ENDPOINT: "https://your-account-id.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID: "replace-me",
        R2_SECRET_ACCESS_KEY: "replace-me",
        R2_BUCKET_NAME: "daily-speech-practice",
      }),
    ).toBe(false);
  });

  it("rejects non-http endpoints", () => {
    expect(isR2Configured({ ...REAL_ENV, R2_ENDPOINT: "ftp://x" })).toBe(false);
  });
});
