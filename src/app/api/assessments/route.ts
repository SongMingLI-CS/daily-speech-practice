import { after, NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/auth";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  MAX_ASSESSMENT_ATTEMPTS,
  getAssessmentRow,
  runAssessmentJob,
  startAssessment,
  toAssessmentPayload,
} from "@/lib/assessment-runner";
import type { AssessmentStatusPayload } from "@/types/assessment";

export const maxDuration = 300;

const startSchema = z.object({
  exerciseId: z.number().int().positive(),
  objectKey: z.string().min(1).max(500).optional(),
});

function expectedObjectPrefix(userId: string, exerciseId: number): string {
  return `audio/${userId}/${exerciseId}/`;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "assessment",
    currentUser.id,
    "评分请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "评分参数不正确", 400);
  }

  const { exerciseId, objectKey } = parsed.data;

  if (
    objectKey &&
    !objectKey.startsWith(expectedObjectPrefix(currentUser.id, exerciseId))
  ) {
    return apiError("INVALID_AUDIO_KEY", "无权访问该录音", 403);
  }

  const outcome = await startAssessment(currentUser.id, exerciseId, objectKey);

  switch (outcome.kind) {
    case "missing":
      return apiError("ASSESSMENT_NOT_FOUND", "请先完成录音上传", 400);
    case "stale_audio":
      return apiError("AUDIO_KEY_MISMATCH", "录音已被新的上传替代，请重试", 409);
    case "completed":
      return apiSuccess(outcome.payload, "语音评分完成");
    case "in_progress":
      return apiSuccess(outcome.payload, "评分进行中", 202);
    case "exhausted":
      return apiSuccess(outcome.payload, "评分失败次数过多，请重新录音");
    case "start": {
      after(() => runAssessmentJob(currentUser.id, exerciseId, outcome.objectKey));
      const payload: AssessmentStatusPayload = {
        status: "processing",
        assessment: null,
        error: null,
        attempts: outcome.attempts,
        maxAttempts: MAX_ASSESSMENT_ATTEMPTS,
      };
      return apiSuccess(payload, "评分进行中", 202);
    }
    default:
      return apiError("ASSESSMENT_FAILED", "评分状态异常，请重试", 500);
  }
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "assessmentStatus",
    currentUser.id,
    "评分状态查询过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const exerciseId = Number(request.nextUrl.searchParams.get("exerciseId"));
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return apiError("VALIDATION_ERROR", "练习编号无效", 400);
  }

  const row = await getAssessmentRow(currentUser.id, exerciseId);
  if (!row) return apiError("ASSESSMENT_NOT_FOUND", "暂无评分记录", 404);

  return apiSuccess(toAssessmentPayload(row, exerciseId), "获取评分状态成功");
}
