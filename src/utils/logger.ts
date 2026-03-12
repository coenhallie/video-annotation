/**
 * Lightweight DEV-gated logger to reduce console noise in production.
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.info(...args);
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
