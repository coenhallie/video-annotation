import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: vi.fn(async () => ({ access_token: 'tok' })),
}));

import { AwsStorageService } from '@/services/awsStorageService';

const ID = 'bc9ac890-942a-4052-9b55-25e38bf53d51';

function respondWith(url: string, status = 200) {
  return vi.fn(async (..._args: unknown[]) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify({ url }),
  }));
}

function respondWithJson(payload: unknown, status = 200) {
  return vi.fn(async (..._args: unknown[]) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  }));
}

describe('getUrlForProject', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests the video object with no kind parameter', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getUrlForProject(ID);
    expect(String(f.mock.calls[0]?.[0])).not.toContain('kind=');
  });

  it('keeps getVideoUrlForProject working', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getVideoUrlForProject(ID)).resolves.toContain(
      'generated.mp4'
    );
  });
});

describe('getPipelineDataSource', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests kind=data', async () => {
    const f = respondWithJson({
      url: 'https://s3.example.com/x/data.jsonl?sig=1',
      size: 4096,
      acceptsRanges: true,
    });
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getPipelineDataSource(ID);
    expect(String(f.mock.calls[0]?.[0])).toContain('kind=data');
  });

  it('returns the envelope url, size and acceptsRanges', async () => {
    const f = respondWithJson({
      url: 'https://s3.example.com/x/data.jsonl?sig=1',
      size: 4096,
      acceptsRanges: true,
    });
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toEqual({
      url: 'https://s3.example.com/x/data.jsonl?sig=1',
      size: 4096,
      acceptsRanges: true,
    });
  });

  // The no-data family: getPipelineDataSource resolves to null for all of
  // these, rather than throwing, so the caller renders the "no pipeline
  // data" state instead of an error panel.

  it('resolves to null when the response is not the envelope shape, as an old deploy would answer', async () => {
    // Before this change the function proxied the Lambda's own {url} shape for
    // every kind, with no size or acceptsRanges field at all.
    const f = respondWithJson({ url: 'https://s3.example.com/x/data.jsonl?sig=1' });
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toBeNull();
  });

  it('resolves to null when the envelope url points at the video', async () => {
    const f = respondWithJson({
      url: 'https://s3.example.com/x/streams/generated.mp4?sig=1',
      size: 4096,
      acceptsRanges: true,
    });
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toBeNull();
  });

  it('resolves to null on a 501, meaning AWS_PIPELINE_DATA_KEY is not configured', async () => {
    const f = respondWithJson({ error: 'Pipeline data is not configured.' }, 501);
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toBeNull();
  });

  // This is what happens when AWS_PIPELINE_DATA_KEY is set but wrong (the key
  // the pipeline team hasn't confirmed yet doesn't match a real object), so
  // the Lambda itself answers non-ok and the function proxies that response
  // instead of probing.
  it('resolves to null on a 404 forwarded from the Lambda, without a size or acceptsRanges to read', async () => {
    const f = respondWithJson({ error: 'not found' }, 404);
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toBeNull();
  });

  it('resolves to null on a 502 flagged noData, meaning the function could not reach the object to probe it', async () => {
    const f = respondWithJson(
      { error: 'Pipeline data object is unreachable', noData: true },
      502
    );
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).resolves.toBeNull();
  });

  // Genuine failures still throw, so the caller shows a real error rather
  // than quietly claiming there is no data.

  it('rejects on a 502 without the noData flag, such as an auth-check failure', async () => {
    const f = respondWithJson({ error: 'Authorization check failed' }, 502);
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).rejects.toThrow(
      /authorization check failed/i
    );
  });

  it('rejects when the fetch itself throws', async () => {
    const f = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getPipelineDataSource(ID)).rejects.toThrow(
      /network down/i
    );
  });
});
