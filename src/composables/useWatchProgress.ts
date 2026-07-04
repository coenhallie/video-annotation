import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  addSecond,
  mergeRanges,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';
import { getProgress, upsertProgress } from '@/services/watchProgressService';

export type ReadableRef<T> = Ref<T> | ComputedRef<T>;

const FLUSH_INTERVAL_MS = 10_000;

/**
 * Tracks unique watched coverage for one video. Informational only —
 * persistence failures are retried on the next flush, never surfaced.
 */
export function useWatchProgress(options: {
  videoId: ReadableRef<string | null | undefined>;
  duration: ReadableRef<number>;
  userId: ReadableRef<string | null | undefined>;
}) {
  const { videoId, duration, userId } = options;

  const ranges = ref<WatchedRange[]>([]);
  let loadedKey: string | null = null;
  let dirty = false;
  let lastFlushAt = 0;

  const percentWatched = computed(() =>
    percentFromRanges(ranges.value, duration.value)
  );

  async function loadExisting() {
    const vid = videoId.value;
    const uid = userId.value;
    if (!vid || !uid) return;
    const key = `${uid}:${vid}`;
    if (loadedKey === key) return;
    loadedKey = key;
    ranges.value = [];
    dirty = false;
    const row = await getProgress(vid, uid);
    // Guard against the ids changing again while the request was in flight;
    // merge with seconds marked during the load.
    if (loadedKey === key && row?.watchedRanges?.length) {
      ranges.value = mergeRanges([...row.watchedRanges, ...ranges.value]);
    }
  }

  function onTimeUpdate(currentTime: number, isPlaying: boolean) {
    if (!isPlaying) return;
    if (!videoId.value || !userId.value || duration.value <= 0) return;
    ranges.value = addSecond(ranges.value, currentTime);
    dirty = true;
    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) void flush();
  }

  async function flush() {
    if (!dirty) return;
    const vid = videoId.value;
    const uid = userId.value;
    if (!vid || !uid || duration.value <= 0) return;
    dirty = false;
    lastFlushAt = Date.now();
    const ok = await upsertProgress(uid, vid, ranges.value, duration.value);
    if (!ok) dirty = true;
  }

  watch([videoId, userId], () => void loadExisting(), { immediate: true });

  const flushOnUnload = () => void flush();
  if (getCurrentInstance()) {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushOnUnload);
    }
    onBeforeUnmount(() => {
      void flush();
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', flushOnUnload);
      }
    });
  }

  return { percentWatched, onTimeUpdate, flush };
}
