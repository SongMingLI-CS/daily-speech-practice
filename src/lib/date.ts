export function formatDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getTodayDateString(
  timeZone = "Asia/Shanghai",
  now: Date = new Date(),
): string {
  return formatDateKey(now, timeZone);
}
