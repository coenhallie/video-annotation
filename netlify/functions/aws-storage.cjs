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

// The caller names a kind, never a path. `video` is fixed in code because it has
// never moved. `data` is deployment configuration (AWS_PIPELINE_DATA_KEY) so the
// frontend can ship before the pipeline team confirms the key, and start working
// the moment the variable is set. Either way the id substituted below is the
// regex-validated one, so no caller can reach an object of their choosing.
const KINDS = ['video', 'data'];

function keyFor(kind, outputVideoId) {
  if (kind === 'video') {
    return 'pipeline-output/' + outputVideoId + '/streams/generated.mp4';
  }
  const template = process.env.AWS_PIPELINE_DATA_KEY;
  if (!template) return null;
  return template.split('{id}').join(outputVideoId);
}

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
 * applies the `videos` SELECT policy. For a row that exists, the answer this
 * produces matches the app's own rule and cannot drift from it.
 *
 * That is weaker than "authorized" sounds, though: the row itself is
 * caller-creatable. `findOrCreateOutputVideo` creates it before requesting the
 * URL, precisely so this check passes on first ingest - but that means any
 * signed-in caller who knows an outputVideoId can create the row this function
 * then finds visible. There is no signed-in shortcut in this function, but the
 * effective rule enforced end-to-end is "a session plus knowledge of the id",
 * not verified ownership. See
 * docs/superpowers/specs/2026-08-19-aws-proxy-auth-design.md sections 5 and 11.
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
  //
  // Deliberately narrow to 401, not any non-ok status: a transient 5xx during a
  // legitimate first ingest would otherwise retry as anonymous, get an empty
  // result, and 403 the video's own owner - who the client then reacts to by
  // deleting the row it just created. Any other non-ok falls through to 'error'
  // below, which is the truthful answer for a real failure.
  if (res.status === 401 && authHeader) {
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

  const kind =
    (event.queryStringParameters && event.queryStringParameters.kind) || 'video';

  if (!KINDS.includes(kind)) {
    return json(400, { error: 'Invalid kind parameter' });
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
  //
  // keyRole only understands the legacy JWT-format key (three base64url segments
  // with a `role` claim). Supabase's newer sb_publishable_*/sb_secret_* keys are
  // not JWTs, so a correctly configured publishable key also returns null here.
  // The message below says so explicitly rather than only naming the
  // service_role case, so whoever hits this is not sent looking for the wrong
  // problem.
  if (keyRole(anonKey) !== 'anon') {
    return json(500, {
      error:
        'SUPABASE_ANON_KEY must be a JWT-format anon key (a sb_publishable_* key is not a JWT and will fail this check). A service_role key here would bypass RLS and must not be used either.',
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
    // The detail (a DNS or TLS failure message, for example) is not for the end
    // user: it is parsed out by awsStorageService, rethrown, and rendered in a
    // notifyError toast by EditorView. Log it server-side and return a generic
    // message instead.
    console.error('Authorization check failed:', err);
    return json(502, { error: 'Authorization check failed' });
  }

  // Fail closed by construction: only an explicit 'allow' reaches the Lambda.
  // Any future return value, early return, or refactor slip lands on deny
  // rather than silently falling through to an allow.
  if (visibility !== 'allow') {
    return json(visibility === 'error' ? 502 : 403, {
      error:
        visibility === 'error'
          ? 'Authorization check failed'
          : 'Not authorized for this video',
    });
  }

  // Built here from a validated id. Never taken from the caller.
  const filepath = keyFor(kind, outputVideoId);
  if (!filepath) {
    return json(501, {
      error:
        'Pipeline data is not configured. Set AWS_PIPELINE_DATA_KEY in Netlify env vars to the object key template, using {id} for the pipeline id.',
    });
  }
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
    // Same reasoning as the authorization-check catch above: the detail (a DNS
    // or TLS failure message, for example) is not for the end user. It is
    // parsed out by awsStorageService, rethrown, and rendered in a notifyError
    // toast by EditorView. Log it server-side and return a generic message
    // instead. 'Storage request failed' rather than 'Proxy error' so the
    // message does not even reveal that a proxy is involved.
    console.error('Storage request failed:', err);
    return json(502, { error: 'Storage request failed' });
  }
};
