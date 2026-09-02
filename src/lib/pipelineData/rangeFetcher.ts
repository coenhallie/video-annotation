import type { RangeFetcher } from './jsonlIndex';

/**
 * Range reads against a presigned URL.
 *
 * Size and range support are supplied by the caller rather than discovered
 * here. A presigned URL is signed for one HTTP method, so this code cannot
 * HEAD it, and `Content-Range` / `Accept-Ranges` are not CORS-safelisted, so it
 * could not read them off the response either. The Netlify Function probes the
 * object server side, where neither restriction applies.
 *
 * Nothing here reads a response header, only bodies, so the bucket needs no
 * `Access-Control-Expose-Headers` for any of this to work.
 */
export function httpRangeFetcher(
  url: string,
  meta: { size: number; acceptsRanges: boolean }
): RangeFetcher {
  return {
    async head() {
      return { size: meta.size, acceptsRanges: meta.acceptsRanges };
    },

    async range(start: number, endInclusive: number) {
      // A server that ignores Range answers 200 with the whole object. Accepting
      // that as if it were the requested slice is worse than failing: every
      // offset the index computes from it would be wrong, and the corruption is
      // silent. Only trust a 206 when a range was genuinely requested.
      const wantsWholeObject = !meta.acceptsRanges;

      // When ranges are unsupported, buildIndex's only valid call is the full
      // read range(0, size - 1). A caller asking for anything narrower here
      // would otherwise silently get the whole object back and misread it as
      // the requested slice - the same corruption the check below prevents at
      // the response end, just at the request end instead.
      if (wantsWholeObject && (start !== 0 || endInclusive !== meta.size - 1)) {
        throw new Error(
          'Pipeline data does not support ranged reads; only a whole-object read is valid'
        );
      }

      const res = await fetch(url, {
        cache: 'no-store',
        ...(wantsWholeObject
          ? {}
          : { headers: { Range: `bytes=${start}-${endInclusive}` } }),
      });

      if (!res.ok) {
        throw new Error(`Pipeline data request failed (${res.status})`);
      }
      if (!wantsWholeObject && res.status !== 206) {
        throw new Error(
          `Pipeline data server ignored the range request (${res.status})`
        );
      }
      return res.text();
    },
  };
}
