import { describe, expect, it } from "vitest";

import type { UserProgress } from "@/db/schema";
import {
  MAX_ASSESSMENT_ATTEMPTS,
  PROCESSING_LEASE_MS,
  decideAssessmentStart,
  toAssessmentPayload,
  toSpeechAssessment,
} from "@/lib/assessment-state";

const NOW = 1_000_000_000;

function makeRow(overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    id: 1,
    userId: "u1",
    exerciseId: 1,
    status: "pending",
    audioUrl: null,
    audioKey: "audio/u1/1/x.webm",
    audioDurationMs: 5_000,
    transcript: null,
    score: null,
    pronunciationScore: null,
    fluencyScore: null,
    completenessScore: null,
    feedback: null,
    assessedAt: null,
    completedAt: null,
    attempts: 0,
    startedAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("decideAssessmentStart", () => {
  it("returns missing when there is no row", () => {
    expect(decideAssessmentStart(null, undefined, NOW).kind).toBe("missing");
  });

  it("returns missing when the row has no audio key", () => {
    expect(
      decideAssessmentStart(makeRow({ audioKey: null }), undefined, NOW).kind,
    ).toBe("missing");
  });

  it("returns stale_audio when the requested key differs from the stored key", () => {
    expect(
      decideAssessmentStart(makeRow(), "audio/u1/1/other.webm", NOW).kind,
    ).toBe("stale_audio");
  });

  it("returns completed (idempotent) for a completed row", () => {
    const outcome = decideAssessmentStart(
      makeRow({ status: "completed", score: 88 }),
      undefined,
      NOW,
    );
    expect(outcome.kind).toBe("completed");
    if (outcome.kind === "completed") {
      expect(outcome.payload.assessment?.overallScore).toBe(88);
    }
  });

  it("returns in_progress for a fresh processing row", () => {
    const outcome = decideAssessmentStart(
      makeRow({
        status: "processing",
        startedAt: new Date(NOW - 1_000),
      }),
      undefined,
      NOW,
    );
    expect(outcome.kind).toBe("in_progress");
  });

  it("reclaims an expired processing row as start", () => {
    const outcome = decideAssessmentStart(
      makeRow({
        status: "processing",
        startedAt: new Date(NOW - PROCESSING_LEASE_MS - 1),
      }),
      undefined,
      NOW,
    );
    expect(outcome.kind).toBe("start");
  });

  it("returns start for a pending row", () => {
    expect(decideAssessmentStart(makeRow(), undefined, NOW).kind).toBe("start");
  });

  it("returns start for a failed row under the attempt cap", () => {
    const outcome = decideAssessmentStart(
      makeRow({ status: "failed", attempts: MAX_ASSESSMENT_ATTEMPTS - 1 }),
      undefined,
      NOW,
    );
    expect(outcome.kind).toBe("start");
  });

  it("returns exhausted at the attempt cap", () => {
    expect(
      decideAssessmentStart(
        makeRow({ status: "failed", attempts: MAX_ASSESSMENT_ATTEMPTS }),
        undefined,
        NOW,
      ).kind,
    ).toBe("exhausted");
  });

  it("returns exhausted for an expired processing row at the attempt cap", () => {
    expect(
      decideAssessmentStart(
        makeRow({
          status: "processing",
          attempts: MAX_ASSESSMENT_ATTEMPTS,
          startedAt: new Date(NOW - PROCESSING_LEASE_MS - 1),
        }),
        undefined,
        NOW,
      ).kind,
    ).toBe("exhausted");
  });
});

describe("toAssessmentPayload", () => {
  it("includes an error message for failed rows", () => {
    const payload = toAssessmentPayload(
      makeRow({ status: "failed", lastError: "评分超时，请重试" }),
      1,
    );
    expect(payload.status).toBe("failed");
    expect(payload.error).toBe("评分超时，请重试");
    expect(payload.assessment).toBeNull();
  });

  it("exposes attempt counts", () => {
    const payload = toAssessmentPayload(makeRow({ attempts: 2 }), 1);
    expect(payload.attempts).toBe(2);
    expect(payload.maxAttempts).toBe(MAX_ASSESSMENT_ATTEMPTS);
  });
});

describe("toSpeechAssessment", () => {
  it("serializes a completed row with fallbacks", () => {
    const assessment = toSpeechAssessment(
      {
        score: 88,
        pronunciationScore: 90,
        fluencyScore: 85,
        completenessScore: 89,
        transcript: "hello",
        feedback: "good",
        audioUrl: null,
        audioDurationMs: 5_000,
        assessedAt: new Date("2026-01-02T03:04:05.000Z"),
      },
      7,
    );
    expect(assessment.overallScore).toBe(88);
    expect(assessment.audioUrl).toBe("/api/progress/7/audio");
    expect(assessment.assessedAt).toBe("2026-01-02T03:04:05.000Z");
  });
});
