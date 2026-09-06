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
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}
