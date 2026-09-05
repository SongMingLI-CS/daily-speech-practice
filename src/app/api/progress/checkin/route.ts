import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exercises, userProgress, users } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

function parseExerciseId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const { exerciseId } = body as { exerciseId?: unknown };
  return typeof exerciseId === "number" &&
    Number.isInteger(exerciseId) &&
    exerciseId > 0
    ? exerciseId
    : null;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);
  const limited = await getRateLimitResponse(
    "checkin",
    currentUser.id,
    "打卡请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const exerciseId = parseExerciseId(await request.json().catch(() => null));
  if (!exerciseId) {
    return apiError("VALIDATION_ERROR", "exerciseId 必须是正整数", 400);
  }

  const [[user], [exercise]] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.id, currentUser.id)).limit(1),
    db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .limit(1),
  ]);

  if (!user) return apiError("USER_NOT_FOUND", "当前账号不存在", 404);
  if (!exercise) return apiError("EXERCISE_NOT_FOUND", "练习不存在", 404);

  try {
    const completedAt = new Date();
    const [record] = await db
      .insert(userProgress)
      .values({
        userId: currentUser.id,
        exerciseId,
        status: "completed",
        completedAt,
      })
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.exerciseId],
        set: { status: "completed", completedAt },
      })
      .returning();

    return apiSuccess({ progress: record }, "打卡成功");
  } catch (error) {
    console.error("[POST /api/progress/checkin]", error);
    return apiError("CHECKIN_FAILED", "打卡记录保存失败，请稍后重试", 500);
  }
}
