import "server-only";

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { exercises, userProgress, type UserProgress } from "@/db/schema";
import { loadAudioObject } from "@/lib/audio-store";
import {
  calculateCompletenessScore,
  calculateFluencyScore,
  calculateOverallScore,
  calculatePronunciationConfidence,
  type BaselineSpeechScores,
} from "@/lib/speech-score";
import { MAX_AUDIO_BYTES } from "@/lib/upload-validation";
import {
  MAX_ASSESSMENT_ATTEMPTS,
  PROCESSING_LEASE_MS,
  decideAssessmentStart,
  toAssessmentPayload,
  type AssessmentStartOutcome,
} from "@/lib/assessment-state";

export {
  MAX_ASSESSMENT_ATTEMPTS,
  PROCESSING_LEASE_MS,
  decideAssessmentStart,
  toAssessmentPayload,
  type AssessmentStartOutcome,
} from "@/lib/assessment-state";

const aiAssessmentSchema = z.object({
  pronunciationScore: z.number().min(0).max(100),
  fluencyScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  feedback: z.string().trim().min(1).max(1_000),
});

interface TranscriptionResult {
  text: string;
  logprobs?: Array<{ token?: string; logprob?: number }>;
}

// ---------------------------------------------------------------------------
// 数据库交互
// ---------------------------------------------------------------------------

export async function getAssessmentRow(
  userId: string,
  exerciseId: number,
): Promise<UserProgress | null> {
  const [row] = await db
    .select()
    .from(userProgress)
    .where(
      and(eq(userProgress.userId, userId), eq(userProgress.exerciseId, exerciseId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * 原子占用：仅当「待评分/失败且未超重试上限」或「超租约的 processing」时，
 * 把状态切到 processing 并 attempts+1。并发下只有一个请求能成功。
 */
export async function claimAssessment(
  userId: string,
  exerciseId: number,
  objectKey: string,
): Promise<UserProgress | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  const [claimed] = await db
    .update(userProgress)
    .set({
      status: "processing",
      attempts: sql`${userProgress.attempts} + 1`,
      startedAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.exerciseId, exerciseId),
        eq(userProgress.audioKey, objectKey),
        lt(userProgress.attempts, MAX_ASSESSMENT_ATTEMPTS),
        or(
          inArray(userProgress.status, ["pending", "failed"]),
          and(
            eq(userProgress.status, "processing"),
            lt(userProgress.startedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();

  return claimed ?? null;
}

export async function startAssessment(
  userId: string,
  exerciseId: number,
  objectKey?: string,
): Promise<AssessmentStartOutcome> {
  const row = await getAssessmentRow(userId, exerciseId);
  const decision = decideAssessmentStart(row, objectKey, Date.now());

  if (decision.kind !== "start") return decision;

  const claimed = await claimAssessment(userId, exerciseId, decision.objectKey);
  if (!claimed) {
    const fresh = await getAssessmentRow(userId, exerciseId);
    if (!fresh) return { kind: "missing" };
    return { kind: "in_progress", payload: toAssessmentPayload(fresh, exerciseId) };
  }

  return { kind: "start", objectKey: decision.objectKey, attempts: claimed.attempts };
}

export async function markAssessmentFailed(
  userId: string,
  exerciseId: number,
  objectKey: string,
  message: string,
): Promise<void> {
  await db
    .update(userProgress)
    .set({ status: "failed", lastError: message, startedAt: null })
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.exerciseId, exerciseId),
        eq(userProgress.status, "processing"),
        eq(userProgress.audioKey, objectKey),
      ),
    );
}

export async function getStaleProcessingJobs(
  limit: number,
): Promise<Array<{ userId: string; exerciseId: number; audioKey: string | null }>> {
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
  return db
    .select({
      userId: userProgress.userId,
      exerciseId: userProgress.exerciseId,
      audioKey: userProgress.audioKey,
    })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.status, "processing"),
        lt(userProgress.startedAt, staleBefore),
      ),
    )
    .limit(limit);
}

// ---------------------------------------------------------------------------
// 评分流水线（异步任务，永不抛错）
// ---------------------------------------------------------------------------

async function transcribeAudio(
  bytes: Uint8Array,
  contentType: string,
  language: "zh" | "en",
  referenceText: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("TRANSCRIPTION_NOT_CONFIGURED");

  // 默认 OpenAI；可指向任意 OpenAI 兼容的 audio/transcriptions 服务
  // 例如 Groq(https://api.groq.com/openai/v1) / 硅基流动(https://api.siliconflow.cn/v1)
  const baseUrl = (
    process.env.OPENAI_TRANSCRIPTION_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
  // OpenAI 专属增强参数（prompt 提示词、logprobs）。第三方服务若不支持可设 0 关闭。
  const sendOpenAiExtras = (process.env.OPENAI_TRANSCRIPTION_EXTRAS ?? "1") !== "0";

  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBuffer], { type: contentType }),
    `recording.${contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "m4a" : "webm"}`,
  );
  form.append("model", model);
  form.append("language", language);
  form.append("response_format", "json");
  if (sendOpenAiExtras) {
    form.append("include[]", "logprobs");
    form.append("prompt", referenceText.slice(0, 2_000));
  }

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error("TRANSCRIPTION_PROVIDER_ERROR");

  const payload = (await response.json()) as Partial<TranscriptionResult>;
  if (typeof payload.text !== "string" || !payload.text.trim()) {
    throw new Error("TRANSCRIPTION_INVALID");
  }
  return { text: payload.text.trim(), logprobs: payload.logprobs };
}

