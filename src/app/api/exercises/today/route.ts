import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getTodayDateString } from "@/lib/date";
import { loadExercisesWithProgress } from "@/lib/exercise-queries";
import { getUserTimeZone } from "@/lib/user-settings";
import {
  type ExerciseCount,
  type ExerciseLanguage,
  type GenerateExercisesData,
} from "@/types/exercise";

const VALID_LANGUAGES = ["zh", "en"] as const;
const VALID_COUNTS = [1, 3, 5] as const;

/**
 * 只读恢复接口：返回「今天已生成的挑战 + 当前用户的打卡/评分进度」。
 * 不会触发 AI 生成，页面刷新后据此恢复内容，避免看起来数据丢失。
 */
export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "exercisesToday",
    currentUser.id,
    "刷新过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const languageParam = searchParams.get("language");
  const language: ExerciseLanguage =
    languageParam && (VALID_LANGUAGES as readonly string[]).includes(languageParam)
      ? (languageParam as ExerciseLanguage)
      : "zh";
  const rawCount = Number(searchParams.get("count"));
  const count: ExerciseCount =
    Number.isInteger(rawCount) && (VALID_COUNTS as readonly number[]).includes(rawCount)
      ? (rawCount as ExerciseCount)
      : 3;

  try {
    // 与生成接口、打卡日历使用同一时区口径。
    const timeZone = await getUserTimeZone(currentUser.id);
    const today = getTodayDateString(timeZone);
    const { exercises, completedExerciseIds } = await loadExercisesWithProgress(
      currentUser.id,
      language,
      count,
      today,
    );

    const data: GenerateExercisesData = {
      cached: true,
      generated: 0,
      date: today,
      language,
      count,
      exercises,
      completedExerciseIds,
    };

    return apiSuccess(
      data,
      exercises.length > 0 ? "已加载今日挑战" : "今日挑战尚未生成",
    );
  } catch (error) {
    console.error("[GET /api/exercises/today]", error);
    return apiError("EXERCISES_LOAD_FAILED", "获取今日练习失败，请稍后重试", 500);
  }
}
