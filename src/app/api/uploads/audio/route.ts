import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { exercises, userProgress } from "@/db/schema";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getR2BucketName, getR2Client } from "@/lib/r2";
import {
  extensionFor,
  MAX_AUDIO_BYTES,
  UPLOAD_EXPIRES_IN_SECONDS,
  uploadCompleteSchema,
  uploadRequestSchema,
} from "@/lib/upload-validation";
import type { AudioUploadAuthorization } from "@/types/assessment";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "upload",
    currentUser.id,
    "录音上传请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "上传参数不正确",
      400,
    );
  }

  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.id, parsed.data.exerciseId))
    .limit(1);
  if (!exercise) return apiError("EXERCISE_NOT_FOUND", "练习不存在", 404);

  try {
    const objectKey = [
      "audio",
      currentUser.id,
      String(exercise.id),
      `${randomUUID()}.${extensionFor(parsed.data.contentType)}`,
    ].join("/");
    const command = new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: objectKey,
      ContentType: parsed.data.contentType,
      Metadata: {
        userId: currentUser.id,
        exerciseId: String(exercise.id),
        declaredSize: String(parsed.data.sizeBytes),
      },
    });
    const uploadUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: UPLOAD_EXPIRES_IN_SECONDS,
    });

    const data: AudioUploadAuthorization = {
      uploadUrl,
      objectKey,
      expiresInSeconds: UPLOAD_EXPIRES_IN_SECONDS,
    };
    return apiSuccess(data, "上传授权已创建");
  } catch (error) {
    console.error("[POST /api/uploads/audio]", error);
    return apiError("UPLOAD_AUTHORIZATION_FAILED", "暂时无法上传录音", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "upload",
    currentUser.id,
    "录音确认请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const parsed = uploadCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "录音确认参数不正确", 400);

  const { exerciseId, objectKey, durationMs } = parsed.data;
  if (!objectKey.startsWith(`audio/${currentUser.id}/${exerciseId}/`)) {
    return apiError("INVALID_AUDIO_KEY", "无权确认该录音", 403);
  }

  const [exercise] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);
  if (!exercise) return apiError("EXERCISE_NOT_FOUND", "练习不存在", 404);

  const [existing] = await db
    .select({ audioKey: userProgress.audioKey })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, currentUser.id),
        eq(userProgress.exerciseId, exerciseId),
      ),
    )
    .limit(1);

  try {
    const metadata = await getR2Client().send(
      new HeadObjectCommand({ Bucket: getR2BucketName(), Key: objectKey }),
    );
    if (!metadata.ContentLength || metadata.ContentLength > MAX_AUDIO_BYTES) {
      return apiError("AUDIO_TOO_LARGE", "录音文件无效或超过 20MB", 400);
    }
    if (!metadata.ContentType?.startsWith("audio/")) {
      return apiError("INVALID_AUDIO_TYPE", "录音文件格式无效", 400);
    }

    const audioUrl = `/api/progress/${exerciseId}/audio`;
    await db
      .insert(userProgress)
      .values({
        userId: currentUser.id,
        exerciseId,
        status: "pending",
        audioUrl,
        audioKey: objectKey,
        audioDurationMs: durationMs,
      })
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.exerciseId],
        set: {
          status: "pending",
          audioUrl,
          audioKey: objectKey,
          audioDurationMs: durationMs,
          transcript: null,
          score: null,
          pronunciationScore: null,
          fluencyScore: null,
          completenessScore: null,
          feedback: null,
          assessedAt: null,
          completedAt: null,
          // 全新录音 = 新的评分机会：重置失败计数与处理租约
          attempts: 0,
          lastError: null,
          startedAt: null,
        },
      });

    if (existing?.audioKey && existing.audioKey !== objectKey) {
      try {
        await getR2Client().send(
          new DeleteObjectCommand({
            Bucket: getR2BucketName(),
            Key: existing.audioKey,
          }),
        );
      } catch (cleanupError) {
        console.error(
          "[PATCH /api/uploads/audio] failed to clean up old recording",
          cleanupError,
        );
      }
    }

    return apiSuccess({ audioUrl, objectKey }, "录音上传已确认");
  } catch (error) {
    console.error("[PATCH /api/uploads/audio]", error);
    return apiError("UPLOAD_CONFIRMATION_FAILED", "录音确认失败，请重新上传", 500);
  }
}
