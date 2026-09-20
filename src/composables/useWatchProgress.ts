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
  sanitizeRanges,
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
  // Who the seconds in `ranges` belong to. The editor stays mounted across a
  // project switch, so the ids can change while unsaved seconds are still held;
  // a save always goes to this owner, never to whatever is open by then.
  let owner: { uid: string; vid: string; duration: number } | null = null;
  let dirty = false;
  let lastFlushAt = 0;

  const percentWatched = computed(() =>
    percentFromRanges(ranges.value, duration.value)
  );

  async function loadExisting() {
    const vid = videoId.value;
    const uid = userId.value;
    if (owner && owner.uid === uid && owner.vid === vid) return;
    // Save the outgoing video's unsaved seconds before letting go of them.
    // flush() reads its owner and ranges before its first await, so the new
    // owner can take over at once and seconds marked from here on are kept.
    void flush();
    if (!vid || !uid) {
      owner = null;
      ranges.value = [];
      return;
    }
    const mine = { uid, vid, duration: duration.value };
    owner = mine;
    ranges.value = [];
    dirty = false;
    const row = await getProgress(vid, uid);
    // Guard against the ids changing again while the request was in flight;
    // merge with seconds marked during the load. DB-sourced ranges are
    // untrusted (no RLS) — sanitize before any range math.
    const stored = sanitizeRanges(row?.watchedRanges);
    if (owner === mine && stored.length) {
      ranges.value = mergeRanges([...stored, ...ranges.value]);
    }
  }

  function onTimeUpdate(currentTime: number, isPlaying: boolean) {
    if (!isPlaying) return;
    if (!videoId.value || !userId.value || duration.value <= 0) return;
    // Between an id change and its watcher the open video is not the owner yet.
    if (owner?.vid !== videoId.value || owner.uid !== userId.value) return;
    owner.duration = duration.value;
    ranges.value = addSecond(ranges.value, currentTime);
    dirty = true;
    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS) void flush();
  }

  async function flush() {
    if (!dirty || !owner || owner.duration <= 0) return;
    const { uid, vid, duration: ownerDuration } = owner;
    const saving = ranges.value;
    dirty = false;
    lastFlushAt = Date.now();
    const ok = await upsertProgress(uid, vid, saving, ownerDuration);
    // Only the same owner can be marked unsaved again: by now the ranges may
    // already belong to another video.
    if (!ok && owner?.uid === uid && owner.vid === vid) dirty = true;
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
