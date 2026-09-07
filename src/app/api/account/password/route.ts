import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { hash, compare } from "bcryptjs";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userCredentials } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码").max(72),
    newPassword: z.string().min(8, "新密码至少 8 个字符").max(72),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  });

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "settings",
    currentUser.id,
    "请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "密码格式不正确",
      400,
    );
  }

  const [credential] = await db
    .select({ passwordHash: userCredentials.passwordHash })
    .from(userCredentials)
    .where(eq(userCredentials.userId, currentUser.id))
    .limit(1);
  if (!credential) {
    return apiError("NO_PASSWORD_SET", "该账号通过第三方登录，未设置密码", 400);
  }

  if (!(await compare(parsed.data.currentPassword, credential.passwordHash))) {
    return apiError("CURRENT_PASSWORD_WRONG", "当前密码不正确", 400);
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  await db
    .update(userCredentials)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(userCredentials.userId, currentUser.id));

  return apiSuccess({ updated: true }, "密码已更新");
}
