const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatDateTimeJst(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateJst(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function dateTimeLocalToUtcIso(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

export function utcIsoToDateTimeLocal(value: string): string {
  const date = new Date(new Date(value).getTime() + JST_OFFSET_MS);
  return date.toISOString().slice(0, 16);
}

export function tomorrowJstUtcRange(): { start: string; end: string } {
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const startJst = new Date(
    Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 1)
  );
  const startUtc = new Date(startJst.getTime() - JST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
}

export function csvEscape(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
