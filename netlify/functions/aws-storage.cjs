// Netlify Function (v1 format): proxies requests to the AWS Lambda storage API.
// Using .cjs + exports.handler for maximum compatibility.
exports.handler = async function (event) {
  const filepath = event.queryStringParameters && event.queryStringParameters.filepath;

  if (!filepath) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Missing filepath parameter' }),
    };
  }

  const apiKey = process.env.AWS_STORAGE_API_KEY;
  const lambdaBaseUrl = process.env.AWS_STORAGE_API_URL;

  if (!apiKey || !lambdaBaseUrl) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        error: 'AWS storage API not configured. Set AWS_STORAGE_API_KEY and AWS_STORAGE_API_URL in Netlify env vars.',
      }),
    };
  }

  const encodedFilepath = encodeURIComponent(filepath);
  const targetUrl = lambdaBaseUrl + '/api/v1/storage/' + encodedFilepath + '/no-redirect';

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
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ error: 'Proxy error: ' + err.message }),
    };
  }
};
