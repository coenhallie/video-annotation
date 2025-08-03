/**
 * Small timing utilities: rafThrottle and debounce.
 * Use across components to reduce re-render churn from high-frequency events.
 */

export function rafThrottle<T extends (...args: any[]) => void>(fn: T) {
  let scheduled = false;
  let lastArgs: any[] | null = null;

  const invoke = () => {
    scheduled = false;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return (...args: Parameters<T>) => {
    lastArgs = args;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(invoke);
    }
  };
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  wait = 100
) {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      fn(...args);
    }, wait);
  };
}
