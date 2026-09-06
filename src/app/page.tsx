"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { useAudioRecorder, type AudioRecording } from "@/hooks/use-audio-recorder";
import type { ApiResponse } from "@/lib/api-response";
import type { AudioUploadAuthorization, SpeechAssessment } from "@/types/assessment";
import {
  type CompleteExercise,
  type ExerciseCount,
  type ExerciseLanguage,
  parseGenerateExercisesResponse,
} from "@/types/exercise";

const LANGUAGE_OPTIONS: { value: ExerciseLanguage; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const COUNT_OPTIONS: { value: ExerciseCount; label: string }[] = [
  { value: 1, label: "1 篇" },
  { value: 3, label: "3 篇" },
  { value: 5, label: "5 篇" },
];

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-300" />
      <p className="text-sm tracking-widest text-amber-100/60">正在生成今日挑战...</p>
    </div>
  );
}

function EmptyState({ language }: { language: ExerciseLanguage }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <span className="text-2xl text-amber-200/80">✦</span>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium text-white/90">
          {language === "zh" ? "今日挑战尚未开启" : "Today's challenge awaits"}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-white/50">
          {language === "zh"
            ? "选择语言与篇数，点击「生成今日挑战」，开启你的口才修炼之旅。"
            : "Pick your language and count, then tap Generate to begin your daily practice."}
        </p>
      </div>
    </div>
  );
}

interface ExerciseCardProps {
  exercise: CompleteExercise;
  language: ExerciseLanguage;
  isSubmitting: boolean;
  isCheckedIn: boolean;
  isOtherRecording: boolean;
  assessment?: SpeechAssessment;
  onRecordingChange: (exerciseId: number, active: boolean) => void;
  onCheckIn: (id: number, recording: AudioRecording) => Promise<void>;
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
  assessment,
  onRecordingChange,
  onCheckIn,
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
  const audioUrl = assessment?.audioUrl ?? exercise.progress?.audioUrl ?? recorder.recording?.url;
  const canSubmit = Boolean(recorder.recording) && !isSubmitting;

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
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-amber-200/20 hover:bg-white/[0.06] sm:p-8">
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
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>
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
          <span>{formatDuration(recorder.elapsedMs)} / 03:00</span>
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
              {isSubmitting ? "上传并评分中..." : "重试上传与评分"}
            </button>
          )}
        </div>
      </div>

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
    </article>
  );
}

