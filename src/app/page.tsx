"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import type { AudioRecording } from "@/hooks/use-audio-recorder";
import { aggregateScoresByDate } from "@/lib/trend";
import type { StreakStats } from "@/lib/streak";
import type { ApiResponse } from "@/lib/api-response";
import type {
  AssessmentStatusPayload,
  AudioUploadAuthorization,
  SpeechAssessment,
} from "@/types/assessment";
import {
  type CompleteExercise,
  type ExerciseCount,
  type ExerciseLanguage,
  parseGenerateExercisesResponse,
} from "@/types/exercise";
import { ExerciseCard, type AssessmentFailure } from "@/components/exercise-card";
import { StreakSummary } from "@/components/streak-summary";
import { TrendChart } from "@/components/trend-chart";

const LANGUAGE_OPTIONS: { value: ExerciseLanguage; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const COUNT_OPTIONS: { value: ExerciseCount; label: string }[] = [
  { value: 1, label: "1 篇" },
  { value: 3, label: "3 篇" },
  { value: 5, label: "5 篇" },
];

/** /api/settings 返回的用户偏好（timeZone 仅原样回传，暂不提供修改入口） */
interface UserSettingsData {
  defaultLanguage: ExerciseLanguage;
  dailyCount: ExerciseCount;
  timeZone: string;
}

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
  const [scoringIds, setScoringIds] = useState<Set<number>>(new Set());
  const [scoreFailures, setScoreFailures] = useState<Record<number, AssessmentFailure>>({});
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ date: string; score: number }>>([]);
  const [streakStats, setStreakStats] = useState<StreakStats | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const activePollIdsRef = useRef<Set<number>>(new Set());
  /** 用户是否已手动改过语言/篇数（用于避免慢速的设置请求覆盖用户刚做的选择） */
  const userAdjustedSettingsRef = useRef(false);
  const settingsRef = useRef<UserSettingsData | null>(null);

  const persistSettings = useCallback(
    async (defaultLanguage: ExerciseLanguage, dailyCount: ExerciseCount) => {
      const timeZone = settingsRef.current?.timeZone ?? "Asia/Shanghai";
      settingsRef.current = { defaultLanguage, dailyCount, timeZone };
      setSettingsNotice(null);
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultLanguage, dailyCount, timeZone }),
        });
        const payload = parseApiResponse<unknown>(await response.json());
        if (!response.ok || payload.code !== "OK") {
          throw new Error(payload.message || "保存失败");
        }
      } catch (err) {
        console.warn("[settings] 保存失败", err);
        setSettingsNotice(
          err instanceof Error ? `设置保存失败：${err.message}` : "设置保存失败，请稍后重试",
        );
      }
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings");
      const payload = parseApiResponse<UserSettingsData>(await response.json());
      if (response.ok && payload.code === "OK" && payload.data) {
        const { defaultLanguage, dailyCount, timeZone } = payload.data;
        settingsRef.current = { defaultLanguage, dailyCount, timeZone };
        if (!userAdjustedSettingsRef.current) {
          setLanguage(defaultLanguage);
          setCount(dailyCount);
        }
      }
    } catch {
      // 偏好读取失败不影响主流程，沿用默认值
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/progress/history");
      const payload = parseApiResponse<{
        points: Array<{ date: string; score: number }>;
        stats: StreakStats;
      }>(await response.json());
      if (response.ok && payload.code === "OK" && payload.data) {
        setHistory(aggregateScoresByDate(payload.data.points));
        setStreakStats(payload.data.stats);
      }
    } catch {
      // 趋势加载失败不影响主流程
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void refreshHistory();
    void loadSettings();
  }, [loadSettings, refreshHistory, status]);

  useEffect(() => {
    const activePollIds = activePollIdsRef.current;
    return () => {
      activePollIds.clear();
    };
  }, []);

  const applyAssessmentStatus = (
    exerciseId: number,
    payload: AssessmentStatusPayload,
  ) => {
    if (payload.status === "completed" && payload.assessment) {
      setAssessments((prev) => ({ ...prev, [exerciseId]: payload.assessment! }));
      setCheckedInIds((prev) => new Set(prev).add(exerciseId));
      setScoringIds((prev) => {
        const next = new Set(prev);
        next.delete(exerciseId);
        return next;
      });
      setScoreFailures((prev) => {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      });
      void refreshHistory();
      return;
    }

    const exhausted =
      payload.status !== "processing" && payload.attempts >= payload.maxAttempts;
    if (payload.status === "failed" || exhausted) {
      setScoringIds((prev) => {
        const next = new Set(prev);
        next.delete(exerciseId);
        return next;
      });
      setScoreFailures((prev) => ({
        ...prev,
        [exerciseId]: {
          message:
            payload.error ??
            (exhausted ? "评分次数已达上限，请重新录音后再试" : "语音评分失败，请重试"),
          exhausted,
        },
      }));
    }
  };

  const pollAssessment = async (exerciseId: number) => {
    let delay = 2_000;
    const deadline = Date.now() + 4 * 60_000;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, delay));

      if (!activePollIdsRef.current.has(exerciseId)) return;

      try {
        const response = await fetch(`/api/assessments?exerciseId=${exerciseId}`);
        const payload = parseApiResponse<AssessmentStatusPayload>(
          await response.json(),
        );
        if (response.ok && payload.code === "OK" && payload.data) {
          const status = payload.data.status;
          if (status === "completed" || status === "failed") {
            activePollIdsRef.current.delete(exerciseId);
            applyAssessmentStatus(exerciseId, payload.data);
            return;
          }
        }
      } catch {
        // 网络抖动，继续轮询
      }

      if (Date.now() > deadline) {
        activePollIdsRef.current.delete(exerciseId);
        setScoringIds((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });
        setScoreFailures((prev) => ({
          ...prev,
          [exerciseId]: { message: "评分超时，请点击重试", exhausted: false },
        }));
        return;
      }

      delay = Math.min(Math.round(delay * 1.5), 15_000);
    }
  };

  const startAssessment = async (exerciseId: number) => {
    setScoringIds((prev) => new Set(prev).add(exerciseId));
    setScoreFailures((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });

    try {
      const response = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId }),
      });
      const payload = parseApiResponse<AssessmentStatusPayload>(
        await response.json(),
      );
      if (!response.ok || payload.code !== "OK" || !payload.data) {
        throw new Error(payload.message);
      }

      applyAssessmentStatus(exerciseId, payload.data);

      if (payload.data.status === "processing") {
        activePollIdsRef.current.add(exerciseId);
        void pollAssessment(exerciseId);
      }
    } catch (err) {
      setScoringIds((prev) => {
        const next = new Set(prev);
        next.delete(exerciseId);
        return next;
      });
      setScoreFailures((prev) => ({
        ...prev,
        [exerciseId]: {
          message: err instanceof Error ? err.message : "启动评分失败，请重试",
          exhausted: false,
        },
      }));
    }
  };

  const resumeFromProgress = (list: CompleteExercise[]) => {
    const scoring = new Set<number>();
    const failures: Record<number, AssessmentFailure> = {};
    const pendingIds: number[] = [];

    for (const exercise of list) {
      const progress = exercise.progress;
      if (!progress) continue;
      if (progress.status === "processing") {
        scoring.add(exercise.id);
      } else if (progress.status === "pending") {
        pendingIds.push(exercise.id);
      } else if (progress.status === "failed") {
        failures[exercise.id] = {
          message: progress.lastError ?? "语音评分失败，请重试",
          exhausted: false,
        };
      }
    }

    setScoringIds(scoring);
    setScoreFailures(failures);
    setAssessments({});

    for (const id of scoring) {
      activePollIdsRef.current.add(id);
      void pollAssessment(id);
    }
    for (const id of pendingIds) {
      void startAssessment(id);
    }
  };

  const handleLanguageChange = (nextLanguage: ExerciseLanguage) => {
    if (nextLanguage === language) return;
    userAdjustedSettingsRef.current = true;
    setLanguage(nextLanguage);
    setExercises([]);
    setCheckedInIds(new Set());
    setSubmittingId(null);
    setActiveRecordingId(null);
    setAssessments({});
    setScoringIds(new Set());
    setScoreFailures({});
    activePollIdsRef.current.clear();
    setError(null);
    void persistSettings(nextLanguage, count);
  };

  const handleCountChange = (nextCount: ExerciseCount) => {
    if (nextCount === count) return;
    userAdjustedSettingsRef.current = true;
    setCount(nextCount);
    void persistSettings(language, nextCount);
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
      resumeFromProgress(data.data.exercises);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (exerciseId: number, recording: AudioRecording) => {
    if (submittingId !== null || checkedInIds.has(exerciseId) || scoringIds.has(exerciseId)) {
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

      await startAssessment(exerciseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "打卡提交失败，请稍后重试");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRehearse = (exerciseId: number) => {
    setCheckedInIds((prev) => {
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    setAssessments((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
    setScoreFailures((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  };

  const pageBg =
    language === "zh"
      ? "bg-gradient-to-br from-[#1A3020] via-[#152820] to-[#0f1f18]"
      : "bg-gradient-to-br from-[#122B46] via-[#0f2238] to-[#0a1628]";

  if (status === "loading" || status === "unauthenticated") {
    return <div className="min-h-screen bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12]" />;
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
            <div className="mt-5 flex flex-col items-center gap-3">
              <p className="text-xs tracking-[0.3em] text-white/35">
                {language === "zh"
                  ? new Intl.DateTimeFormat("zh-CN", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }).format(new Date())
                  : new Intl.DateTimeFormat("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    }).format(new Date())}
              </p>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-4 pr-1.5 text-xs text-white/60">
                <span className="max-w-40 truncate">{session?.user?.name ?? session?.user?.email}</span>
                <Link
                  href="/settings"
                  aria-label="设置"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  ⚙
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="rounded-full bg-white/10 px-3 py-1 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
                >
                  退出登录
                </button>
              </div>
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
                    onChange={(e) => handleCountChange(Number(e.target.value) as ExerciseCount)}
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

          {settingsNotice && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-900/20 px-4 py-3 text-sm text-amber-100/80">
              {settingsNotice}
            </div>
          )}
        </header>

        <main className="space-y-6">
          <StreakSummary stats={streakStats} />
          <TrendChart points={history} />
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
                  isScoring={scoringIds.has(exercise.id)}
                  failure={scoreFailures[exercise.id] ?? null}
                  assessment={assessments[exercise.id]}
                  onRecordingChange={(exerciseId, active) =>
                    setActiveRecordingId(active ? exerciseId : null)
                  }
                  onCheckIn={handleCheckIn}
                  onRetry={(id) => void startAssessment(id)}
                  onRehearse={handleRehearse}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
