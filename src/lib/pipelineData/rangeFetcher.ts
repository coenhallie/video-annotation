import type { RangeFetcher } from './jsonlIndex';
import { sameObject } from '@/utils/fragmentedMp4';
import {
  download,
  transientStatus,
  TransientDownloadError,
  withRetries,
} from '@/utils/rangeDownload';

/**
 * A presigned URL is renewed once it is this old, ahead of S3's 900 s expiry,
 * so a read never has to fail first. The replay stays open for the whole of a
 * two-hour match; before this, every read after the first fifteen minutes was
 * refused and the replay stopped with "Pipeline data request failed (403)".
 */
export const RENEW_AFTER_MS = 10 * 60 * 1000;

export interface RangeFetcherOptions {
  /**
   * A fresh presigned URL for the same object, or null when none can be had.
   * Without it the URL is used until it expires.
   */
  renewUrl?: (() => Promise<string | null>) | undefined;
  /** The clock the URL's age is measured by. For tests. */
  now?: (() => number) | undefined;
}

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
 *
 * The URL is renewed before it expires, and again if S3 refuses it anyway (a
 * laptop asleep past the expiry). A read that stalls or fails in passing is
 * tried again (utils/rangeDownload.ts).
 */
export function httpRangeFetcher(
  initialUrl: string,
  meta: { size: number; acceptsRanges: boolean },
  options: RangeFetcherOptions = {}
): RangeFetcher {
  const now = options.now ?? (() => Date.now());
  let url = initialUrl;
  let signedAt = now();
  let renewing: Promise<boolean> | null = null;

  /** Replace the URL, once for every read that asks at the same time. */
  function renew(): Promise<boolean> {
    const renewUrl = options.renewUrl;
    if (!renewUrl) return Promise.resolve(false);
    if (!renewing) {
      const stale = url;
      renewing = renewUrl()
        .then((fresh) => {
          if (!fresh || !sameObject(fresh, stale)) return false;
          url = fresh;
          signedAt = now();
          return true;
        })
        .catch(() => false)
        .finally(() => {
          renewing = null;
        });
    }
    return renewing;
  }

  return {
    async head() {
      return { size: meta.size, acceptsRanges: meta.acceptsRanges };
    },

    async range(start: number, endInclusive: number, signal?: AbortSignal) {
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

      return withRetries(async () => {
        // Renewed ahead of time; if that fails, the URL may still have a while.
        if (now() - signedAt >= RENEW_AFTER_MS) await renew();
        for (let attempt = 0; ; attempt++) {
          const res = await download(
            url,
            {
              cache: 'no-store',
              signal: signal ?? null,
              ...(wantsWholeObject
                ? {}
                : { headers: { Range: `bytes=${start}-${endInclusive}` } }),
            },
            (status) => (wantsWholeObject ? status >= 200 && status < 300 : status === 206)
          );
          if (res.data) return new TextDecoder().decode(res.data);

          const rejected = res.status === 401 || res.status === 403;
          if (rejected && attempt === 0 && (await renew())) continue;
          if (transientStatus(res.status)) {
            throw new TransientDownloadError(`Pipeline data request failed (${res.status})`);
          }
          if (res.status < 200 || res.status >= 300) {
            throw new Error(`Pipeline data request failed (${res.status})`);
          }
          throw new Error(`Pipeline data server ignored the range request (${res.status})`);
        }
      }, signal);
    },
  };
}
