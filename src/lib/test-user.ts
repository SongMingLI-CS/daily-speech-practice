import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

export const TEST_USER_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
export const TEST_USER_NAME = "测试小助手";
export const TEST_USER_EMAIL = "test-assistant@daily-speech-practice.local";

/**
 * 若请求方为硬编码测试用户且 users 表中不存在，则自动插入种子数据。
 */
export async function ensureTestUser(userId: string): Promise<void> {
  if (userId !== TEST_USER_ID) {
    return;
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, TEST_USER_ID))
    .limit(1);

  if (existing) {
    return;
  }

  await db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      name: TEST_USER_NAME,
      email: TEST_USER_EMAIL,
    })
    .onConflictDoNothing();
}
