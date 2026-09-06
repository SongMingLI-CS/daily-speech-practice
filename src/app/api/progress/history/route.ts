import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "history",
    currentUser.id,
    "趋势查询过于频繁，请稍后再试",
  );
  if (limited) return limited;

  try {
    const rows = await db
      .select({
        date: exercises.date,
        score: userProgress.score,
        category: exercises.category,
        language: exercises.language,
        title: exercises.title,
      })
      .from(userProgress)
      .innerJoin(exercises, eq(userProgress.exerciseId, exercises.id))
      .where(
        and(
          eq(userProgress.userId, currentUser.id),
          eq(userProgress.status, "completed"),
          isNotNull(userProgress.score),
        ),
      )
      // 取「最近」90 条：按完成时间倒序截取，前端聚合时再按日期升序排列
      .orderBy(desc(userProgress.completedAt), desc(userProgress.id))
      .limit(90);

    const points = rows.map((row) => ({
      date: row.date,
      score: row.score ?? 0,
      category: row.category,
      language: row.language,
      title: row.title,
    }));

    return apiSuccess({ points }, "获取评分趋势成功");
  } catch (error) {
    console.error("[GET /api/progress/history]", error);
    return apiError("HISTORY_FAILED", "获取评分趋势失败，请稍后重试", 500);
  }
}
