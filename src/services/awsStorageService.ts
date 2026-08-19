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
   * Get a presigned video URL for a pipeline project.
   *
   * Sends the project id, not a path: the Netlify Function builds the storage
   * path itself so no caller can name an arbitrary object. See
   * docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md.
   */
  static async getVideoUrlForProject(outputVideoId: string): Promise<string> {
    const url = `/.netlify/functions/aws-storage?outputVideoId=${encodeURIComponent(outputVideoId)}`;

    const res = await fetch(url, { cache: 'no-store' });

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

    const text = await res.text();
    return this.extractUrl(text);
  }
}
