export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  kind: "streak" | "total";
  target: number;
}

export interface AchievementState {
  def: AchievementDef;
  unlocked: boolean;
  value: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "streak-3",
    icon: "🌱",
    title: "初见坚持",
    description: "连续打卡 3 天",
    kind: "streak",
    target: 3,
  },
  {
    id: "streak-7",
    icon: "🔥",
    title: "七日不断",
    description: "连续打卡 7 天",
    kind: "streak",
    target: 7,
  },
  {
    id: "streak-30",
    icon: "🏆",
    title: "月度达人",
    description: "连续打卡 30 天",
    kind: "streak",
    target: 30,
  },
  {
    id: "total-1",
    icon: "🎯",
    title: "破冰启程",
    description: "完成首次打卡",
    kind: "total",
    target: 1,
  },
  {
    id: "total-10",
    icon: "📚",
    title: "十日之约",
    description: "累计打卡 10 天",
    kind: "total",
    target: 10,
  },
  {
    id: "total-50",
    icon: "💪",
    title: "渐入佳境",
    description: "累计打卡 50 天",
    kind: "total",
    target: 50,
  },
  {
    id: "total-100",
    icon: "👑",
    title: "百炼成钢",
    description: "累计打卡 100 天",
    kind: "total",
    target: 100,
  },
  {
    id: "total-365",
    icon: "🌟",
    title: "年度之约",
    description: "累计打卡 365 天",
    kind: "total",
    target: 365,
  },
];

/**
 * 根据打卡统计（最长连续、累计天数）计算每个成就的解锁状态与当前进度。
 */
export function buildAchievements(stats: {
  best: number;
  totalDays: number;
}): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const value = def.kind === "streak" ? stats.best : stats.totalDays;
    return {
      def,
      value,
      unlocked: value >= def.target,
    };
  });
}
