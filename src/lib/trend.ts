export interface ScoreDatum {
  date: string;
  score: number;
}

/**
 * 按天聚合并求平均分，输出按日期升序排列的趋势点。
 * 同一天多次打卡时取平均，避免同日多点抖动。
 */
export function aggregateScoresByDate(entries: ScoreDatum[]): ScoreDatum[] {
  const byDate = new Map<string, { sum: number; count: number }>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date) ?? { sum: 0, count: 0 };
    bucket.sum += entry.score;
    bucket.count += 1;
    byDate.set(entry.date, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, { sum, count }]) => ({
      date,
      score: Math.round((sum / count) * 10) / 10,
    }));
}
