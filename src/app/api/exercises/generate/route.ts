import { randomUUID } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exerciseGenerationLocks, exercises } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getTodayDateString } from "@/lib/date";
import {
  fetchExercisesByDate,
  loadExercisesWithProgress,
} from "@/lib/exercise-queries";
import { fetchWithRetry } from "@/lib/http";
import { getUserTimeZone } from "@/lib/user-settings";
import {
  type ExerciseCount,
  type ExerciseLanguage,
  type GenerateExercisesData,
} from "@/types/exercise";

const VALID_LANGUAGES = ["zh", "en"] as const;
const VALID_COUNTS = [1, 3, 5] as const;
const GENERATION_LEASE_MS = 90_000;

interface GenerateRequestBody {
  language: ExerciseLanguage;
  count: ExerciseCount;
}

interface GeneratedExercisePayload {
  title: string;
  category: string;
  content: string;
}

const SYSTEM_PROMPT = `你是专业的口才训练教练和语言专家。请生成适合每日朗读训练的文本。
中文内容需要有感染力和画面感；英文内容应现代、自然、有节奏感。
你必须且只能返回标准 JSON 数组，不要包含 Markdown 标记。每项格式为：
{"title":"标题","category":"分类名","content":"正文，可使用 \\n 换行"}`;

function parseRequestBody(body: unknown): GenerateRequestBody {
  if (!body || typeof body !== "object") throw new Error("请求体格式无效");
  const { language, count } = body as Partial<GenerateRequestBody>;
  if (!language || !VALID_LANGUAGES.includes(language)) {
    throw new Error("language 必须是 'zh' 或 'en'");
  }
  if (count === undefined || !VALID_COUNTS.includes(count)) {
    throw new Error("count 必须是 1、3 或 5");
  }
  return { language, count };
}

function parseDeepSeekExercises(rawContent: string): GeneratedExercisePayload[] {
  let cleaned = rawContent.trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fencedMatch) cleaned = fencedMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI_RESPONSE_INVALID");
  }
  if (!Array.isArray(parsed)) throw new Error("AI_RESPONSE_INVALID");

  return parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("AI_RESPONSE_INVALID");
    const { title, category, content } = item as Record<string, unknown>;
    if (
      typeof title !== "string" ||
      typeof category !== "string" ||
      typeof content !== "string" ||
      !title.trim() ||
      !category.trim() ||
      !content.trim()
    ) {
      throw new Error("AI_RESPONSE_INVALID");
    }
    return {
      title: title.trim().slice(0, 120),
      category: category.trim().slice(0, 60),
      content: content.trim().slice(0, 10_000),
    };
  });
}

async function acquireGenerationLock(language: ExerciseLanguage, today: string) {
  const ownerToken = randomUUID();
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + GENERATION_LEASE_MS);
  const [lock] = await db
    .insert(exerciseGenerationLocks)
    .values({ date: today, language, ownerToken, lockedUntil })
    .onConflictDoUpdate({
      target: [exerciseGenerationLocks.date, exerciseGenerationLocks.language],
      set: { ownerToken, lockedUntil },
      setWhere: lt(exerciseGenerationLocks.lockedUntil, now),
    })
    .returning({ ownerToken: exerciseGenerationLocks.ownerToken });

  return lock?.ownerToken === ownerToken ? ownerToken : null;
}

async function releaseGenerationLock(
  language: ExerciseLanguage,
  today: string,
  ownerToken: string,
) {
  await db
    .delete(exerciseGenerationLocks)
    .where(
      and(
        eq(exerciseGenerationLocks.date, today),
        eq(exerciseGenerationLocks.language, language),
        eq(exerciseGenerationLocks.ownerToken, ownerToken),
      ),
    );
}

async function buildResponse(
  userId: string,
  language: ExerciseLanguage,
  count: ExerciseCount,
  today: string,
  cached: boolean,
  generated: number,
): Promise<GenerateExercisesData> {
  const { exercises, completedExerciseIds } = await loadExercisesWithProgress(
    userId,
    language,
    count,
    today,
  );
  return {
    cached,
    generated,
    date: today,
    language,
    count,
    exercises,
    completedExerciseIds,
  };
}

async function generateExercisesWithDeepSeek(
  language: ExerciseLanguage,
  count: number,
): Promise<GeneratedExercisePayload[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetchWithRetry(
    "https://api.deepseek.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `生成 ${count} 篇语言为 ${language} 的练习。` },
        ],
        temperature: 0.8,
      }),
    },
    {
      timeoutMs: 60_000,
      retries: 2,
      onRetry: (attempt, error) =>
        console.warn("[generate] DeepSeek retry", { attempt, error }),
    },
  );

  if (!response.ok) throw new Error("AI_PROVIDER_ERROR");
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI_RESPONSE_INVALID");

  const generated = parseDeepSeekExercises(content);
  if (generated.length !== count) throw new Error("AI_RESPONSE_INVALID");
  return generated;
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);
  const limited = await getRateLimitResponse(
    "generate",
    currentUser.id,
    "生成请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  let body: GenerateRequestBody;
  try {
    body = parseRequestBody(await request.json());
  } catch (error) {
    return apiError(
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "请求参数不正确",
      400,
    );
  }

  const { language, count } = body;

  try {
    // 与打卡/连续天数保持同一时区口径：以用户设置的时区判定「今天」。
    const timeZone = await getUserTimeZone(currentUser.id);
    const today = getTodayDateString(timeZone);
    const existing = await fetchExercisesByDate(language, today);
    if (existing.length >= count) {
      return apiSuccess(
        await buildResponse(currentUser.id, language, count, today, true, 0),
      );
    }

    const ownerToken = await acquireGenerationLock(language, today);
    if (!ownerToken) {
      return apiError(
        "GENERATION_IN_PROGRESS",
        "今日练习正在生成，请稍后重试",
        409,
      );
    }

    try {
      const refreshed = await fetchExercisesByDate(language, today);
      if (refreshed.length < count) {
        const need = count - refreshed.length;
        const generated = await generateExercisesWithDeepSeek(language, need);
        await db
          .insert(exercises)
          .values(
            generated.map((item, offset) => ({
              ...item,
              language,
              date: today,
              index: refreshed.length + offset + 1,
            })),
          )
          .onConflictDoNothing();

        return apiSuccess(
          await buildResponse(currentUser.id, language, count, today, false, need),
          "今日练习生成成功",
        );
      }

      return apiSuccess(
        await buildResponse(currentUser.id, language, count, today, true, 0),
      );
    } finally {
      try {
        await releaseGenerationLock(language, today, ownerToken);
      } catch (releaseError) {
        console.error("[release exercise generation lock]", releaseError);
      }
    }
  } catch (error) {
    console.error("[POST /api/exercises/generate]", error);
    const reason = error instanceof Error ? error.message : "";
    if (reason === "AI_NOT_CONFIGURED") {
      return apiError("AI_NOT_CONFIGURED", "AI 生成服务未配置，请联系管理员", 503);
    }
    if (reason === "AI_PROVIDER_ERROR") {
      return apiError("AI_PROVIDER_ERROR", "AI 服务暂时不可用，请稍后重试", 502);
    }
    if (reason === "AI_RESPONSE_INVALID") {
      return apiError("AI_RESPONSE_INVALID", "AI 返回内容格式异常，请重试", 502);
    }
    return apiError("GENERATION_FAILED", "生成练习失败，请稍后重试", 500);
  }
}
