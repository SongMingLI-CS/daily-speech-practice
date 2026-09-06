import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getR2BucketName, getR2Client } from "@/lib/r2";
import {
  calculateCompletenessScore,
  calculateFluencyScore,
  calculateOverallScore,
  calculatePronunciationConfidence,
  type BaselineSpeechScores,
} from "@/lib/speech-score";
import type { SpeechAssessment } from "@/types/assessment";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_DURATION_MS = 180_000;

const requestSchema = z.object({
  exerciseId: z.number().int().positive(),
  objectKey: z.string().min(1).max(500),
  durationMs: z.number().int().min(1_000).max(MAX_DURATION_MS),
});

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

function expectedObjectPrefix(userId: string, exerciseId: number): string {
  return `audio/${userId}/${exerciseId}/`;
}

async function transcribeAudio(
  bytes: Uint8Array,
  contentType: string,
  language: "zh" | "en",
  referenceText: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("TRANSCRIPTION_NOT_CONFIGURED");

  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType }), `recording.${contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "m4a" : "webm"}`);
  form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", language);
  form.append("response_format", "json");
  form.append("include[]", "logprobs");
  form.append("prompt", referenceText.slice(0, 2_000));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
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
            "你是严格、友善的口语教练。根据参考文本、转写文本、录音时长和基线分数给出评分。只返回 JSON：pronunciationScore、fluencyScore、completenessScore、feedback。分数为 0-100 整数；除非证据充分，各维度不要偏离基线超过 15 分。反馈必须具体、简短，不要声称听到了转写无法证明的音色细节。",
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

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "assessment",
    currentUser.id,
    "评分请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "评分参数不正确", 400);
  }

  const { exerciseId, objectKey, durationMs } = parsed.data;
  if (!objectKey.startsWith(expectedObjectPrefix(currentUser.id, exerciseId))) {
    return apiError("INVALID_AUDIO_KEY", "无权访问该录音", 403);
  }

  const [exercise] = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);
  if (!exercise) return apiError("EXERCISE_NOT_FOUND", "练习不存在", 404);

  try {
    const bucket = getR2BucketName();
    const r2 = getR2Client();
    const metadata = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!metadata.ContentLength || metadata.ContentLength > MAX_AUDIO_BYTES) {
      return apiError("AUDIO_TOO_LARGE", "录音文件无效或超过 20MB", 400);
    }
    const contentType = metadata.ContentType ?? "audio/webm";
    if (!contentType.startsWith("audio/")) {
      return apiError("INVALID_AUDIO_TYPE", "录音文件格式无效", 400);
    }

    const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!object.Body) throw new Error("AUDIO_NOT_FOUND");
    const bytes = await object.Body.transformToByteArray();
    const transcription = await transcribeAudio(
      bytes,
      contentType,
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

    await db
      .insert(userProgress)
      .values({
        userId: currentUser.id,
        exerciseId,
        status: "completed",
        audioUrl,
        audioKey: objectKey,
        audioDurationMs: durationMs,
        transcript: transcription.text,
        score: overallScore,
        ...normalized,
        feedback: refined.feedback,
        assessedAt: completedAt,
        completedAt,
      })
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.exerciseId],
        set: {
          status: "completed",
          audioUrl,
          audioKey: objectKey,
          audioDurationMs: durationMs,
          transcript: transcription.text,
          score: overallScore,
          ...normalized,
          feedback: refined.feedback,
          assessedAt: completedAt,
          completedAt,
        },
      });

    const assessment: SpeechAssessment = {
      overallScore,
      ...normalized,
      transcript: transcription.text,
      feedback: refined.feedback,
      audioUrl,
      durationMs,
      assessedAt: completedAt.toISOString(),
    };
    return apiSuccess(assessment, "语音评分完成");
  } catch (error) {
    console.error("[POST /api/assessments]", error);
    return apiError("ASSESSMENT_FAILED", "语音评分失败，请稍后重试", 500);
  }
}
