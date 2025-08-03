/**
 * Lightweight DEV-gated logger to reduce console noise in production.
 */
export const logger = {
  debug: (...args: any[]) => {
    if (import.meta.env.DEV) console.debug(...args);
  },
  info: (...args: any[]) => {
    if (import.meta.env.DEV) console.info(...args);
  },
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};
