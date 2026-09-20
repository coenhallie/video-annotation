import {
  ref,
  onUnmounted,
  watch,
  readonly,
  toValue,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue';
import { supabase } from './useSupabase';
import type { Annotation } from '../types/database';
import type { RealtimeScope } from '../utils/annotationRealtimeScope';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

/**
 * Keeps the local annotation list in step with what teammates write.
 *
 * `scope` says what to listen to and which rows belong to the list on screen
 * (see annotationRealtimeScope). One channel carries every source of a scope,
 * and it is replaced whenever the scope's channel or filters change.
 */
export function useRealtimeAnnotations(
  scope: MaybeRefOrGetter<RealtimeScope | null>,
  annotations: Ref<Annotation[]>
) {
  const isConnected = ref(false);
  let subscription: RealtimeChannel | null = null;

  // Read through the live scope at event time, not the one captured when the
  // channel was opened: switching between the Video and Pipeline tabs changes
  // which rows are accepted without changing what is listened to.
  const accept = (filter: string, row: Annotation): Annotation | null =>
    toValue(scope)
      ?.sources.find((source) => source.filter === filter)
      ?.accept(row) ?? null;

  const subscribe = (current: RealtimeScope) => {
    let channel = supabase.channel(current.channel);

    for (const { filter } of current.sources) {
      channel = channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'annotations', filter },
          (payload) => {
            const row = accept(filter, payload.new as Annotation);
            if (!row) return;
            // The author's own client already holds the row it just saved.
            if (annotations.value.some((a) => a.id === row.id)) return;
            annotations.value.push(row);
            annotations.value.sort((a, b) => a.timestamp - b.timestamp);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'annotations', filter },
          (payload) => {
            const row = accept(filter, payload.new as Annotation);
            if (!row) return;
            const index = annotations.value.findIndex((a) => a.id === row.id);
            if (index !== -1) {
              // Merge, never replace: the payload is the bare table row, and
              // the entry carries fields hydrated from other tables (labels,
              // commentCount) that a replace would silently drop.
              annotations.value[index] = {
                ...annotations.value[index],
                ...row,
              };
            }
          }
        );
    }

    // One unfiltered binding for deletes. A delete event carries the primary
    // key and nothing else, so a column filter can never match it and a
    // filtered binding receives nothing. Every delete in the table arrives here
    // as a bare id; one that is not in the list removes nothing.
    channel = channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'annotations' },
      (payload) => {
        annotations.value = annotations.value.filter(
          (a) => a.id !== payload.old.id
        );
      }
    );

    subscription = channel.subscribe((status) => {
      isConnected.value = status === 'SUBSCRIBED';
    });
  };

  const cleanup = () => {
    if (subscription) {
      supabase.removeChannel(subscription);
      subscription = null;
    }
    isConnected.value = false;
  };

  // The scope object is rebuilt whenever anything it reads changes; only a
  // change to what is actually listened to is worth a resubscribe.
  watch(
    () => {
      const current = toValue(scope);
      return current
        ? [current.channel, ...current.sources.map((s) => s.filter)].join('|')
        : null;
    },
    () => {
      cleanup();
      const current = toValue(scope);
      if (current) subscribe(current);
    },
    { immediate: true }
  );

  onUnmounted(cleanup);

  return {
    isConnected: readonly(isConnected),
    cleanup,
  };
}
