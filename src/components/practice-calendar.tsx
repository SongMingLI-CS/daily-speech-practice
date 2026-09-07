"use client";

import { useEffect, useState } from "react";

interface CalendarDay {
  date: string;
  count: number;
  score: number;
}

interface CalendarData {
  month: string;
  practiced: number;
  avgScore: number;
  todayPracticed: boolean;
  days: CalendarDay[];
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const shifted = new Date(year, monthIndex - 1 + delta, 1);
  return monthKeyOf(shifted);
}

export function PracticeCalendar() {
  const currentMonth = monthKeyOf(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<CalendarData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/progress/calendar?month=${month}`)
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;
        const body = payload as { code?: string; data?: CalendarData };
        if (body.code === "OK" && body.data && body.data.month === month) {
          setData(body.data);
        }
      })
      .catch(() => {
        // 日历加载失败不影响主流程
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-white/40 backdrop-blur-md">
        日历加载中...
      </div>
    );
  }

  const [year, monthIndex] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex - 1, 1).getDay();
  const byDate = new Map(data.days.map((day) => [day.date, day]));
  const isFutureMonth = month.localeCompare(currentMonth) > 0;

  return (
    <div className="animate-rise-in rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-white/50">打卡日历</p>
          <p className="mt-0.5 text-sm font-medium text-amber-100/90">
            {year} 年 {monthIndex} 月
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span>本月 {data.practiced} 天</span>
          {data.practiced > 0 && <span>· 平均 {data.avgScore}</span>}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-white/35">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const practice = byDate.get(date);
          const isToday = date === currentMonth + `-${String(new Date().getDate()).padStart(2, "0")}`;
          return (
            <div
              key={date}
              title={practice ? `${date} · ${practice.count} 次 · 均分 ${practice.score}` : date}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-xs transition-colors ${
                practice
                  ? "bg-amber-200/20 text-amber-100 hover:bg-amber-200/30"
                  : "text-white/25 hover:bg-white/5"
              } ${isToday ? "ring-1 ring-amber-200/60" : ""}`}
            >
              <span className="leading-none">{day}</span>
              {practice && practice.count > 1 && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-300/70" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((value) => shiftMonth(value, -1))}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10"
        >
          ← 上月
        </button>
        <button
          type="button"
          disabled={isFutureMonth}
          onClick={() => setMonth((value) => shiftMonth(value, 1))}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下月 →
        </button>
      </div>
    </div>
  );
}
