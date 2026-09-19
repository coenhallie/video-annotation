import { supabase } from '../composables/useSupabase';
import type { TableName } from '../types/supabase';

/** Ids per request. ~37 bytes per uuid keeps the URL near 2 KB. */
export const IN_CHUNK_SIZE = 50;
/** PostgREST's default response cap; a short page means the last page. */
const PAGE_SIZE = 1000;

/**
 * Every row of `table` whose `column` is one of `ids`.
 *
 * A plain `.in(column, ids)` fails quietly in two ways at library scale: the
 * response stops at 1,000 rows with no error, and a few hundred uuids make a
 * GET URL longer than gateways accept. This sends the ids in chunks and pages
 * each chunk until it is exhausted. Errors are thrown: a partial result here
 * would be shown as a wrong number, not as a failure.
 *
 * Rows are ordered by `id` so that paging is stable; `select` must include it.
 *
 * `select` is a runtime string, so the client cannot infer the row shape from
 * it; the caller states it as `Row`.
 */
export async function selectAllIn<Row = Record<string, unknown>>(
  table: TableName,
  select: string,
  column: string,
  ids: readonly string[]
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start < ids.length; start += IN_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + IN_CHUNK_SIZE);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in(column, chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as Row[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}
