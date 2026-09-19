/**
 * Standardized error handling utilities.
 */

/**
 * A displayable message for anything that can be thrown. Supabase/PostgREST
 * errors are plain objects with a `message`, not Error instances, and String()
 * on one is "[object Object]".
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
}

/**
 * Handles service-level errors with consistent logging.
 * Returns a user-friendly error message string, or empty string for aborted requests.
 */
export function handleServiceError(context: string, error: unknown): string {
  // Silently ignore aborted requests
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '';
  }

  const message = errorMessage(error);
  console.error(`[${context}] ${message}`, error);
  return message;
}

/**
 * Type guard to check if an error is an AbortError (request was cancelled).
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
