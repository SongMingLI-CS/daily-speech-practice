import { describe, expect, it } from "vitest";

import {
  buildCompletedExerciseIds,
  mergeExercisesWithProgress,
  parseGenerateExercisesResponse,
  toCompleteExercise,
  toExerciseProgressInfo,
  type ExerciseRow,
  type ProgressInput,
} from "@/types/exercise";

const row: ExerciseRow = {
  id: 1,
  title: "标题",
  content: "正文",
  language: "zh",
  category: "分类",
  date: "2026-01-01",
  index: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const completedProgress: ProgressInput = {
  status: "completed",
  completedAt: new Date("2026-01-02T03:04:05.000Z"),
  audioUrl: null,
  score: 88,
  pronunciationScore: 90,
  fluencyScore: 85,
  completenessScore: 89,
  transcript: "hello",
  feedback: "good",
  lastError: null,
};

describe("toExerciseProgressInfo", () => {
  it("converts Date fields to ISO strings and keeps nulls", () => {
    const info = toExerciseProgressInfo(completedProgress);
    expect(info.completedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(info.status).toBe("completed");
    expect(info.score).toBe(88);
  });

  it("returns null for missing fields", () => {
    const info = toExerciseProgressInfo({
      status: "pending",
      completedAt: null,
      audioUrl: null,
      score: null,
      pronunciationScore: null,
      fluencyScore: null,
      completenessScore: null,
      transcript: null,
      feedback: null,
      lastError: null,
    });
    expect(info.completedAt).toBeNull();
    expect(info.score).toBeNull();
  });
});

describe("toCompleteExercise", () => {
  it("serializes a row without progress", () => {
    const exercise = toCompleteExercise(row);
    expect(exercise.id).toBe(1);
    expect(exercise.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(exercise.progress).toBeNull();
  });

  it("attaches progress when provided", () => {
    const exercise = toCompleteExercise(row, completedProgress);
    expect(exercise.progress?.status).toBe("completed");
    expect(exercise.progress?.score).toBe(88);
  });
});

describe("buildCompletedExerciseIds", () => {
  it("maps records to ids", () => {
    expect(buildCompletedExerciseIds([{ exerciseId: 1 }, { exerciseId: 2 }])).toEqual([
      1, 2,
    ]);
  });
});

describe("mergeExercisesWithProgress", () => {
  it("attaches matching progress to each row", () => {
    const merged = mergeExercisesWithProgress(
      [row],
      new Map<number, ProgressInput>([[1, completedProgress]]),
    );
    expect(merged[0].progress?.status).toBe("completed");
    expect(merged[0].progress?.score).toBe(88);
  });
});

describe("parseGenerateExercisesResponse", () => {
  it("rejects non-object payloads", () => {
    expect(parseGenerateExercisesResponse(null).code).toBe("INVALID_RESPONSE");
  });

  it("returns an error payload for non-OK responses", () => {
    const result = parseGenerateExercisesResponse({
      code: "ERROR",
      data: null,
      message: "boom",
    });
    expect(result.code).toBe("ERROR");
    expect(result.message).toBe("boom");
  });

  it("passes through OK responses", () => {
    const result = parseGenerateExercisesResponse({
      code: "OK",
      data: { exercises: [] },
      message: "ok",
    });
    expect(result.code).toBe("OK");
  });
});
