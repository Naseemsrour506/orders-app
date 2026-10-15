const TZ = "Asia/Jerusalem";

/** התאריך של היום בישראל, בפורמט YYYY-MM-DD */
export function todayIL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** יום העבודה הבא (ראשון עד חמישי) */
export function nextWorkday(iso: string): string {
  let d = addDays(iso, 1);
  while ([5, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "";
  const today = todayIL();
  if (iso === today) return "היום";
  if (iso === addDays(today, 1)) return "מחר";
  if (iso === addDays(today, -1)) return "אתמול";
  return new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(
    new Date(iso + "T12:00:00Z"),
  );
}

export function fmtLongToday(): string {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date());
}

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  return day === todayIL() ? time : `${fmtDay(day)} ${time}`;
}
