/**
 * Standardized error handling utilities.
 */

/**
 * Handles service-level errors with consistent logging.
 * Returns a user-friendly error message string, or empty string for aborted requests.
 */
export function handleServiceError(context: string, error: unknown): string {
  // Silently ignore aborted requests
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '';
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ${message}`, error);
  return message;
}

/**
 * Type guard to check if an error is an AbortError (request was cancelled).
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
