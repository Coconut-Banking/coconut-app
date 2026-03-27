/** Display name for demo / marketing builds — matches product copy samples. */
export const DEMO_HOME_DISPLAY_NAME = "BigD";

/** Local hour 0–23 → greeting phrase (no comma, no name). */
export function timeGreetingPhrase(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Hey";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Hey";
}

/** "Good morning, Alex" — omits the name part when `name` is empty. */
export function formatHomeGreetingLine(name: string, date: Date = new Date()): string {
  const phrase = timeGreetingPhrase(date);
  const trimmed = name.trim();
  if (!trimmed) return phrase;
  return `${phrase}, ${trimmed}`;
}
