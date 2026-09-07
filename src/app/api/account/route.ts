import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userProgress, users } from "@/db/schema";
import { deleteAudioObject } from "@/lib/audio-store";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

const nameSchema = z.object({
  name: z.string().trim().min(1, "昵称不能为空").max(40, "昵称最多 40 个字符"),
});

const deleteSchema = z.object({
  email: z.string().email("请输入正确的邮箱"),
});

export async function PATCH(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "settings",
    currentUser.id,
    "请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "昵称格式不正确",
      400,
    );
  }

  await db
    .update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, currentUser.id));

  return apiSuccess({ name: parsed.data.name }, "昵称已更新");
}

export async function DELETE(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "settings",
    currentUser.id,
    "删除请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "请填写用于确认的邮箱", 400);
  }
  if (parsed.data.email !== currentUser.email) {
    return apiError("CONFIRMATION_MISMATCH", "确认邮箱与登录邮箱不一致", 400);
  }

  try {
    const rows = await db
      .select({ audioKey: userProgress.audioKey })
      .from(userProgress)
      .where(eq(userProgress.userId, currentUser.id));

    for (const row of rows) {
      if (!row.audioKey) continue;
      try {
        await deleteAudioObject(row.audioKey);
      } catch (cleanupError) {
        console.warn("[DELETE /api/account] 音频清理失败", cleanupError);
      }
    }

    await db.delete(users).where(and(eq(users.id, currentUser.id)));

    return apiSuccess({ deleted: true }, "账号已删除，感谢使用");
  } catch (error) {
    console.error("[DELETE /api/account]", error);
    return apiError("ACCOUNT_DELETE_FAILED", "删除账号失败，请稍后重试", 500);
  }
}
