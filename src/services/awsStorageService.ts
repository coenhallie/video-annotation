import { getOptimizedSession } from '@/composables/useSupabase';

export class AwsStorageService {
  /**
   * Build the S3 filepath for a given pipeline project ID.
   * Pattern: storage/pipeline-output/{projectId}/streams/generated.mp4
   */
  static buildFilepath(outputVideoId: string): string {
    return `pipeline-output/${outputVideoId}/streams/generated.mp4`;
  }

  /**
   * Extract a URL from any response format (JSON object, JSON string, plain text).
   */
  private static extractUrl(text: string): string {
    // Try parsing as JSON first
    try {
      const data = JSON.parse(text);

      if (typeof data === 'string' && data.startsWith('http')) return data;

      if (typeof data === 'object' && data !== null) {
        // Check common key names
        const url = data.url || data.signedUrl || data.downloadUrl || data.presignedUrl || data.link || data.href;
        if (url) return url;

        // Nested: { data: { url: "..." } }
        if (data.data) {
          const nested = data.data;
          const nestedUrl = typeof nested === 'string' ? nested : nested.url || nested.signedUrl || nested.downloadUrl;
          if (nestedUrl) return nestedUrl;
        }
      }
    } catch {
      // Not JSON
    }

    // Plain text response containing a URL
    const trimmed = text.trim();
    if (trimmed.startsWith('http')) return trimmed;

    throw new Error(`Could not extract URL from API response: ${text.substring(0, 200)}`);
  }

  /**
   * Get a presigned URL for one of a pipeline project's objects.
   *
   * Sends the project id and a kind, never a path: the Netlify Function builds
   * the storage key itself so no caller can name an arbitrary object. See
   * docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md.
   */
  static async getUrlForProject(
    outputVideoId: string,
    kind: 'video' | 'data' = 'video'
  ): Promise<string> {
    const query = new URLSearchParams({ outputVideoId });
    if (kind !== 'video') query.set('kind', kind);
    const url = `/.netlify/functions/aws-storage?${query.toString()}`;

    // Anonymous share-link viewers have no session; the function falls back to
    // an RLS visibility check for them, so sending no header is a valid case.
    const session = await getOptimizedSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(url, { cache: 'no-store', headers });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let message = `Failed to get presigned URL: ${res.status}`;
      try {
        const err = JSON.parse(body);
        if (err.error) message = err.error;
      } catch {
        if (body) message = body;
      }
      throw new Error(message);
    }

    const signed = this.extractUrl(await res.text());

    // A function deployed before the kind parameter existed ignores it and
    // answers with the video's URL. Without this guard the replay would try to
    // parse an mp4 as JSONL. Checking here makes deploy order not matter.
    if (kind === 'data' && /\/streams\/generated\.mp4/.test(signed)) {
      throw new Error(
        'No pipeline data for this project: the storage proxy answered with the video.'
      );
    }

    return signed;
  }

  /** Back-compatible alias. The video is still the default kind. */
  static async getVideoUrlForProject(outputVideoId: string): Promise<string> {
    return this.getUrlForProject(outputVideoId, 'video');
  }

  /** What the replay needs to read a pipeline data object. */
  static async getPipelineDataSource(
    outputVideoId: string
  ): Promise<{ url: string; size: number; acceptsRanges: boolean }> {
    const url = `/.netlify/functions/aws-storage?outputVideoId=${encodeURIComponent(
      outputVideoId
    )}&kind=data`;

    const session = await getOptimizedSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(url, { cache: 'no-store', headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let message = `Failed to get pipeline data: ${res.status}`;
      try {
        const err = JSON.parse(body);
        if (err.error) message = err.error;
      } catch {
        if (body) message = body;
      }
      throw new Error(message);
    }

    const payload = await res.json().catch(() => null);

    // A function deployed before this change ignores `kind` and answers with the
    // video's presigned URL, in the Lambda's own shape rather than this
    // envelope. Both checks below catch that, so deploy order does not matter.
    if (
      !payload ||
      typeof payload.url !== 'string' ||
      typeof payload.size !== 'number' ||
      /\/streams\/generated\.mp4/.test(payload.url)
    ) {
      throw new Error(
        'No pipeline data for this project: the storage proxy did not return a data object.'
      );
    }

    return {
      url: payload.url,
      size: payload.size,
      acceptsRanges: Boolean(payload.acceptsRanges),
    };
  }
}
