import type { Exercise as ExerciseRow, UserProgress } from "@/db/schema";

export type ExerciseLanguage = "zh" | "en";
export type ExerciseCount = 1 | 3 | 5;
export type ProgressStatus = "pending" | "completed";

export type { ExerciseRow };

/** 对应 user_progress 关联的打卡摘要 */
export interface ExerciseProgressInfo {
  status: ProgressStatus;
  completedAt: string | null;
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
  createdAt: string;
  progress: ExerciseProgressInfo | null;
}

export interface GenerateExercisesSuccessResponse {
  success: true;
  cached: boolean;
  generated: number;
  userId: string;
  date: string;
  language: ExerciseLanguage;
  count: ExerciseCount;
  exercises: CompleteExercise[];
  completedExerciseIds: number[];
}

export interface GenerateExercisesErrorResponse {
  success: false;
  error: string;
}

export type GenerateExercisesResponse =
  | GenerateExercisesSuccessResponse
  | GenerateExercisesErrorResponse;

type ProgressInput = Pick<UserProgress, "status" | "completedAt">;

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

export function isGenerateExercisesSuccess(
  data: GenerateExercisesResponse,
): data is GenerateExercisesSuccessResponse {
  return data.success === true;
}

export function parseGenerateExercisesResponse(
  data: unknown,
): GenerateExercisesResponse {
  if (!data || typeof data !== "object") {
    return { success: false, error: "响应格式无效" };
  }

  const payload = data as Record<string, unknown>;

  if (payload.success !== true) {
    return {
      success: false,
      error:
        typeof payload.error === "string"
          ? payload.error
          : "生成练习失败，请稍后重试",
    };
  }

  return payload as unknown as GenerateExercisesSuccessResponse;
}
