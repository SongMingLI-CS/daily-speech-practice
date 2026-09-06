import { z } from "zod";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const UPLOAD_EXPIRES_IN_SECONDS = 300;
export const MAX_DURATION_MS = 180_000;

export const ALLOWED_CONTENT_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;

export const uploadRequestSchema = z.object({
  exerciseId: z.number().int().positive(),
  contentType: z.string().refine(
    (value) => ALLOWED_CONTENT_TYPES.some((type) => value.startsWith(type)),
    "不支持的录音格式",
  ),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES, "录音文件不能超过 20MB"),
});

export const uploadCompleteSchema = z.object({
  exerciseId: z.number().int().positive(),
  objectKey: z.string().min(1).max(500),
  durationMs: z.number().int().min(1_000).max(MAX_DURATION_MS),
});

export function extensionFor(contentType: string): string {
  if (contentType.startsWith("audio/ogg")) return "ogg";
  if (contentType.startsWith("audio/mp4")) return "m4a";
  return "webm";
}