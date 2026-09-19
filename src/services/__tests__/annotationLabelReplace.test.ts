import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny fake of the annotation_labels table that records the order of writes.
let table: Array<{ annotationId: string; labelId: string }> = [];
let failInsert: unknown = null;
const log: string[] = [];

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => {
      const filters: Record<string, unknown> = {};
      let op: 'select' | 'delete' | null = null;
      const run = () => {
        const match = (r: { annotationId: string; labelId: string }) =>
          r.annotationId === filters.annotationId &&
          (!filters.labelIds || (filters.labelIds as string[]).includes(r.labelId));
        if (op === 'delete') {
          log.push(`delete:${(filters.labelIds as string[] | undefined)?.join(',') ?? 'ALL'}`);
          table = table.filter((r) => !match(r));
          return { data: null, error: null };
        }
        return { data: table.filter(match), error: null };
      };
      const chain: any = {
        select: () => ((op = op ?? 'select'), chain),
        delete: () => ((op = 'delete'), chain),
        eq: (_c: string, v: unknown) => ((filters.annotationId = v), chain),
        in: (_c: string, v: unknown) => ((filters.labelIds = v), chain),
        insert: (rows: typeof table) => {
          log.push(`insert:${rows.map((r) => r.labelId).join(',')}`);
          if (failInsert) return Promise.resolve({ error: failInsert });
          table.push(...rows);
          return Promise.resolve({ error: null });
        },
        then: (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad),
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  table = [
    { annotationId: 'a1', labelId: 'keep' },
    { annotationId: 'a1', labelId: 'old' },
    { annotationId: 'other', labelId: 'old' },
  ];
  failInsert = null;
  log.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const labelsOf = (id: string) => table.filter((r) => r.annotationId === id).map((r) => r.labelId).sort();

describe('AnnotationLabelService.updateAnnotationLabels', () => {
  // It used to delete every label and then insert the new set, as two requests.
  // When the insert failed (network, RLS) the annotation was left with none.
  it('keeps the existing labels when adding the new ones fails', async () => {
    const { AnnotationLabelService } = await import('@/services/annotationLabelService');
    failInsert = { message: 'permission denied' };

    await expect(
      AnnotationLabelService.updateAnnotationLabels('a1', ['keep', 'new'])
    ).rejects.toMatchObject({ message: 'permission denied' });

    expect(labelsOf('a1')).toEqual(['keep', 'old']);
  });

  it('adds what is missing before removing what is no longer wanted', async () => {
    const { AnnotationLabelService } = await import('@/services/annotationLabelService');

    await AnnotationLabelService.updateAnnotationLabels('a1', ['keep', 'new']);

    expect(labelsOf('a1')).toEqual(['keep', 'new']);
    expect(labelsOf('other')).toEqual(['old']);
    expect(log).toEqual(['insert:new', 'delete:old']);
  });

  it('writes nothing when the set is already right', async () => {
    const { AnnotationLabelService } = await import('@/services/annotationLabelService');
    await AnnotationLabelService.updateAnnotationLabels('a1', ['old', 'keep']);
    expect(log).toEqual([]);
  });
});
