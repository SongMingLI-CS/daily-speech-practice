"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface HistoryPoint {
  exerciseId: number;
  date: string;
  score: number;
  category: string;
  language: string;
  title: string;
  completedAt: string | null;
}

function parsePoints(payload: unknown): HistoryPoint[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: { points?: unknown } }).data;
  const points = Array.isArray(data?.points) ? data.points : [];
  return points.filter(
    (point): point is HistoryPoint =>
      typeof point === "object" &&
      point !== null &&
      typeof (point as HistoryPoint).exerciseId === "number" &&
      typeof (point as HistoryPoint).score === "number",
  );
}

export default function RecordsPage() {
  const router = useRouter();
  const { status } = useSession();
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/progress/history")
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (!cancelled) setPoints(parsePoints(payload));
      })
      .catch(() => {
        if (!cancelled) {
          setNotice({ kind: "err", text: "记录加载失败，请稍后重试" });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleDelete = async (exerciseId: number) => {
    if (!window.confirm("确定删除这条打卡记录吗？录音文件也会一并移除，此操作不可恢复。")) return;
    setDeletingId(exerciseId);
    setNotice(null);
    try {
      const response = await fetch(`/api/progress/${exerciseId}`, { method: "DELETE" });
      const payload: unknown = await response.json();
      const message =
        payload && typeof payload === "object"
          ? String((payload as { message?: unknown }).message ?? "")
          : "";
      if (!response.ok) throw new Error(message || "删除失败");
      setPoints((previous) => previous.filter((point) => point.exerciseId !== exerciseId));
      setNotice({ kind: "ok", text: message || "记录已删除" });
    } catch (err) {
      setNotice({
        kind: "err",
        text: err instanceof Error ? err.message : "删除失败，请稍后重试",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12]" />
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-[#152820] via-[#10241c] to-[#0a1a12]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-amber-300/5 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-emerald-300/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
          >
            ← 返回首页
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg border border-red-300/30 px-3 py-1.5 text-sm text-red-200/80 transition-colors hover:bg-red-400/10"
          >
            退出登录
          </button>
        </div>

        <header className="animate-rise-in pt-2">
          <p className="mb-2 text-xs uppercase tracking-[0.4em] text-amber-200/50">Records</p>
          <h1 className="text-3xl font-bold text-amber-50 sm:text-4xl">打卡记录</h1>
          <p className="mt-2 text-sm leading-6 text-white/50">
            浏览最近 90 条有评分的打卡记录，可回听录音或删除。
          </p>
        </header>

        {notice && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              notice.kind === "ok"
                ? "border-emerald-300/30 bg-emerald-400/5 text-emerald-100"
                : "border-red-400/30 bg-red-950/40 text-red-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-white/40">记录加载中...</p>
        ) : points.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-sm text-white/40">
            还没有打卡记录。生成今日挑战并完成一次朗读评分后，这里会显示你的成长轨迹。
          </div>
        ) : (
          <div className="space-y-4">
            {points.map((point) => (
              <article
                key={point.exerciseId}
                className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-amber-200/20 bg-amber-200/5 px-2.5 py-0.5 text-xs tracking-wide text-amber-200/80">
                        {point.category}
                      </span>
                      <span className="text-xs text-white/35">
                        {point.completedAt ?? point.date}
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-base font-medium leading-snug text-white/90">
                      {point.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
                      {point.score}
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === point.exerciseId}
                      onClick={() => handleDelete(point.exerciseId)}
                      className="rounded-lg border border-red-300/30 px-3 py-1 text-xs text-red-200/80 transition-colors hover:bg-red-400/10 disabled:opacity-40"
                    >
                      {deletingId === point.exerciseId ? "删除中..." : "删除"}
                    </button>
                  </div>
                </div>

                <audio
                  controls
                  preload="none"
                  className="mt-3 w-full"
                  src={`/api/progress/${point.exerciseId}/audio`}
                >
                  你的浏览器不支持音频播放。
                </audio>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

