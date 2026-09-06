import type { Exercise as ExerciseRow, UserProgress } from "@/db/schema";
import type { ApiResponse } from "@/lib/api-response";

export type ExerciseLanguage = "zh" | "en";
export type ExerciseCount = 1 | 3 | 5;
export type ProgressStatus = "pending" | "processing" | "completed" | "failed";

export type { ExerciseRow };

/** 对应 user_progress 关联的打卡摘要 */
export interface ExerciseProgressInfo {
  status: ProgressStatus;
  completedAt: string | null;
  audioUrl: string | null;
  score: number | null;
  pronunciationScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  transcript: string | null;
  feedback: string | null;
  lastError: string | null;
}

/**
 * API / 前端共用的完整练习类型。
 * 字段均为 JSON 可序列化形态（日期为 ISO 字符串），并附带 progress 关联状态。
 */
export interface CompleteExercise {
  id: number;
  title: string;
  content: string;
  language: ExerciseLanguage;
  category: string;
  date: string;
  index: number;
  createdAt: string;
  progress: ExerciseProgressInfo | null;
}

export interface GenerateExercisesData {
  cached: boolean;
  generated: number;
  date: string;
  language: ExerciseLanguage;
  count: ExerciseCount;
  exercises: CompleteExercise[];
  completedExerciseIds: number[];
}

export type GenerateExercisesResponse = ApiResponse<GenerateExercisesData>;

export type ProgressInput = Pick<
  UserProgress,
  | "status"
  | "completedAt"
  | "audioUrl"
  | "score"
  | "pronunciationScore"
  | "fluencyScore"
  | "completenessScore"
  | "transcript"
  | "feedback"
  | "lastError"
>;

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

export function toExerciseProgressInfo(
  progress: ProgressInput,
): ExerciseProgressInfo {
  return {
    status: progress.status,
    completedAt: toIsoString(progress.completedAt),
    audioUrl: progress.audioUrl,
    score: progress.score,
    pronunciationScore: progress.pronunciationScore,
    fluencyScore: progress.fluencyScore,
    completenessScore: progress.completenessScore,
    transcript: progress.transcript,
    feedback: progress.feedback,
    lastError: progress.lastError ?? null,
  };
}

export function toCompleteExercise(
  row: ExerciseRow,
  progress: ProgressInput | null = null,
): CompleteExercise {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    category: row.category,
    date: row.date,
    index: row.index,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    progress: progress ? toExerciseProgressInfo(progress) : null,
  };
}

export function buildCompletedExerciseIds(
  records: Array<{ exerciseId: number }>,
): number[] {
  return records.map((record) => record.exerciseId);
}

export function mergeExercisesWithProgress(
  rows: ExerciseRow[],
  progressByExerciseId: Map<number, ProgressInput>,
): CompleteExercise[] {
  return rows.map((row) =>
    toCompleteExercise(row, progressByExerciseId.get(row.id) ?? null),
  );
}

export function parseGenerateExercisesResponse(
  data: unknown,
): GenerateExercisesResponse {
  if (!data || typeof data !== "object") {
    return { code: "INVALID_RESPONSE", data: null, message: "响应格式无效" };
  }

  const payload = data as Record<string, unknown>;

  if (payload.code !== "OK") {
    return {
      code: typeof payload.code === "string" ? payload.code : "REQUEST_FAILED",
      data: null,
      message:
        typeof payload.message === "string"
          ? payload.message
          : "生成练习失败，请稍后重试",
    };
  }

  return payload as unknown as GenerateExercisesResponse;
}
