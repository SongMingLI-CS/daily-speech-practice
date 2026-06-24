import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import { ensureTestUser } from "@/lib/test-user";
import {
  buildCompletedExerciseIds,
  mergeExercisesWithProgress,
  type ExerciseCount,
  type ExerciseLanguage,
  type GenerateExercisesSuccessResponse,
} from "@/types/exercise";

const VALID_LANGUAGES = ["zh", "en"] as const;
const VALID_COUNTS = [1, 3, 5] as const;

interface GenerateRequestBody {
  userId: string;
  language: ExerciseLanguage;
  count: ExerciseCount;
}

interface GeneratedExercisePayload {
  title: string;
  category: string;
  content: string;
}

const SYSTEM_PROMPT = `你是一个专业的口才训练教练和语言专家。你的任务是为用户生成用于"每日口才/练嘴"挑战的练习文本。
根据用户请求的语言（zh = 中文，en = 英文）和数量，生成对应篇数的练习内容。
【文本风格要求】：
1. 当 language = 'zh' 时：模仿短视频爆款文案、名家散文（如史铁生）、职场即兴演讲、或充满哲理的情感金句。语气要有感染力、画面感、适合大声朗读。包含开头招呼语（如"各位各位："）以及有感召力的结尾（如"且将岁月磨心性，静待清风赴远山。"）。
2. 当 language = 'en' 时：分为经典演讲金句或地道日常/职场高级口语汇报（Idioms & Business Expressions）。杜绝枯燥的课本英语，必须是具有"节奏感"、"连读多"、"适合练腔调"的现代英文短文。同样需要有自然有力的 Head 和 Tail。
【输出格式要求】：
你必须且只能返回一个标准的 JSON 数组，不要包含任何 Markdown 标记（如 \`\`\`json）。格式如下：
[
  {
    "title": "每日练嘴 · 第 X 天",
    "category": "分类名",
    "content": "正文内容，使用 \\n 来换行保持排版美观。"
  }
]`;

function getTodayDateString(timeZone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseRequestBody(body: unknown): GenerateRequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("请求体格式无效");
  }

  const { userId, language, count } = body as Partial<GenerateRequestBody>;

  if (!userId || typeof userId !== "string" || !isValidUuid(userId)) {
    throw new Error("userId 必须是有效的 UUID 字符串");
  }

  if (!language || !VALID_LANGUAGES.includes(language)) {
    throw new Error("language 必须是 'zh' 或 'en'");
  }

  if (count === undefined || !VALID_COUNTS.includes(count)) {
    throw new Error("count 必须是 1、3 或 5");
  }

  return { userId, language, count };
}

function parseDeepSeekExercises(rawContent: string): GeneratedExercisePayload[] {
  let cleaned = rawContent.trim();

  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("DeepSeek 返回的内容不是合法的 JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("DeepSeek 返回的 JSON 不是数组格式");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`DeepSeek 返回的第 ${index + 1} 项格式无效`);
    }

    const { title, category, content } = item as Record<string, unknown>;

    if (typeof title !== "string" || !title.trim()) {
      throw new Error(`DeepSeek 返回的第 ${index + 1} 项缺少有效 title`);
    }
    if (typeof category !== "string" || !category.trim()) {
      throw new Error(`DeepSeek 返回的第 ${index + 1} 项缺少有效 category`);
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`DeepSeek 返回的第 ${index + 1} 项缺少有效 content`);
    }

    return {
      title: title.trim(),
      category: category.trim(),
      content: content.trim(),
    };
  });
}

async function fetchTodayExercises(language: ExerciseLanguage, today: string) {
  return db
    .select()
    .from(exercises)
    .where(and(eq(exercises.date, today), eq(exercises.language, language)))
    .orderBy(asc(exercises.id));
}

