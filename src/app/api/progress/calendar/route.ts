import { and, eq, isNotNull } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userProgress, userSettings } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { formatDateKey } from "@/lib/date";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

interface CalendarResponse {
  month: string;
  practiced: number;
  avgScore: number;
  todayPracticed: boolean;
  days: Array<{ date: string; count: number; score: number }>;
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "history",
    currentUser.id,
    "日历查询过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!MONTH_PATTERN.test(month)) {
    return apiError("VALIDATION_ERROR", "month 参数格式应为 YYYY-MM", 400);
  }

  try {
    const [settings] = await db
      .select({ timeZone: userSettings.timeZone })
      .from(userSettings)
      .where(eq(userSettings.userId, currentUser.id))
      .limit(1);
    const timeZone = settings?.timeZone ?? "Asia/Shanghai";

    const completedRows = await db
      .select({ completedAt: userProgress.completedAt, score: userProgress.score })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, currentUser.id),
          eq(userProgress.status, "completed"),
          isNotNull(userProgress.score),
          isNotNull(userProgress.completedAt),
        ),
      );

    const byDate = new Map<string, { sum: number; count: number }>();
    for (const row of completedRows) {
      if (!row.completedAt) continue;
      const key = formatDateKey(row.completedAt, timeZone);
      if (!key.startsWith(`${month}-`)) continue;
      const bucket = byDate.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += row.score ?? 0;
      bucket.count += 1;
      byDate.set(key, bucket);
    }

    const todayKey = formatDateKey(new Date(), timeZone);
    const days = Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, { sum, count }]) => ({
        date,
        count,
        score: Math.round((sum / count) * 10) / 10,
      }));

    const practiced = days.length;
    const avgScore =
      practiced === 0 ? 0 : days.reduce((total, day) => total + day.score, 0) / practiced;
    const data: CalendarResponse = {
      month,
      practiced,
      avgScore: Math.round(avgScore * 10) / 10,
      todayPracticed: byDate.has(todayKey),
      days,
    };

    return apiSuccess(data, "获取打卡日历成功");
  } catch (error) {
    console.error("[GET /api/progress/calendar]", error);
    return apiError("CALENDAR_FAILED", "获取打卡日历失败，请稍后重试", 500);
  }
}
