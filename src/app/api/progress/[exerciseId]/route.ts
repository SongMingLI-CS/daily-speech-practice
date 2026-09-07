import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userProgress } from "@/db/schema";
import { deleteAudioObject } from "@/lib/audio-store";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

interface RouteContext {
  params: Promise<{ exerciseId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "audio",
    currentUser.id,
    "删除请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const exerciseId = Number((await context.params).exerciseId);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return apiError("VALIDATION_ERROR", "练习编号无效", 400);
  }

  try {
    const [row] = await db
      .select({ audioKey: userProgress.audioKey })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, currentUser.id),
          eq(userProgress.exerciseId, exerciseId),
        ),
      )
      .limit(1);
    if (!row) return apiError("PROGRESS_NOT_FOUND", "打卡记录不存在", 404);

    if (row.audioKey) {
      try {
        await deleteAudioObject(row.audioKey);
      } catch (cleanupError) {
        console.warn("[DELETE /api/progress/:exerciseId] 音频清理失败", cleanupError);
      }
    }

    await db
      .delete(userProgress)
      .where(
        and(
          eq(userProgress.userId, currentUser.id),
          eq(userProgress.exerciseId, exerciseId),
        ),
      );

    return apiSuccess({ exerciseId }, "打卡记录已删除");
  } catch (error) {
    console.error("[DELETE /api/progress/:exerciseId]", error);
    return apiError("PROGRESS_DELETE_FAILED", "删除记录失败，请稍后重试", 500);
  }
}
