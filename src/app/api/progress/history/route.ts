import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { formatDateKey } from "@/lib/date";
import { buildStreakStats } from "@/lib/streak";
import { getUserTimeZone } from "@/lib/user-settings";

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
        exerciseId: userProgress.exerciseId,
        date: exercises.date,
        score: userProgress.score,
        category: exercises.category,
        language: exercises.language,
        title: exercises.title,
        completedAt: userProgress.completedAt,
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

    const timeZone = await getUserTimeZone(currentUser.id);

    // 打卡天数按用户时区的自然日统计（全量，不做 90 条截断）
    const completedRows = await db
      .select({ completedAt: userProgress.completedAt })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, currentUser.id),
          eq(userProgress.status, "completed"),
          isNotNull(userProgress.score),
          isNotNull(userProgress.completedAt),
        ),
      );
    const practiceDates = completedRows
      .filter((row): row is { completedAt: Date } => row.completedAt !== null)
      .map((row) => formatDateKey(row.completedAt, timeZone));

    const points = rows.map((row) => ({
      exerciseId: row.exerciseId,
      date: row.date,
      score: row.score ?? 0,
      category: row.category,
      language: row.language,
      title: row.title,
      completedAt: row.completedAt ? formatDateKey(row.completedAt, timeZone) : null,
    }));
    const stats = buildStreakStats(practiceDates, formatDateKey(new Date(), timeZone));

    return apiSuccess({ points, stats }, "获取评分趋势成功");
  } catch (error) {
    console.error("[GET /api/progress/history]", error);
    return apiError("HISTORY_FAILED", "获取评分趋势失败，请稍后重试", 500);
  }
}
