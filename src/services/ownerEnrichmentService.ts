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

export async function fetchOwners(
  ownerIds: string[]
): Promise<Record<string, ProjectOwner>> {
  const uniqueIds = [...new Set(ownerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const { data, error } = await supabase
    .from('users')
    .select('id, fullName, email, avatarUrl')
    .in('id', uniqueIds);

  if (error) {
    console.warn('⚠️ [ownerEnrichment] fetchOwners error:', error);
    return {};
  }

  const map: Record<string, ProjectOwner> = {};
  for (const u of data ?? []) {
    map[u.id] = {
      id: u.id,
      name: u.fullName || u.email || UNKNOWN_OWNER_NAME,
      avatarUrl: u.avatarUrl ?? undefined,
    };
  }
  // Ensure every requested id has an entry
  for (const id of uniqueIds) {
    if (!map[id]) map[id] = { id, name: UNKNOWN_OWNER_NAME };
  }
  return map;
}
