import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { resolveTimeZone } from "@/lib/date";

/**
 * 读取用户配置的时区，并保证返回一个合法可用的 IANA 时区。
 * 所有「今天是哪一天」的判断（生成练习、恢复今日挑战、打卡日历、连续天数）
 * 都必须走这里，确保口径一致。
 */
export async function getUserTimeZone(userId: string): Promise<string> {
  const [settings] = await db
    .select({ timeZone: userSettings.timeZone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return resolveTimeZone(settings?.timeZone);
}
