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
 * Netlify lowercases event headers, but nothing in the contract guarantees it,
 * and here a missed header degrades a signed-in caller to anonymous.
 */
function headerValue(headers, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

/**
 * A JWT is three base64url segments. Only the payload's `role` claim is read,
 * and only as a configuration sanity check, so no signature verification is
 * needed or attempted here.
 */
function keyRole(key) {
  try {
    const payload = JSON.parse(
      Buffer.from(String(key).split('.')[1], 'base64url').toString('utf8')
    );
    return payload.role;
  } catch (err) {
    return null;
  }
}

/**
 * Ask the database one question: can this caller see this video?
 *
 * The caller's own credentials are forwarded, so PostgREST verifies the JWT and
 * applies the `videos` SELECT policy. The answer is by construction the same one
 * the app would get, which is why this cannot drift from the rest of the product.
 *
 * There is no signed-in shortcut. `findOrCreateOutputVideo` creates the row
 * before requesting the URL precisely so this check works on first ingest.
 *
 * Returns 'allow', 'deny' or 'error'. Throws only on a network or parse failure,
 * which the caller turns into 502.
 */
async function checkVisibility(outputVideoId, supabaseUrl, anonKey, authHeader) {
  const url =
    supabaseUrl + '/rest/v1/videos?select=id&videoId=eq.aws:' + outputVideoId;
  const ask = (auth) =>
    fetch(url, { headers: { apikey: anonKey, authorization: auth } });

  let res = await ask(authHeader || 'Bearer ' + anonKey);

  // A forged, malformed or expired token makes PostgREST answer 401. Retry as
  // anonymous rather than rejecting, so a share-link viewer whose session lapsed
  // can still play a public video.
  if (!res.ok && authHeader) {
    res = await ask('Bearer ' + anonKey);
  }
  if (!res.ok) return 'error';

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? 'allow' : 'deny';
}

exports.handler = async function (event) {
  const outputVideoId =
    event.queryStringParameters && event.queryStringParameters.outputVideoId;

  if (!outputVideoId || !OUTPUT_VIDEO_ID.test(outputVideoId)) {
    return json(400, { error: 'Missing or invalid outputVideoId parameter' });
  }

  const apiKey = process.env.AWS_STORAGE_API_KEY;
  const lambdaBaseUrl = process.env.AWS_STORAGE_API_URL;

  if (!apiKey || !lambdaBaseUrl) {
    return json(500, {
      error:
        'AWS storage API not configured. Set AWS_STORAGE_API_KEY and AWS_STORAGE_API_URL in Netlify env vars.',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return json(500, {
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify env vars.',
    });
  }

  // A service_role key here would bypass RLS and quietly authorize every
  // request. The two keys sit in the same dashboard panel, both labelled "key".
  if (keyRole(anonKey) !== 'anon') {
    return json(500, {
      error:
        'SUPABASE_ANON_KEY is not an anon key. A service_role key here would bypass RLS.',
    });
  }

  let visibility;
  try {
    visibility = await checkVisibility(
      outputVideoId,
      supabaseUrl,
      anonKey,
      headerValue(event.headers, 'authorization')
    );
  } catch (err) {
    return json(502, { error: 'Authorization check failed: ' + err.message });
  }

  if (visibility === 'error') {
    return json(502, { error: 'Authorization check failed' });
  }
  if (visibility === 'deny') {
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
