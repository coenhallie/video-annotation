import { supabase } from '@/composables/useSupabase';

/**
 * Stands in for an owner whose user row could not be read. Exported because it
 * is a placeholder, not a name: callers that would otherwise print it into a
 * sentence ("SET BY Unknown") should check for it and say nothing instead.
 */
export const UNKNOWN_OWNER_NAME = 'Unknown';

export type ProjectOwner = {
  id: string;
  name: string;
  avatarUrl?: string;
};

type DisplayNameRow = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Names for a set of user ids.
 *
 * Goes through the `get_user_display_names` RPC rather than selecting from
 * `public.users` directly. That table's only SELECT policy is
 * `auth.uid() = id`, so a direct read returns the caller's own row and nothing
 * else - which is why every owner but yourself used to render "Unknown".
 * Widening that policy is not an option: row-level security is row level, not
 * column level, so anything permissive enough to expose a name also exposes
 * `email` and `metadata`.
 *
 * The RPC derives the display name server-side and never returns the address
 * itself. See migrations/20260825_user_display_names.sql.
 */
export async function fetchOwners(
  ownerIds: string[]
): Promise<Record<string, ProjectOwner>> {
  const uniqueIds = [...new Set(ownerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_user_display_names', {
    p_ids: uniqueIds,
  });

  if (error) {
    console.warn('⚠️ [ownerEnrichment] fetchOwners error:', error);
    return {};
  }

  const map: Record<string, ProjectOwner> = {};
  for (const u of (data ?? []) as DisplayNameRow[]) {
    map[u.id] = {
      id: u.id,
      name: u.displayName || UNKNOWN_OWNER_NAME,
      avatarUrl: u.avatarUrl ?? undefined,
    };
  }
  // Ensure every requested id has an entry
  for (const id of uniqueIds) {
    if (!map[id]) map[id] = { id, name: UNKNOWN_OWNER_NAME };
  }
  return map;
}
