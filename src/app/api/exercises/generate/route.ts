import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import {
  exerciseGenerationLocks,
  exercises,
  userProgress,
} from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  buildCompletedExerciseIds,
  mergeExercisesWithProgress,
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

function getTodayDateString(timeZone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

async function fetchTodayExercises(language: ExerciseLanguage, today: string) {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.date, today), eq(exercises.language, language)))
    .orderBy(asc(exercises.index), asc(exercises.id));
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

async function fetchCompletedProgress(userId: string, exerciseIds: number[]) {
  if (exerciseIds.length === 0) {
    return {
      completedExerciseIds: [] as number[],
      progressByExerciseId: new Map<
        number,
        {
          status: "pending" | "completed";
          completedAt: Date | null;
          audioUrl: string | null;
          score: number | null;
          pronunciationScore: number | null;
          fluencyScore: number | null;
          completenessScore: number | null;
          transcript: string | null;
          feedback: string | null;
        }
      >(),
    };
  }

  const records = await db
    .select({
      exerciseId: userProgress.exerciseId,
      status: userProgress.status,
      completedAt: userProgress.completedAt,
      audioUrl: userProgress.audioUrl,
      score: userProgress.score,
      pronunciationScore: userProgress.pronunciationScore,
      fluencyScore: userProgress.fluencyScore,
      completenessScore: userProgress.completenessScore,
      transcript: userProgress.transcript,
      feedback: userProgress.feedback,
    })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        inArray(userProgress.exerciseId, exerciseIds),
      ),
    );

  return {
    completedExerciseIds: buildCompletedExerciseIds(
      records.filter((record) => record.status === "completed"),
    ),
    progressByExerciseId: new Map(
      records.map((record) => [
        record.exerciseId,
        record,
      ]),
    ),
  };
}

async function buildResponse(
  userId: string,
  language: ExerciseLanguage,
  count: ExerciseCount,
  today: string,
  cached: boolean,
  generated: number,
): Promise<GenerateExercisesData> {
  const rows = (await fetchTodayExercises(language, today)).slice(0, count);
  const { completedExerciseIds, progressByExerciseId } =
    await fetchCompletedProgress(userId, rows.map((row) => row.id));
  return {
    cached,
    generated,
    date: today,
    language,
    count,
    exercises: mergeExercisesWithProgress(rows, progressByExerciseId),
    completedExerciseIds,
  };
}

async function generateExercisesWithDeepSeek(
  language: ExerciseLanguage,
  count: number,
): Promise<GeneratedExercisePayload[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
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
    signal: AbortSignal.timeout(60_000),
  });

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
  const today = getTodayDateString();

  try {
    const existing = await fetchTodayExercises(language, today);
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
      const refreshed = await fetchTodayExercises(language, today);
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
    return apiError("GENERATION_FAILED", "生成练习失败，请稍后重试", 500);
  }
}
