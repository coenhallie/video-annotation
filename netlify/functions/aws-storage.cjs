// Netlify Function (v1 format): proxies requests to the AWS Lambda storage API.
// Using .cjs + exports.handler for maximum compatibility.
//
// The caller names a pipeline project, never a storage path. Accepting a
// caller-supplied filepath let anyone with the endpoint fetch any object the
// Lambda's API key could reach.
//
// Design: docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md

// An allowlist, not a blacklist: this excludes '/', '..', '%' and every other
// path-bearing character by construction. Every aws:* video id in the database
// is a UUID, so this rejects no valid id.
const OUTPUT_VIDEO_ID = /^[A-Za-z0-9_-]+$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/**
 * Decide whether this caller may fetch the given project's video.
 *
 * A verified Supabase session is allowed outright: every signed-in user can
 * already see every video, and the ingest path fetches the presigned URL before
 * the `videos` row exists, so a lookup-for-everyone rule would break it.
 *
 * Everyone else must resolve to a `videos` row that RLS lets the anon role read,
 * which is exactly "public, or inside a public comparison". Delegating to the
 * policy means this cannot drift from the rest of the app.
 */
async function isAuthorized(event, outputVideoId, supabaseUrl, anonKey) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';

  // The header must be VERIFIED, not merely present. Trusting its presence would
  // let any caller send `Authorization: Bearer anything` and be waved through,
  // which is the hole this function exists to close.
  if (authHeader.startsWith('Bearer ')) {
    const verified = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: anonKey, authorization: authHeader },
    });
    if (verified.ok) return true;
    // Absent, malformed, expired or forged: fall through to the anonymous check
    // rather than returning 401, so a share-link viewer whose session lapsed can
    // still play a public video.
  }

  const lookup = await fetch(
    supabaseUrl +
      '/rest/v1/videos?select=id&videoId=eq.aws:' +
      outputVideoId,
    { headers: { apikey: anonKey, authorization: 'Bearer ' + anonKey } }
  );
  if (!lookup.ok) return false;

  const rows = await lookup.json();
  return Array.isArray(rows) && rows.length > 0;
}

exports.handler = async function (event) {
  const outputVideoId =
    event.queryStringParameters && event.queryStringParameters.outputVideoId;

  if (!outputVideoId || !OUTPUT_VIDEO_ID.test(outputVideoId)) {
    return json(400, { error: 'Missing or invalid outputVideoId parameter' });
  }

  const apiKey = process.env.AWS_STORAGE_API_KEY;
  const lambdaBaseUrl = process.env.AWS_STORAGE_API_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !lambdaBaseUrl) {
    return json(500, {
      error:
        'AWS storage API not configured. Set AWS_STORAGE_API_KEY and AWS_STORAGE_API_URL in Netlify env vars.',
    });
  }

  if (!supabaseUrl || !anonKey) {
    return json(500, {
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify env vars.',
    });
  }

  if (!(await isAuthorized(event, outputVideoId, supabaseUrl, anonKey))) {
    return json(403, { error: 'Not authorized for this video' });
  }

  // Built here from a validated id. Never taken from the caller.
  const filepath = 'pipeline-output/' + outputVideoId + '/streams/generated.mp4';
  const targetUrl =
    lambdaBaseUrl + '/api/v1/storage/' + encodeURIComponent(filepath) + '/no-redirect';

  try {
    const res = await fetch(targetUrl, {
      headers: { 'x-api-key': apiKey },
    });

    const body = await res.text();

    return {
      statusCode: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
      },
      body: body,
    };
  } catch (err) {
    return json(502, { error: 'Proxy error: ' + err.message });
  }
};
