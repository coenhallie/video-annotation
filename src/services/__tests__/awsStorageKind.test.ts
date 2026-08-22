import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: vi.fn(async () => ({ access_token: 'tok' })),
}));

import { AwsStorageService } from '@/services/awsStorageService';

const ID = 'bc9ac890-942a-4052-9b55-25e38bf53d51';

function respondWith(url: string, status = 200) {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify({ url }),
  }));
}

describe('getUrlForProject', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests the video kind by default', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getUrlForProject(ID);
    expect(String(f.mock.calls[0][0])).not.toContain('kind=');
  });

  it('requests kind=data when asked', async () => {
    const f = respondWith('https://s3.example.com/x/data.jsonl?sig=1');
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getUrlForProject(ID, 'data');
    expect(String(f.mock.calls[0][0])).toContain('kind=data');
  });

  it('rejects a data URL that points at the video, so an old deploy cannot mislead it', async () => {
    const f = respondWith('https://s3.example.com/x/streams/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getUrlForProject(ID, 'data')).rejects.toThrow(
      /pipeline data/i
    );
  });

  it('keeps getVideoUrlForProject working', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getVideoUrlForProject(ID)).resolves.toContain(
      'generated.mp4'
    );
  });
});
