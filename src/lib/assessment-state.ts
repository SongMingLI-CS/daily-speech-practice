import type { UserProgress } from "@/db/schema";
import type {
  AssessmentStatusPayload,
  SpeechAssessment,
} from "@/types/assessment";

export const MAX_ASSESSMENT_ATTEMPTS = 3;
/** 单个评分任务的最坏耗时约 2.5 分钟（转写 90s + 精修 60s + 下载），租约取 5 分钟。 */
export const PROCESSING_LEASE_MS = 5 * 60_000;

export function toSpeechAssessment(
  row: {
    score: number | null;
    pronunciationScore: number | null;
    fluencyScore: number | null;
    completenessScore: number | null;
    transcript: string | null;
    feedback: string | null;
    audioUrl: string | null;
    audioDurationMs: number | null;
    assessedAt: Date | null;
  },
  exerciseId: number,
): SpeechAssessment {
  return {
    overallScore: row.score ?? 0,
    pronunciationScore: row.pronunciationScore ?? 0,
    fluencyScore: row.fluencyScore ?? 0,
    completenessScore: row.completenessScore ?? 0,
    transcript: row.transcript ?? "",
    feedback: row.feedback ?? "",
    audioUrl: row.audioUrl ?? `/api/progress/${exerciseId}/audio`,
    durationMs: row.audioDurationMs ?? 0,
    assessedAt: row.assessedAt?.toISOString() ?? new Date(0).toISOString(),
  };
}

export function toAssessmentPayload(
  row: Pick<
    UserProgress,
    | "status"
    | "score"
    | "pronunciationScore"
    | "fluencyScore"
    | "completenessScore"
    | "transcript"
    | "feedback"
    | "audioUrl"
    | "audioDurationMs"
    | "assessedAt"
    | "lastError"
    | "attempts"
  >,
  exerciseId: number,
): AssessmentStatusPayload {
  return {
    status: row.status,
    assessment:
      row.status === "completed" ? toSpeechAssessment(row, exerciseId) : null,
    error: row.status === "failed" ? (row.lastError ?? "语音评分失败，请重试") : null,
    attempts: row.attempts,
    maxAttempts: MAX_ASSESSMENT_ATTEMPTS,
  };
}

export type AssessmentStartOutcome =
  | { kind: "missing" }
  | { kind: "stale_audio" }
  | { kind: "completed"; payload: AssessmentStatusPayload }
  | { kind: "in_progress"; payload: AssessmentStatusPayload }
  | { kind: "exhausted"; payload: AssessmentStatusPayload }
  | { kind: "start"; objectKey: string; attempts: number };

/**
 * 根据当前进度行 + 请求的 objectKey 判定下一步动作。
 * - 无记录 / 无 audioKey → missing
 * - 传入 objectKey 与行内 audioKey 不一致 → stale_audio（已被新上传覆盖）
 * - completed → 幂等返回结果
 * - processing 且租约未过期 → 进行中
 * - processing 但租约已过期 → 视作可回收，继续走 start 分支
 * - 已达重试上限 → exhausted
 * - 否则 → start（需启动后台评分）
 */
export function decideAssessmentStart(
  row: UserProgress | null,
  objectKey: string | undefined,
  now: number,
): AssessmentStartOutcome {
  if (!row) return { kind: "missing" };

  const effectiveKey = objectKey ?? row.audioKey;
  if (objectKey && row.audioKey && objectKey !== row.audioKey) {
    return { kind: "stale_audio" };
  }
  if (!effectiveKey) return { kind: "missing" };

  const payload = toAssessmentPayload(row, row.exerciseId);

  if (row.status === "completed") return { kind: "completed", payload };

  if (row.status === "processing") {
    const startedAt = row.startedAt?.getTime();
    if (startedAt != null && now - startedAt < PROCESSING_LEASE_MS) {
      return { kind: "in_progress", payload };
    }
  }

  if (row.attempts >= MAX_ASSESSMENT_ATTEMPTS) {
    return { kind: "exhausted", payload };
  }

  return { kind: "start", objectKey: effectiveKey, attempts: row.attempts };
}
