import type { RangeFetcher } from '@/lib/pipelineData/jsonlIndex';

/**
 * A JSONL file whose records GROW across its length.
 *
 * Shared by the index and replay tests because it is the shape a real export
 * has and a fixed-width fixture does not. A match starts with hardly anything
 * detected and with the rolling `frame_uuid` window still filling, so its
 * first records are a fraction of the size the rest of the file settles at -
 * measured on a 918 MB export, 1.1 kB at the head against 7.5 kB after the
 * first few percent, and bytes-per-record still varying by a factor of three
 * between later regions.
 *
 * Two things depend on that spread, and a uniform fixture can prove neither:
 *
 *  - the mean record size, which is sampled to decide how many bytes a window
 *    needs in order to hold the seconds it is supposed to hold;
 *  - the seek loop, which interpolates a byte offset from a handful of
 *    (offset, time) entries. Interpolation is exact when every record is the
 *    same width and badly off when they are not, so only a tapered file
 *    exercises the loop's recovery from a miss.
 *
 * Records carry a uniform `dt`, so the record at any time is arithmetic:
 * record `i` is at `t0 + i * dt` and holds frame `startFrame + i`. The taper
 * is in bytes only.
 */
export function taperedFile(opts: {
  count: number;
  fromBytes: number;
  toBytes: number;
  startFrame?: number;
  t0?: number;
  dt?: number;
}): string {
  const { count, fromBytes, toBytes } = opts;
  const startFrame = opts.startFrame ?? 457;
  const t0 = opts.t0 ?? 1208.4;
  const dt = opts.dt ?? 0.04;

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const width = Math.round(
      fromBytes + ((toBytes - fromBytes) * i) / Math.max(1, count - 1)
    );
    const body: Record<string, unknown> = {
      match_id: 1,
      teams: [{ team_id: 0, players: [], actions: [] }],
      balls: [],
      state: { actions: [] },
      frame_data: [
        {
          frame_count: startFrame + i,
          frame_uuid: [
            { timestamp: Number((t0 + i * dt).toFixed(4)), uuid: 'x' },
          ],
        },
      ],
      pad: '',
    };
    body.pad = 'p'.repeat(Math.max(0, width - JSON.stringify(body).length));
    lines.push(JSON.stringify(body));
  }
  return lines.join('\n');
}

/** The record index a replay time resolves to in a `taperedFile`. */
export function recordAtTime(
  time: number,
  opts: { count: number; dt?: number }
): number {
  const dt = opts.dt ?? 0.04;
  return Math.min(opts.count - 1, Math.floor(time / dt + 1e-9));
}

export function fetcherFor(text: string, acceptsRanges = true): RangeFetcher {
  return {
    async head() {
      return { size: text.length, acceptsRanges };
    },
    async range(start: number, endInclusive: number) {
      return text.slice(start, endInclusive + 1);
    },
  };
}

/**
 * A JSONL file built from alternating BANDS of equal byte size, whose records
 * are wide in one band and narrow in the next.
 *
 * `taperedFile` varies record width smoothly, which turns out not to disturb
 * the index's interpolation much: any two entries bracketing a target are
 * close enough together that the width barely changes between them, so the
 * estimate stays good. A real export is not smooth. Whole stretches of it
 * hold far fewer detections than their neighbours - on a 918 MB one, equal
 * 102 MB spans covered anywhere between 576 and 1598 seconds - so time per
 * byte changes in steps, and an estimate interpolated across such a step is
 * out by megabytes.
 *
 * Bands hold equal BYTES rather than equal records, because that is what
 * makes time per byte lumpy: a narrow-record band packs many times more
 * seconds into its share of the file than a wide-record band does.
 *
 * Records still carry a uniform `dt`, so the record at any time stays
 * arithmetic - see `recordAtTime`.
 */
export function bandedFile(opts: {
  bands: number;
  bandBytes: number;
  narrowBytes: number;
  wideBytes: number;
  startFrame?: number;
  t0?: number;
  dt?: number;
}): string {
  const startFrame = opts.startFrame ?? 457;
  const t0 = opts.t0 ?? 1208.4;
  const dt = opts.dt ?? 0.04;

  const lines: string[] = [];
  let i = 0;
  for (let band = 0; band < opts.bands; band++) {
    // Band 0 is narrow, so the head sample - which is where the mean record
    // size gets measured - sees only the file's smallest records.
    const width = band % 2 === 0 ? opts.narrowBytes : opts.wideBytes;
    const records = Math.max(1, Math.round(opts.bandBytes / width));
    for (let n = 0; n < records; n++, i++) {
      const body: Record<string, unknown> = {
        match_id: 1,
        teams: [{ team_id: 0, players: [], actions: [] }],
        balls: [],
        state: { actions: [] },
        frame_data: [
          {
            frame_count: startFrame + i,
            frame_uuid: [
              { timestamp: Number((t0 + i * dt).toFixed(4)), uuid: 'x' },
            ],
          },
        ],
        pad: '',
      };
      body.pad = 'p'.repeat(Math.max(0, width - JSON.stringify(body).length));
      lines.push(JSON.stringify(body));
    }
  }
  return lines.join('\n');
}
