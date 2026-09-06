"use client";

import type { StreakStats } from "@/lib/streak";

function StreakSummary({ stats }: { stats: StreakStats | null }) {
  if (!stats || stats.totalDays === 0) return null;

  const todayPracticed = stats.todayPracticed;
  const hint = todayPracticed
    ? "今日已完成打卡，保持节奏 ✦"
    : stats.current > 0
      ? "今天还没打卡，继续就不断签 ✦"
      : "从今天开始，建立你的每日口才习惯 ✦";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs tracking-widest text-white/50">连续打卡</span>
          <strong className="text-2xl leading-none text-amber-200">{stats.current}</strong>
          <span className="text-xs text-white/50">天</span>
        </div>
        <div className="flex gap-4 text-xs text-white/50">
          <span>累计 {stats.totalDays} 天</span>
          <span>最长 {stats.best} 天</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-white/40">{hint}</p>
    </div>
  );
}

export { StreakSummary };
