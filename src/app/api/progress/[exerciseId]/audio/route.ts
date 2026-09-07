import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/auth";
import { db } from "@/db";
import { userProgress } from "@/db/schema";
import { isR2Configured, loadAudioObject } from "@/lib/audio-store";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError } from "@/lib/api-response";
import { getR2BucketName, getR2Client } from "@/lib/r2";

interface RouteContext {
  params: Promise<{ exerciseId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "audio",
    currentUser.id,
    "录音播放请求过于频繁，请稍后再试",
  );
  if (limited) return limited;

  const exerciseId = Number((await context.params).exerciseId);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return apiError("VALIDATION_ERROR", "练习编号无效", 400);
  }

  const [progress] = await db
    .select({ audioKey: userProgress.audioKey })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, currentUser.id),
        eq(userProgress.exerciseId, exerciseId),
      ),
    )
    .limit(1);
  if (!progress?.audioKey) return apiError("AUDIO_NOT_FOUND", "录音不存在", 404);

  try {
    if (isR2Configured()) {
      const downloadUrl = await getSignedUrl(
        getR2Client(),
        new GetObjectCommand({
          Bucket: getR2BucketName(),
          Key: progress.audioKey,
          ResponseContentDisposition: "inline",
        }),
        { expiresIn: 300 },
      );
      return NextResponse.redirect(downloadUrl, 307);
    }

    // 本地兜底模式：直接流式返回音频文件
    const stored = await loadAudioObject(progress.audioKey);
    return new NextResponse(Buffer.from(stored.bytes), {
      headers: {
        "Content-Type": stored.contentType,
        "Content-Length": String(stored.size),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[GET /api/progress/:exerciseId/audio]", error);
    return apiError("AUDIO_PLAYBACK_FAILED", "录音暂时无法播放", 500);
  }
}