async function refineAssessmentWithDeepSeek(
  referenceText: string,
  transcript: string,
  durationMs: number,
  language: "zh" | "en",
  baseline: BaselineSpeechScores,
) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("ASSESSMENT_NOT_CONFIGURED");

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是严格、友善的口才教练。根据参考文本、转写文本、录音时长和基线分数给出评分。只返回 JSON：pronunciationScore、fluencyScore、completenessScore、feedback。分数为 0-100 整数；除非证据充分，各维度不要偏离基线超过 15 分。反馈必须具体、简短，不要声称听到了转写无法证明的音色细节。",
        },
        {
          role: "user",
          content: JSON.stringify({
            language,
            referenceText: referenceText.slice(0, 10_000),
            transcript: transcript.slice(0, 10_000),
            durationMs,
            baseline,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error("ASSESSMENT_PROVIDER_ERROR");

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("ASSESSMENT_INVALID");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  const parsed: unknown = JSON.parse(fenced);
  return aiAssessmentSchema.parse(parsed);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case "TRANSCRIPTION_NOT_CONFIGURED":
        return "语音转写未配置，请联系管理员";
      case "TRANSCRIPTION_PROVIDER_ERROR":
        return "语音转写服务暂时不可用，请重试";
      case "TRANSCRIPTION_INVALID":
        return "语音转写结果无效，请重试";
      case "AUDIO_NOT_FOUND":
        return "录音文件不存在，请重新录音";
      case "AUDIO_TOO_LARGE":
        return "录音文件无效或超过 20MB";
      case "INVALID_AUDIO_TYPE":
        return "录音文件格式无效";
      case "EXERCISE_NOT_FOUND":
        return "练习不存在";
      default:
        return error.message;
    }
  }
  return "语音评分失败，请重试";
}

/**
 * 执行完整评分流水线。所有错误都在内部捕获并写入 failed 状态，绝不向外抛错。
 * 写回结果时带乐观并发守卫：仅当行仍是 processing 且 audioKey 未变时才写入，
 * 避免「旧评分覆盖新录音」。
 */
export async function runAssessmentJob(
  userId: string,
  exerciseId: number,
  objectKey: string,
): Promise<void> {
  try {
    const [exercise] = await db
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .limit(1);
    if (!exercise) throw new Error("EXERCISE_NOT_FOUND");

    const progress = await getAssessmentRow(userId, exerciseId);
    const durationMs = progress?.audioDurationMs;
    if (!durationMs || durationMs <= 0) throw new Error("AUDIO_DURATION_MISSING");

    const stored = await loadAudioObject(objectKey);
    if (!stored.size || stored.size > MAX_AUDIO_BYTES) {
      throw new Error("AUDIO_TOO_LARGE");
    }
    if (!stored.contentType.startsWith("audio/")) throw new Error("INVALID_AUDIO_TYPE");

    const transcription = await transcribeAudio(
      stored.bytes,
      stored.contentType,
      exercise.language,
      exercise.content,
    );

    const baseline: BaselineSpeechScores = {
      pronunciation: calculatePronunciationConfidence(transcription.logprobs),
      fluency: calculateFluencyScore(exercise.content, durationMs, exercise.language),
      completeness: calculateCompletenessScore(
        exercise.content,
        transcription.text,
        exercise.language,
      ),
    };

    let refined = {
      pronunciationScore: baseline.pronunciation,
      fluencyScore: baseline.fluency,
      completenessScore: baseline.completeness,
      feedback: "已完成转写与基础评分。保持清晰节奏，并重点复练遗漏内容。",
    };
    try {
      refined = await refineAssessmentWithDeepSeek(
        exercise.content,
        transcription.text,
        durationMs,
        exercise.language,
        baseline,
      );
    } catch (refinementError) {
      console.error("[speech assessment refinement]", refinementError);
    }

    const normalized = {
      pronunciationScore: Math.round(refined.pronunciationScore),
      fluencyScore: Math.round(refined.fluencyScore),
      completenessScore: Math.round(refined.completenessScore),
    };
    const overallScore = calculateOverallScore({
      pronunciation: normalized.pronunciationScore,
      fluency: normalized.fluencyScore,
      completeness: normalized.completenessScore,
    });
    const completedAt = new Date();
    const audioUrl = `/api/progress/${exerciseId}/audio`;

    const updated = await db
      .update(userProgress)
      .set({
        status: "completed",
        audioUrl,
        audioDurationMs: durationMs,
        transcript: transcription.text,
        score: overallScore,
        ...normalized,
        feedback: refined.feedback,
        assessedAt: completedAt,
        completedAt,
        startedAt: null,
        lastError: null,
      })
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.exerciseId, exerciseId),
          eq(userProgress.status, "processing"),
          eq(userProgress.audioKey, objectKey),
        ),
      )
      .returning({ id: userProgress.id });

    if (!updated?.length) {
      console.warn("[assessment] 结果已丢弃：任务执行期间录音被新上传覆盖", {
        userId,
        exerciseId,
      });
    }
  } catch (error) {
    console.error("[assessment job]", error);
    await markAssessmentFailed(userId, exerciseId, objectKey, toErrorMessage(error));
  }
}

