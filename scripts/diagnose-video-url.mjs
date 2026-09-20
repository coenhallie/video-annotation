#!/usr/bin/env node
/**
 * Diagnose why a video URL is slow to start in one browser and not another.
 *
 * Run against a real presigned pipeline-output URL:
 *   node scripts/diagnose-video-url.mjs '<presigned url>'
 *
 * Reports the four things that decide whether a browser can start playing
 * before the whole file has arrived:
 *
 *  1. Byte ranges. A 206 plus `Accept-Ranges: bytes` is what lets the media
 *     stack read the pieces it needs. A 200 means the object has to be read
 *     whole.
 *  2. `Content-Encoding`. A compressed object makes byte offsets refer to the
 *     encoded stream, so ranges become useless even when the server offers
 *     them.
 *  3. CORS. The player sets `crossorigin="anonymous"`, so every media request
 *     is a CORS request. If the bucket does not allow the `Range` request
 *     header, or does not expose `Content-Range`/`Accept-Ranges`, ranges
 *     cannot be used from the page even though curl sees them working.
 *  4. MP4 layout. `moov` before `mdat` (faststart) lets playback begin after a
 *     few hundred KB. `moov` last means the index is only readable at the end
 *     of the file.
 */

const url = process.argv[2];
const origin = process.argv[3] || 'https://perspecto.ai';

if (!url) {
  console.error('usage: node scripts/diagnose-video-url.mjs <url> [origin]');
  process.exit(1);
}

const label = (name, value) => console.log(`  ${name.padEnd(28)} ${value ?? '(absent)'}`);

async function ranges() {
  console.log('\n== 1/4  byte ranges ==');
  const res = await fetch(url, { headers: { Range: 'bytes=0-1' } });
  const h = res.headers;
  label('status', res.status);
  label('accept-ranges', h.get('accept-ranges'));
  label('content-range', h.get('content-range'));
  label('content-length', h.get('content-length'));
  label('content-type', h.get('content-type'));
  label('content-encoding', h.get('content-encoding'));
  label('cache-control', h.get('cache-control'));
  await res.arrayBuffer();

  if (res.status !== 206) {
    console.log('\n  VERDICT: no range support. The whole object must be downloaded');
    console.log('           before playback can start or seek.');
  } else if (h.get('content-encoding')) {
    console.log('\n  VERDICT: ranges answered, but the object is content-encoded, so byte');
    console.log('           offsets address the encoded stream. Effectively no range support.');
  } else {
    console.log('\n  VERDICT: ranges work at the HTTP level.');
  }
  return res.status === 206;
}

async function cors() {
  console.log('\n== 2/4  CORS (the player sets crossorigin="anonymous") ==');
  const pre = await fetch(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range',
    },
  });
  label('preflight status', pre.status);
  label('allow-origin', pre.headers.get('access-control-allow-origin'));
  label('allow-headers', pre.headers.get('access-control-allow-headers'));
  label('expose-headers', pre.headers.get('access-control-expose-headers'));

  const get = await fetch(url, { headers: { Origin: origin, Range: 'bytes=0-1' } });
  label('GET allow-origin', get.headers.get('access-control-allow-origin'));
  label('GET expose-headers', get.headers.get('access-control-expose-headers'));
  await get.arrayBuffer();

  const allow = (pre.headers.get('access-control-allow-headers') || '').toLowerCase();
  const expose = (get.headers.get('access-control-expose-headers') || '').toLowerCase();
  const rangeAllowed = pre.status < 400 && (allow.includes('range') || allow.includes('*'));
  const rangeExposed = expose.includes('content-range') || expose.includes('*');

  if (!rangeAllowed) {
    console.log('\n  VERDICT: the bucket does not allow the Range request header from this');
    console.log('           origin. A crossorigin video element cannot issue range requests.');
  } else if (!rangeExposed) {
    console.log('\n  VERDICT: Range is allowed but Content-Range is not exposed.');
  } else {
    console.log('\n  VERDICT: CORS permits ranged media requests.');
  }
}

/** Walk the top-level MP4 atoms in a buffer starting at absolute offset `base`. */
function atoms(buf, base = 0) {
  const out = [];
  let p = 0;
  while (p + 8 <= buf.length) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;
    let header = 8;
    if (size === 1) {
      if (p + 16 > buf.length) break;
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    }
    out.push({ type, offset: base + p, size });
    if (size < header) break;
    p += size;
  }
  return out;
}

async function layout(hasRanges) {
  console.log('\n== 3/4  MP4 layout (faststart?) ==');
  if (!hasRanges) {
    console.log('  skipped: cannot read parts of the file without range support.');
    return;
  }
  const head = Buffer.from(
    await (await fetch(url, { headers: { Range: 'bytes=0-65535' } })).arrayBuffer()
  );
  const found = atoms(head);
  for (const a of found) console.log(`  @${String(a.offset).padStart(12)}  ${a.type}  ${a.size} bytes`);

  const moov = found.find((a) => a.type === 'moov');
  const mdat = found.find((a) => a.type === 'mdat');
  if (moov && (!mdat || moov.offset < mdat.offset)) {
    console.log('\n  VERDICT: faststart. moov is at the front, playback can begin early.');
  } else if (mdat) {
    console.log('\n  VERDICT: NOT faststart. moov comes after mdat, so the index lives at');
    console.log('           the end of the file. Every player must fetch the tail first;');
    console.log('           without working ranges it must fetch everything.');
  } else {
    console.log('\n  VERDICT: could not classify from the first 64KB.');
  }
}

async function firstBytesToPlay(hasRanges) {
  console.log('\n== 4/4  time to first bytes ==');
  const t0 = performance.now();
  const res = await fetch(url, hasRanges ? { headers: { Range: 'bytes=0-262143' } } : {});
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const ttfb = performance.now() - t0;
  await reader.cancel();
  label('first chunk after', `${ttfb.toFixed(0)} ms (${value?.length ?? 0} bytes)`);
}

const hasRanges = await ranges();
await cors();
await layout(hasRanges);
await firstBytesToPlay(hasRanges);
console.log('');
