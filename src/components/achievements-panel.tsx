"use client";

import { buildAchievements } from "@/lib/achievements";
import type { StreakStats } from "@/lib/streak";

export function AchievementsPanel({ stats }: { stats: StreakStats | null }) {
  if (!stats || stats.totalDays === 0) return null;

  const states = buildAchievements({ best: stats.best, totalDays: stats.totalDays });
  const unlockedCount = states.filter((state) => state.unlocked).length;

  return (
    <section className="animate-rise-in rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-white/50">成就</p>
          <p className="mt-0.5 text-sm font-medium text-amber-100/90">
            已解锁 {unlockedCount}/{states.length}
          </p>
        </div>
        <span className="text-lg" aria-hidden>
          🏅
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {states.map(({ def, unlocked, value }) => (
          <div
            key={def.id}
            className={`rounded-xl border p-3 transition-colors ${
              unlocked
                ? "border-amber-200/25 bg-amber-200/[0.07]"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-lg leading-none ${unlocked ? "" : "opacity-40 grayscale"}`}>
                {def.icon}
              </span>
              <span className={`truncate text-xs font-medium ${unlocked ? "text-amber-100" : "text-white/50"}`}>
                {def.title}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-white/40">{def.description}</p>
            {unlocked ? (
              <p className="mt-1.5 text-[11px] font-medium text-emerald-200/90">✓ 已达成</p>
            ) : (
              <>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-200/60"
                    style={{ width: `${Math.min(100, (value / def.target) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-white/35">
                  {value}/{def.target}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