async function fetchCompletedProgress(userId: string, exerciseIds: number[]) {
  if (exerciseIds.length === 0) {
    return {
      completedExerciseIds: [] as number[],
      progressByExerciseId: new Map<
        number,
        {
          status: "completed";
          completedAt: Date | null;
        }
      >(),
    };
  }

  const records = await db
    .select({
      exerciseId: userProgress.exerciseId,
      status: userProgress.status,
      completedAt: userProgress.completedAt,
    })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.status, "completed"),
        inArray(userProgress.exerciseId, exerciseIds),
      ),
    );

  const completedExerciseIds = buildCompletedExerciseIds(records);

  const progressByExerciseId = new Map(
    records.map((record) => [
      record.exerciseId,
      {
        status: "completed" as const,
        completedAt: record.completedAt,
      },
    ]),
  );

  return { completedExerciseIds, progressByExerciseId };
}

function buildGenerateSuccessResponse(
  params: Omit<GenerateExercisesSuccessResponse, "success" | "exercises"> & {
    exerciseRows: Awaited<ReturnType<typeof fetchTodayExercises>>;
    progressByExerciseId: Map<
      number,
      {
        status: "completed";
        completedAt: Date | null;
      }
    >;
  },
): GenerateExercisesSuccessResponse {
  const { exerciseRows, progressByExerciseId, ...rest } = params;

  return {
    success: true,
    ...rest,
    exercises: mergeExercisesWithProgress(exerciseRows, progressByExerciseId),
  };
}

async function generateExercisesWithDeepSeek(
  language: ExerciseLanguage,
  needToGenerate: number,
): Promise<GeneratedExercisePayload[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 环境变量未配置");
  }

  const response = await fetch(
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
          {
            role: "user",
            content: `请帮我生成 ${needToGenerate} 篇语言为 ${language} 的口才练习文本。`,
          },
        ],
        temperature: 0.8,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `DeepSeek API 请求失败 (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek API 返回内容为空");
  }

  return parseDeepSeekExercises(content);
}

export async function POST(request: NextRequest) {
  try {
    const body = parseRequestBody(await request.json());
    const { userId, language, count } = body;
    const today = getTodayDateString();

    await ensureTestUser(userId);

    const existingExercises = await fetchTodayExercises(language, today);

    if (existingExercises.length >= count) {
      const todayExercises = existingExercises.slice(0, count);
      const exerciseIds = todayExercises.map((item) => item.id);
      const { completedExerciseIds, progressByExerciseId } =
        await fetchCompletedProgress(userId, exerciseIds);

      return NextResponse.json(
        buildGenerateSuccessResponse({
          cached: true,
          generated: 0,
          userId,
          date: today,
          language,
          count,
          exerciseRows: todayExercises,
          progressByExerciseId,
          completedExerciseIds,
        }),
      );
    }

    const needToGenerate = count - existingExercises.length;
    const generatedPayload = await generateExercisesWithDeepSeek(
      language,
      needToGenerate,
    );

    if (generatedPayload.length === 0) {
      throw new Error("DeepSeek 未生成任何练习文本");
    }

    await db.insert(exercises).values(
      generatedPayload.map((item) => ({
        title: item.title,
        content: item.content,
        language,
        category: item.category,
        date: today,
      })),
    );

    const allTodayExercises = await fetchTodayExercises(language, today);
    const todayExercises = allTodayExercises.slice(0, count);
    const exerciseIds = todayExercises.map((item) => item.id);
    const { completedExerciseIds, progressByExerciseId } =
      await fetchCompletedProgress(userId, exerciseIds);

    return NextResponse.json(
      buildGenerateSuccessResponse({
        cached: false,
        generated: generatedPayload.length,
        userId,
        date: today,
        language,
        count,
        exerciseRows: todayExercises,
        progressByExerciseId,
        completedExerciseIds,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成练习文本时发生未知错误";

    const status =
      message.includes("请求体") ||
      message.includes("userId") ||
      message.includes("language") ||
      message.includes("count")
        ? 400
        : 500;

    console.error("[POST /api/exercises/generate]", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status },
    );
  }
}
