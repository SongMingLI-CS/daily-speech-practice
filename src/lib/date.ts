export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function formatDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 校验 IANA 时区标识（例如 `Asia/Shanghai`）。
 * 非法值会让 `Intl.DateTimeFormat` 抛 RangeError，因此所有来自用户设置的时区
 * 在参与日期计算前都必须先经过这里，避免接口直接 500。
 */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** 把不可信或缺失的时区归一为可用的时区。 */
export function resolveTimeZone(value: string | null | undefined): string {
  return value && isValidTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

export function getTodayDateString(
  timeZone = DEFAULT_TIME_ZONE,
  now: Date = new Date(),
): string {
  return formatDateKey(now, timeZone);
}
