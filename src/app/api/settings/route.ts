import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

const settingsSchema = z.object({
  defaultLanguage: z.enum(["zh", "en"]),
  dailyCount: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  timeZone: z.string().trim().min(1).max(80),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);
  const limited = await getRateLimitResponse(
    "settings",
    currentUser.id,
    "设置读取过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, currentUser.id))
    .limit(1);

  return apiSuccess(
    settings ?? {
      userId: currentUser.id,
      defaultLanguage: "zh" as const,
      dailyCount: 3,
      timeZone: "Asia/Shanghai",
      updatedAt: null,
    },
  );
}

export async function PATCH(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);
  const limited = await getRateLimitResponse(
    "settings",
    currentUser.id,
    "设置更新过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "个人设置格式不正确", 400);
  }

  const [settings] = await db
    .insert(userSettings)
    .values({ userId: currentUser.id, ...parsed.data })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  return apiSuccess(settings, "个人设置已保存");
}