function parseApiResponse<T>(payload: unknown): ApiResponse<T> {
  if (!payload || typeof payload !== "object") {
    return { code: "INVALID_RESPONSE", data: null, message: "服务器响应格式无效" };
  }
  const candidate = payload as Partial<ApiResponse<T>>;
  if (typeof candidate.code !== "string" || typeof candidate.message !== "string") {
    return { code: "INVALID_RESPONSE", data: null, message: "服务器响应格式无效" };
  }
  return candidate as ApiResponse<T>;
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [language, setLanguage] = useState<ExerciseLanguage>("zh");
  const [count, setCount] = useState<ExerciseCount>(3);
  const [exercises, setExercises] = useState<CompleteExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<number | null>(null);
  const [assessments, setAssessments] = useState<Record<number, SpeechAssessment>>({});
  const [checkedInIds, setCheckedInIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  const handleLanguageChange = (nextLanguage: ExerciseLanguage) => {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    setExercises([]);
    setCheckedInIds(new Set());
    setSubmittingId(null);
    setActiveRecordingId(null);
    setAssessments({});
    setError(null);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exercises/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          count,
        }),
      });

      const data = parseGenerateExercisesResponse(await response.json());

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || data.code !== "OK" || !data.data) {
        throw new Error(data.message);
      }

      setExercises(data.data.exercises);
      setCheckedInIds(new Set(data.data.completedExerciseIds));
      setSubmittingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (exerciseId: number, recording: AudioRecording) => {
    if (submittingId !== null || checkedInIds.has(exerciseId)) {
      return;
    }

    setSubmittingId(exerciseId);
    setError(null);

    try {
      const authorizationResponse = await fetch("/api/uploads/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          contentType: recording.contentType,
          sizeBytes: recording.blob.size,
        }),
      });
      const authorization = parseApiResponse<AudioUploadAuthorization>(
        await authorizationResponse.json(),
      );
      if (!authorizationResponse.ok || authorization.code !== "OK" || !authorization.data) {
        throw new Error(authorization.message);
      }

      const uploadResponse = await fetch(authorization.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": recording.contentType },
        body: recording.blob,
      });
      if (!uploadResponse.ok) throw new Error("录音上传失败，请检查 R2 CORS 配置");

      const confirmationResponse = await fetch("/api/uploads/audio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          objectKey: authorization.data.objectKey,
          durationMs: recording.durationMs,
        }),
      });
      const confirmation = parseApiResponse<{ audioUrl: string; objectKey: string }>(
        await confirmationResponse.json(),
      );
      if (!confirmationResponse.ok || confirmation.code !== "OK") {
        throw new Error(confirmation.message);
      }

      const assessmentResponse = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseId,
          objectKey: authorization.data.objectKey,
          durationMs: recording.durationMs,
        }),
      });
      const assessment = parseApiResponse<SpeechAssessment>(
        await assessmentResponse.json(),
      );
      if (!assessmentResponse.ok || assessment.code !== "OK" || !assessment.data) {
        throw new Error(assessment.message);
      }

      setAssessments((previous) => ({ ...previous, [exerciseId]: assessment.data }));
      setCheckedInIds((prev) => new Set(prev).add(exerciseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "打卡提交失败，请稍后重试");
    } finally {
      setSubmittingId(null);
    }
  };

  const pageBg =
    language === "zh"
      ? "bg-gradient-to-br from-[#1A3020] via-[#152820] to-[#0f1f18]"
      : "bg-gradient-to-br from-[#122B46] via-[#0f2238] to-[#0a1628]";

  if (status === "loading" || status === "unauthenticated") {
    return <div className="min-h-screen bg-[#111]" />;
  }

  return (
    <div className={`min-h-full ${pageBg} transition-colors duration-500`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-amber-300/5 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-emerald-300/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-10 space-y-6">
          <div className="relative text-center">
            <p className="mb-2 text-xs tracking-[0.4em] text-amber-200/50 uppercase">
              Daily Speech Practice
            </p>
            <h1
              className={`text-3xl font-bold text-amber-50 sm:text-4xl ${
                language === "zh" ? "font-[family-name:var(--font-noto-serif-sc)]" : ""
              }`}
            >
              {language === "zh" ? "每日口才打卡" : "Daily Eloquence Check-in"}
            </h1>
            <div className="mt-4 flex items-center justify-center gap-3 text-xs text-white/45">
              <span>{session?.user?.name ?? session?.user?.email}</span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="underline underline-offset-4 hover:text-white/80"
              >
                退出登录
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex self-start rounded-xl border border-white/10 bg-white/5 p-1">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleLanguageChange(option.value)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                        language === option.value
                          ? "bg-amber-200/90 text-[#1A3020] shadow-sm"
                          : "text-white/60 hover:text-white/90"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-white/60">
                  <span className="shrink-0">每日篇数</span>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value) as ExerciseCount)}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/90 outline-none transition-colors focus:border-amber-200/40"
                  >
                    {COUNT_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        className="bg-[#1A3020] text-white"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-amber-200/90 to-amber-100/80 py-3.5 text-sm font-semibold tracking-wide text-[#1A3020] shadow-lg shadow-amber-900/20 transition-all hover:from-amber-100 hover:to-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "生成中..." : "生成今日挑战"}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </header>

        <main>
          {loading ? (
            <LoadingSpinner />
          ) : exercises.length === 0 ? (
            <EmptyState language={language} />
          ) : (
            <div className="flex flex-col gap-6">
              {exercises.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  language={language}
                  isSubmitting={submittingId === exercise.id}
                  isCheckedIn={checkedInIds.has(exercise.id)}
                  isOtherRecording={
                    activeRecordingId !== null && activeRecordingId !== exercise.id
                  }
                  assessment={assessments[exercise.id]}
                  onRecordingChange={(exerciseId, active) =>
                    setActiveRecordingId(active ? exerciseId : null)
                  }
                  onCheckIn={handleCheckIn}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
