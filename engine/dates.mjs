// Datumshelfer. Alle Daten als ISO-Tag "YYYY-MM-DD" in UTC.

export const DAY = 86_400_000;
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const parseDay = (d) => Date.parse(d + "T00:00:00Z");
export const addDays = (d, n) => iso(parseDay(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY);
export const weekday = (d) => new Date(parseDay(d)).getUTCDay(); // 0 = Sonntag

// Letzter Sonntag, dessen Tageskerze geschlossen ist (ab Montag 00:00 UTC).
export function lastCompletedSunday(nowMs) {
  const today = iso(nowMs);
  const dow = weekday(today);
  return addDays(today, -(dow === 0 ? 7 : dow));
}

// Lückenloser Tageskalender von a bis b (inklusive).
export function calendar(a, b) {
  const out = [];
  for (let t = parseDay(a), end = parseDay(b); t <= end; t += DAY) out.push(iso(t));
  return out;
}
