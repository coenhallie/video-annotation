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
   * Get a presigned URL for the pipeline's video object.
   *
   * Sends the project id, not a path: the Netlify Function builds the storage
   * key itself so no caller can name an arbitrary object. See
   * docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md.
   *
   * Pipeline data (the frame JSONL) is not served through this method: for
   * kind=data the function returns a `{url, size, acceptsRanges}` envelope
   * rather than a bare URL, because the browser cannot learn those two fields
   * on its own (see getPipelineDataSource below). Use that method instead.
   */
  static async getUrlForProject(outputVideoId: string): Promise<string> {
    const url = `/.netlify/functions/aws-storage?outputVideoId=${encodeURIComponent(outputVideoId)}`;

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

    return this.extractUrl(await res.text());
  }

  /** Back-compatible alias, kept for its two existing call sites. */
  static async getVideoUrlForProject(outputVideoId: string): Promise<string> {
    return this.getUrlForProject(outputVideoId);
  }

  /**
   * What the replay needs to read a pipeline data object, or `null` when
   * there plainly is no pipeline data for this project - as opposed to a
   * genuine transport failure, which still throws.
   *
   * The no-data family, none of which is an error worth showing:
   *  - 501: `AWS_PIPELINE_DATA_KEY` is not configured.
   *  - 404: the Lambda answered "object not found", proxied through as-is.
   *  - 502 with `noData: true`: the function's own probe of the presigned
   *    URL could not reach the object (see aws-storage.cjs). Distinguished
   *    from the function's other 502s - auth-check failure, an unusable
   *    Lambda response, a genuine request failure - by that explicit field,
   *    never by the message text.
   *  - a response in the envelope shape but missing `url`/`size`, or naming
   *    the video file rather than a data object: an old deployment that
   *    ignored `kind` and answered with the video's presigned URL instead.
   *
   * Everything else - the fetch itself rejecting, or a 5xx that is not the
   * unreachable-object case - throws, and the caller should show it as a
   * real error.
   */
  static async getPipelineDataSource(
    outputVideoId: string
  ): Promise<{ url: string; size: number; acceptsRanges: boolean } | null> {
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

      if (res.status === 404 || res.status === 501) return null;
      if (res.status === 502) {
        try {
          const err = JSON.parse(body);
          if (err && err.noData === true) return null;
        } catch {
          // Not JSON. Fall through to the generic-failure handling below.
        }
      }

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
    // Treated as no data rather than an error: an old deployment answering
    // with the video URL is functionally the same as there being no
    // pipeline data object yet.
    if (
      !payload ||
      typeof payload.url !== 'string' ||
      typeof payload.size !== 'number' ||
      /\/streams\/generated\.mp4/.test(payload.url)
    ) {
      return null;
    }

    return {
      url: payload.url,
      size: payload.size,
      acceptsRanges: Boolean(payload.acceptsRanges),
    };
  }
}
