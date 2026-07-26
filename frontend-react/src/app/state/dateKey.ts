// 本地时区的 YYYY-MM-DD 日期 key，业务上的“今天/当天”统一从这里取。
// 禁止使用 new Date().toISOString().slice(0, 10)：那是 UTC 日期，
// 东八区每天 08:00 之前会得到“昨天”，出勤、事件和任务会记错日子。
export function toLocalDateKey(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
