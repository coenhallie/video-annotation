import type { RangeFetcher } from './jsonlIndex';

/**
 * Range reads against a presigned URL.
 *
 * S3 answers a ranged GET with 206 and a Content-Range. Some objects cannot be
 * ranged at all - notably anything served with a Content-Encoding, where byte
 * offsets refer to the encoded stream and are useless to us. head() reports
 * that, and buildIndex falls back to reading the object whole.
 */
export function httpRangeFetcher(url: string): RangeFetcher {
  return {
    async head() {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Pipeline data is unreachable (${res.status})`);
      }
      const size = Number(res.headers.get('content-length') ?? 0);
      const acceptsRanges =
        (res.headers.get('accept-ranges') ?? '').toLowerCase() === 'bytes' &&
        !res.headers.get('content-encoding') &&
        size > 0;
      return { size, acceptsRanges };
    },

    async range(start: number, endInclusive: number) {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Range: `bytes=${start}-${endInclusive}` },
      });
      if (!res.ok) {
        throw new Error(`Pipeline data range request failed (${res.status})`);
      }
      return res.text();
    },
  };
}
