import { supabase } from '@/composables/useSupabase';

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
      name: u.fullName || u.email || 'Unknown',
      avatarUrl: u.avatarUrl ?? undefined,
    };
  }
  // Ensure every requested id has an entry
  for (const id of uniqueIds) {
    if (!map[id]) map[id] = { id, name: 'Unknown' };
  }
  return map;
}
