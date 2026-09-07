"use client";

import { useEffect, useRef } from "react";

import { useAudioRecorder, type AudioRecording } from "@/hooks/use-audio-recorder";
import type { SpeechAssessment } from "@/types/assessment";
import type { CompleteExercise, ExerciseLanguage } from "@/types/exercise";

import { SentenceDrill } from "./sentence-drill";

interface AssessmentFailure {
  message: string;
  exhausted: boolean;
}

interface ExerciseCardProps {
  exercise: CompleteExercise;
  language: ExerciseLanguage;
  isSubmitting: boolean;
  isCheckedIn: boolean;
  isOtherRecording: boolean;
  isScoring: boolean;
  failure: AssessmentFailure | null;
  assessment?: SpeechAssessment;
  onRecordingChange: (exerciseId: number, active: boolean) => void;
  onCheckIn: (id: number, recording: AudioRecording) => Promise<void>;
  onRetry: (exerciseId: number) => void;
  onRehearse: (exerciseId: number) => void;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1_000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function ExerciseCard({
  exercise,
  language,
  isSubmitting,
  isCheckedIn,
  isOtherRecording,
  isScoring,
  failure,
  assessment,
  onRecordingChange,
  onCheckIn,
  onRetry,
  onRehearse,
}: ExerciseCardProps) {
  const recorder = useAudioRecorder();
  const submittedRecordingUrlRef = useRef<string | null>(null);
  const visibleScore = assessment?.overallScore ?? exercise.progress?.score;
  const pronunciationScore =
    assessment?.pronunciationScore ?? exercise.progress?.pronunciationScore;
  const fluencyScore = assessment?.fluencyScore ?? exercise.progress?.fluencyScore;
  const completenessScore =
    assessment?.completenessScore ?? exercise.progress?.completenessScore;
  const feedback = assessment?.feedback ?? exercise.progress?.feedback;
  const transcript = assessment?.transcript ?? exercise.progress?.transcript ?? "";
  const audioUrl = assessment?.audioUrl ?? exercise.progress?.audioUrl ?? recorder.recording?.url;
  const canSubmit = Boolean(recorder.recording) && !isSubmitting && !isScoring;

  useEffect(() => {
    if (recorder.status === "recorded" || recorder.status === "error") {
      onRecordingChange(exercise.id, false);
    }
  }, [exercise.id, onRecordingChange, recorder.status]);

  useEffect(() => {
    const currentRecording = recorder.recording;
    if (
      recorder.status !== "recorded" ||
      !currentRecording ||
      isCheckedIn ||
      submittedRecordingUrlRef.current === currentRecording.url
    ) {
      return;
    }
    submittedRecordingUrlRef.current = currentRecording.url;
    void onCheckIn(exercise.id, currentRecording);
  }, [exercise.id, isCheckedIn, onCheckIn, recorder.recording, recorder.status]);

  const startRecording = async () => {
    onRecordingChange(exercise.id, true);
    const started = await recorder.start();
    if (!started) onRecordingChange(exercise.id, false);
  };

  const stopRecording = () => {
    recorder.stop();
    onRecordingChange(exercise.id, false);
  };

  return (
    <article className="group animate-rise-in relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-amber-200/20 hover:bg-white/[0.06] sm:p-8">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-300/5 blur-2xl" />

      <header className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex rounded-full border border-amber-200/20 bg-amber-200/5 px-3 py-1 text-xs tracking-widest text-amber-200/80">
            {exercise.category}
          </span>
          {isCheckedIn && (
            <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs tracking-widest text-emerald-200">
              已打卡
            </span>
          )}
        </div>
        <h2
          className={`text-xl font-semibold leading-snug text-amber-50 sm:text-2xl ${
            language === "zh" ? "font-[family-name:var(--font-noto-serif-sc)]" : ""
          }`}
        >
          {exercise.title}
        </h2>
      </header>

      <div
        className={`mb-8 whitespace-pre-line text-base leading-8 text-white/85 sm:text-lg sm:leading-9 ${
          language === "zh" ? "font-[family-name:var(--font-noto-serif-sc)]" : ""
        }`}
      >
        {exercise.content}
      </div>

      <p className="mb-6 text-center text-xs tracking-[0.3em] text-amber-200/40">
        — 欢迎一起打卡学习 —
      </p>

      <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-white/50">
          <span className="flex min-w-0 items-center gap-2">
            {recorder.status === "recording" && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
              </span>
            )}
            <span className="truncate">
              {recorder.status === "recording"
                ? "正在录音"
                : recorder.status === "paused"
                  ? "录音已暂停"
                  : recorder.status === "requesting-permission"
                    ? "等待麦克风权限"
                    : recorder.recording
                      ? "录音已完成"
                      : "最长 03:00 · 已启用浏览器降噪"}
            </span>
          </span>
          <span className="shrink-0">{formatDuration(recorder.elapsedMs)} / 03:00</span>
        </div>

        {(recorder.status === "recording" || recorder.status === "paused") && (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-200 transition-[width] duration-100"
              style={{ width: `${Math.max(3, recorder.level * 100)}%` }}
            />
          </div>
        )}

        {audioUrl && <audio controls className="w-full" src={audioUrl} />}
        {recorder.error && <p className="text-sm text-red-200">{recorder.error}</p>}

        <div className="grid grid-cols-2 gap-3 sm:flex">
          {(recorder.status === "idle" || recorder.status === "error") && (
            <button
              type="button"
              disabled={isOtherRecording || isSubmitting || isCheckedIn}
              onClick={startRecording}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/10 disabled:opacity-40"
            >
              开始录音
            </button>
          )}
          {recorder.status === "recording" && (
            <>
              <button type="button" onClick={recorder.pause} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
                暂停
              </button>
              <button type="button" onClick={stopRecording} className="rounded-lg border border-red-300/30 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10">
                完成录音
              </button>
            </>
          )}
          {recorder.status === "paused" && (
            <>
              <button type="button" onClick={recorder.resume} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
                继续
              </button>
              <button type="button" onClick={stopRecording} className="rounded-lg border border-red-300/30 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10">
                完成录音
              </button>
            </>
          )}
          {recorder.status === "recorded" && (
            <button type="button" disabled={isSubmitting} onClick={recorder.reset} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40">
              重新录音
            </button>
          )}
          {recorder.recording && !isCheckedIn && (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onCheckIn(exercise.id, recorder.recording!)}
              className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-medium text-[#1A3020] hover:bg-amber-100 disabled:opacity-40"
            >
              {isSubmitting ? "上传并评分中..." : isScoring ? "评分中..." : "重试上传与评分"}
            </button>
          )}
        </div>
      </div>

      {failure && (
        <div className="mt-4 rounded-xl border border-red-300/20 bg-red-400/5 p-4">
          <p className="text-sm leading-6 text-red-100">{failure.message}</p>
          {!failure.exhausted && (
            <button
              type="button"
              onClick={() => onRetry(exercise.id)}
              disabled={isSubmitting || isScoring}
              className="mt-3 rounded-lg border border-red-300/40 px-4 py-2 text-sm text-red-100 hover:bg-red-400/10 disabled:opacity-40"
            >
              重试评分
            </button>
          )}
        </div>
      )}

      {visibleScore !== null && visibleScore !== undefined && (
        <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-4">
          <div className="mb-3 flex items-end justify-between">
            <span className="text-sm text-emerald-100/70">综合评分</span>
            <strong className="text-3xl text-emerald-100">{visibleScore}</strong>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/60">
            <span>发音 {pronunciationScore ?? "—"}</span>
            <span>流利 {fluencyScore ?? "—"}</span>
            <span>完整 {completenessScore ?? "—"}</span>
          </div>
          {feedback && <p className="mt-3 border-t border-white/10 pt-3 text-sm leading-6 text-white/70">{feedback}</p>}
        </div>
      )}

      {transcript && (
        <SentenceDrill
          content={exercise.content}
          transcript={transcript}
          language={language}
          onRehearse={() => {
            onRehearse(exercise.id);
            recorder.reset();
          }}
        />
      )}
    </article>
  );
}

export { ExerciseCard };
export type { AssessmentFailure, ExerciseCardProps };
