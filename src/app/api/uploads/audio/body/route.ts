import { NextRequest } from "next/server";

import { getCurrentUser } from "@/auth";
import { isR2Configured, saveAudioObject } from "@/lib/audio-store";
import { getRateLimitResponse } from "@/lib/api-rate-limit";
import { apiError, apiSuccess } from "@/lib/api-response";
import { MAX_AUDIO_BYTES } from "@/lib/upload-validation";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return apiError("UNAUTHORIZED", "请先登录", 401);

  const limited = await getRateLimitResponse(
    "upload",
    currentUser.id,
    "录音上传过于频繁，请稍后再试",
  );
  if (limited) return limited;

  // 仅本地兜底模式使用；配置了 R2 时应走签名直传
  if (isR2Configured()) {
    return apiError("R2_MODE_ACTIVE", "当前已配置 R2，请走签名直传", 400);
  }

  const objectKey = request.headers.get("x-audio-key");
  const contentType = request.headers.get("content-type") ?? "";
  if (!objectKey || !objectKey.startsWith(`audio/${currentUser.id}/`)) {
    return apiError("INVALID_AUDIO_KEY", "无权上传该录音", 403);
  }
  if (!contentType.startsWith("audio/")) {
    return apiError("INVALID_AUDIO_TYPE", "录音文件格式无效", 400);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
    return apiError("AUDIO_TOO_LARGE", "录音文件无效或超过 20MB", 400);
  }

  try {
    await saveAudioObject(objectKey, bytes, contentType);
    return apiSuccess({ objectKey, sizeBytes: bytes.byteLength }, "录音已保存");
  } catch (error) {
    console.error("[POST /api/uploads/audio/body]", error);
    return apiError("UPLOAD_FAILED", "录音保存失败，请重新上传", 500);
  }
}
