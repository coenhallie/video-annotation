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
