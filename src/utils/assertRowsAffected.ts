/**
 * An UPDATE or DELETE that RLS filters down to nothing answers 2xx with zero
 * rows and no error, so whether a write happened has to be read off the rows
 * it returns (`.select('id')` on the write). Treating "no error" as success
 * made denied writes look done: the row vanished or changed locally and came
 * back on reload.
 */
export function assertRowsAffected(
  rows: unknown,
  what: string,
  action: string
): void {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `${what} was not found, or you do not have permission to ${action}.`
    );
  }
}
