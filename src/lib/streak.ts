export interface StreakStats {
  /** 当前连续打卡天数（今日未打但昨日已打时仍计 1，保持「未断签」语义） */
  current: number;
  /** 历史最长连续天数 */
  best: number;
  /** 累计打卡天数（按自然日去重） */
  totalDays: number;
  /** 今日是否已完成打卡 */
  todayPracticed: boolean;
  /** 最近一次打卡日期（YYYY-MM-DD，无记录时为 null） */
  lastPracticedDate: string | null;
}

/**
 * 在 YYYY-MM-DD 日期键上做纯日历运算（按 UTC 正午推算，避免夏令时影响）。
 */
export function addDaysToDateKey(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * 从打卡日期集合计算打卡统计。
 * 输入为按用户时区折算后的 YYYY-MM-DD 字符串，顺序与重复不影响结果。
 */
export function buildStreakStats(
  dateKeys: Iterable<string>,
  today: string,
): StreakStats {
  const unique = new Set(dateKeys);
  const sorted = Array.from(unique).sort();
  const totalDays = unique.size;
  const lastPracticedDate = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of sorted) {
    run = previous !== null && addDaysToDateKey(previous, 1) === key ? run + 1 : 1;
    if (run > best) best = run;
    previous = key;
  }

  const todayPracticed = unique.has(today);
  let cursor: string | null;
  if (todayPracticed) {
    cursor = today;
  } else {
    const yesterday = addDaysToDateKey(today, -1);
    cursor = unique.has(yesterday) ? yesterday : null;
  }

  let current = 0;
  while (cursor !== null && unique.has(cursor)) {
    current += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  return { current, best, totalDays, todayPracticed, lastPracticedDate };
}
