"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { TEST_USER_ID } from "@/lib/test-user";
import {
  type CompleteExercise,
  type ExerciseCount,
  type ExerciseLanguage,
  isGenerateExercisesSuccess,
  parseGenerateExercisesResponse,
} from "@/types/exercise";

function revokeBlobUrls(urls: Record<number, string>) {
  Object.values(urls).forEach((url) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  });
}

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
  isRecording: boolean;
  isOtherRecording: boolean;
  isSubmitting: boolean;
  isCheckedIn: boolean;
  audioUrl: string | null;
  onStartRecording: (id: number) => void;
  onStopRecording: () => void;
  onCheckIn: (id: number) => void;
}

function ExerciseCard({
  exercise,
  language,
  isRecording,
  isOtherRecording,
  isSubmitting,
  isCheckedIn,
  audioUrl,
  onStartRecording,
  onStopRecording,
  onCheckIn,
}: ExerciseCardProps) {
  const canCheckIn =
    Boolean(audioUrl) && !isRecording && !isSubmitting && !isCheckedIn;

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

      {audioUrl && (
        <div className="mb-5 rounded-xl border border-white/10 bg-black/20 p-3">
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={isOtherRecording}
          onClick={() => (isRecording ? onStopRecording() : onStartRecording(exercise.id))}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            isRecording
              ? "bg-red-600/90 text-white shadow-lg shadow-red-900/30 hover:bg-red-600"
              : "border border-white/15 bg-white/5 text-white/90 hover:border-amber-200/30 hover:bg-white/10"
          }`}
        >
          {isRecording ? "停止录音（录音中...）" : "开始录音"}
        </button>

        <button
          type="button"
          disabled={!canCheckIn}
          onClick={() => onCheckIn(exercise.id)}
          className="flex-1 rounded-xl bg-amber-200/90 px-4 py-3 text-sm font-medium tracking-wide text-[#1A3020] transition-all hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          {isSubmitting
            ? "上传中..."
            : isCheckedIn
              ? "已完成打卡"
              : "提交打卡"}
        </button>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [language, setLanguage] = useState<ExerciseLanguage>("zh");
  const [count, setCount] = useState<ExerciseCount>(3);
  const [exercises, setExercises] = useState<CompleteExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [audioBlobs, setAudioBlobs] = useState<Record<number, Blob>>({});
  const [checkedInIds, setCheckedInIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingExerciseIdRef = useRef<number | null>(null);

  const cleanupStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
      cleanupStream();
      revokeBlobUrls(audioUrls);
    };
  }, [audioUrls, cleanupStream, stopRecording]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exercises/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          language,
          count,
        }),
      });

      const data = parseGenerateExercisesResponse(await response.json());

      if (!response.ok || !isGenerateExercisesSuccess(data)) {
        const message = isGenerateExercisesSuccess(data)
          ? "生成练习失败，请稍后重试"
          : data.error;
        throw new Error(message);
      }

      setExercises(data.exercises);

      setAudioUrls((prev) => {
        revokeBlobUrls(prev);
        return data.completedAudioUrls ?? {};
      });
      setAudioBlobs({});
      setCheckedInIds(new Set(data.completedExerciseIds ?? []));
      setRecordingId(null);
      setSubmittingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async (exerciseId: number) => {
    if (recordingId !== null) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingExerciseIdRef.current = exerciseId;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);

        setAudioUrls((prev) => {
          const oldUrl = prev[exerciseId];
          if (oldUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(oldUrl);
          }
          return { ...prev, [exerciseId]: url };
        });

        setAudioBlobs((prev) => ({ ...prev, [exerciseId]: blob }));

        cleanupStream();
        mediaRecorderRef.current = null;
        recordingExerciseIdRef.current = null;
        setRecordingId(null);
      };

      recorder.start();
      setRecordingId(exerciseId);
      setError(null);
    } catch {
      cleanupStream();
      setRecordingId(null);
      setError("无法访问麦克风，请检查浏览器权限设置");
    }
  };

  const handleCheckIn = async (exerciseId: number) => {
    const audioBlob = audioBlobs[exerciseId];
    if (!audioBlob || submittingId !== null || checkedInIds.has(exerciseId)) {
      return;
    }

    setSubmittingId(exerciseId);
    setError(null);

    try {
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          filename: `recording-${exerciseId}.webm`,
          contentType: audioBlob.type || "audio/webm",
        }),
      });

      const uploadData = (await uploadResponse.json()) as {
        success?: boolean;
        presignedUrl?: string;
        publicUrl?: string;
        error?: string;
      };

      if (!uploadResponse.ok || !uploadData.presignedUrl || !uploadData.publicUrl) {
        throw new Error(uploadData.error ?? "获取上传授权失败");
      }

      const publicUrl = uploadData.publicUrl;

      const putResponse = await fetch(uploadData.presignedUrl, {
        method: "PUT",
        body: audioBlob,
        headers: {
          "Content-Type": audioBlob.type || "audio/webm",
        },
      });

      if (!putResponse.ok) {
        throw new Error(`音频上传失败 (${putResponse.status})`);
      }

      const checkinResponse = await fetch("/api/progress/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_ID,
          exerciseId,
          audioUrl: publicUrl,
        }),
      });

      const checkinData = (await checkinResponse.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!checkinResponse.ok || !checkinData.success) {
        throw new Error(checkinData.error ?? "打卡记录保存失败");
      }

      setCheckedInIds((prev) => new Set(prev).add(exerciseId));
      setAudioUrls((prev) => ({
        ...prev,
        [exerciseId]: publicUrl,
      }));
      setAudioBlobs((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
      window.alert("打卡成功！");
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

  return (
    <div className={`min-h-full ${pageBg} transition-colors duration-500`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-amber-300/5 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-emerald-300/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-10 space-y-6">
          <div className="text-center">
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
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex self-start rounded-xl border border-white/10 bg-white/5 p-1">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLanguage(option.value)}
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
                  isRecording={recordingId === exercise.id}
                  isOtherRecording={recordingId !== null && recordingId !== exercise.id}
                  isSubmitting={submittingId === exercise.id}
                  isCheckedIn={checkedInIds.has(exercise.id)}
                  audioUrl={audioUrls[exercise.id] ?? null}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
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
