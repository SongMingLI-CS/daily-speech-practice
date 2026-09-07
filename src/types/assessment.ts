import type { ProgressStatus } from "@/types/exercise";

export interface SpeechAssessment {
  overallScore: number;
  pronunciationScore: number;
  fluencyScore: number;
  completenessScore: number;
  transcript: string;
  feedback: string;
  audioUrl: string;
  durationMs: number;
  assessedAt: string;
}

export interface AudioUploadAuthorization {
  /** r2 = 直传签名 URL；local = 本地兜底（POST /api/uploads/audio/body） */
  mode: "r2" | "local";
  uploadUrl: string | null;
  objectKey: string;
  expiresInSeconds: number;
}

export interface AssessmentStatusPayload {
  status: ProgressStatus;
  assessment: SpeechAssessment | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
}
