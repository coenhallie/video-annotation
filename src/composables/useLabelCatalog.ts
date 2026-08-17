import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { LabelService } from '../services/labelService';
import type { Label } from '../types/labels';

interface CatalogEntry {
  labels: Ref<Label[]>;
  loading: Ref<boolean>;
  inFlight: Promise<void> | null;
  loaded: boolean;
}

/**
 * Label lists are shared per user and project so the annotation sidebar and the
 * cursor bloom read the same array. Without this they would each fetch and
 * silently drift after a label is created or renamed.
 */
const catalogs = new Map<string, CatalogEntry>();

const entryFor = (key: string): CatalogEntry => {
  let entry = catalogs.get(key);
  if (!entry) {
    entry = {
      labels: ref<Label[]>([]),
      loading: ref(false),
      inFlight: null,
      loaded: false,
    };
    catalogs.set(key, entry);
  }
  return entry;
};

export function useLabelCatalog(
  userId: MaybeRefOrGetter<string | undefined>,
  projectId?: MaybeRefOrGetter<string | undefined>
) {
  const keyFor = () => `${toValue(userId) ?? ''}::${toValue(projectId) ?? ''}`;

  const labels = computed(() => entryFor(keyFor()).labels.value);
  const loading = computed(() => entryFor(keyFor()).loading.value);

  const labelsById = computed(() => {
    const map: Record<string, Label> = {};
    for (const label of labels.value) map[label.id] = label;
    return map;
  });

  const fetchInto = (entry: CatalogEntry): Promise<void> => {
    entry.loading.value = true;
    const request = LabelService.getLabels(toValue(userId), toValue(projectId))
      .then((result) => {
        entry.labels.value = result;
        entry.loaded = true;
      })
      .catch((error) => {
        console.error('Failed to load labels:', error);
      })
      .finally(() => {
        entry.loading.value = false;
        entry.inFlight = null;
      });
    entry.inFlight = request;
    return request;
  };

  /** Fetch once per key. Concurrent callers share the same request. */
  const load = (): Promise<void> => {
    const entry = entryFor(keyFor());
    if (entry.inFlight) return entry.inFlight;
    if (entry.loaded) return Promise.resolve();
    return fetchInto(entry);
  };

  /** Force a refetch, for example after labels are created or edited. */
  const reload = (): Promise<void> => {
    const entry = entryFor(keyFor());
    if (entry.inFlight) return entry.inFlight;
    return fetchInto(entry);
  };

  return { labels, labelsById, loading, load, reload };
}

/** Test seam: drop all cached catalogs. */
export function __resetLabelCatalogs(): void {
  catalogs.clear();
}
