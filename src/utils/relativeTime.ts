/**
 * Terse relative time for the dashboard's mono meta line. That line is a row
 * of uppercase tokens ("2:14  60FPS  TODAY  3A"), so this returns a token,
 * not a sentence.
 *
 * `now` is injectable so tests do not depend on the wall clock.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();
  // Unparseable input yields NaN. Callers render nothing rather than a token
  // reading "OPENED Invalid Date".
  if (!Number.isFinite(elapsed)) return '';

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  // Clock skew can put a timestamp slightly in the future; that reads as
  // "just now", never as a negative age.
  if (elapsed < MINUTE) return 'JUST NOW';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}M AGO`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}H AGO`;

  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  return then.toLocaleDateString();
}
