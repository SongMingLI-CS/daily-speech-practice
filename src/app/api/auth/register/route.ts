import { randomUUID } from "node:crypto";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { userCredentials, userSettings, users } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { registerSchema } from "@/lib/auth-validation";
import { getClientIp } from "@/lib/rate-limit";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function POST(request: NextRequest) {
  const limited = await getRateLimitResponse(
    "register",
    getClientIp(request),
    "注册请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "注册信息格式不正确",
      400,
    );
  }

  const { email, name, password } = parsed.data;
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return apiError("EMAIL_ALREADY_EXISTS", "该邮箱已注册", 409);
  }

  try {
    const passwordHash = await hash(password, 12);
    const userId = randomUUID();
    await db.batch([
      db.insert(users).values({ id: userId, email, name }),
      db.insert(userCredentials).values({ userId, passwordHash }),
      db.insert(userSettings).values({ userId }),
    ]);

    return apiSuccess({ id: userId, email, name }, "注册成功", 201);
  } catch (error) {
    console.error("[POST /api/auth/register]", error);
    if (isUniqueViolation(error)) {
      return apiError("EMAIL_ALREADY_EXISTS", "该邮箱已注册", 409);
    }
    return apiError("REGISTER_FAILED", "注册失败，请稍后重试", 500);
  }
}
