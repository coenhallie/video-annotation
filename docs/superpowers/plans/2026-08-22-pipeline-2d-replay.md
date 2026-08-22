# 2D Pipeline Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the editor's Pipeline output tab with a 2D top-down pitch that replays the pipeline's per-frame JSONL, with its own playback clock, driven by the editor's existing timeline.

**Architecture:** A vendored dependency-free 2D canvas renderer draws one frame at a time. A range-request loader builds a sparse byte-offset index over the JSONL so seeking never loads the whole file. A replay composable exposes the same shape the video player exposes, so `EditorView` binds the one existing `VideoTimeline` to whichever surface is active. The two clocks are deliberately independent and never synchronised.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, plain `<canvas>` 2D (no new npm dependencies), Vitest with per-file `// @vitest-environment jsdom` where a DOM is needed, Netlify Functions (CommonJS `.cjs`).

**Spec:** `docs/superpowers/specs/2026-08-22-pipeline-2d-replay-design.md`

## Global Constraints

- **No new npm dependencies.** The 2D path is plain canvas. Nothing is added to `package.json`.
- **No em dashes** in any prose, comment, commit message, or copy. Use a plain dash.
- **No agent attribution** in commit messages. No `Co-Authored-By` trailer, no generated-with footer.
- **Tests run with `npm test`** (`vitest run`). Default environment is `node`; add `// @vitest-environment jsdom` as the first line of any test file needing a DOM.
- **Test file locations follow the existing convention:** `src/<area>/__tests__/<name>.test.ts`, `netlify/functions/__tests__/<name>.test.ts`.
- **The `@` alias maps to `src/`** in both `vite.config.js` and `vitest.config.ts`.
- **`vite.config.js` sets `esbuild.drop: ['console', 'debugger']`.** Console logging is stripped from every build including dev. Never rely on it for user-visible behaviour.
- **The storage proxy must never accept a caller-supplied path.** Every object key is built server-side from the regex-validated `outputVideoId`. This is a security property of `netlify/functions/aws-storage.cjs`; preserve it.
- **Replay time is relative to the first record in the file.** Neither `frame_count` nor the record timestamp is zero-based.

## Amendment to the spec

The spec says `KIND_SUFFIX.data` is a hard-coded constant holding the JSONL suffix, and names that string as the one outstanding external input.

This plan replaces it with a Netlify environment variable, `AWS_PIPELINE_DATA_KEY`, holding a full key template such as `pipeline-output/{id}/data/{id}.jsonl`. The function substitutes `{id}` with the validated id and nothing else, so the security property is unchanged: the caller still names only an id, never a path.

Why: the key is deployment configuration, exactly like the existing `AWS_STORAGE_API_URL`. Making it configuration means every task below is implementable now, and the feature starts working the moment the variable is set, with no code change. When the variable is unset, `kind=data` answers 501 and the tab shows its "no data" state, which is the correct behaviour for every project that has no pipeline data anyway.

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/lib/vis/types.ts` | Frame/team/player/ball/pitch type definitions. Vendored. |
| `src/lib/vis/constants.ts` | 2D canvas constants only. Vendored and trimmed. |
| `src/lib/vis/pitchGeometry.ts` | World metres to canvas pixels, cached pitch background. Vendored. |
| `src/lib/vis/useColorResolver.ts` | Team colour arrays to CSS colours. Vendored. |
| `src/lib/vis/useRenderer2D.ts` | Draws one frame onto a canvas. Vendored. |
| `src/lib/pipelineData/frameWindow.ts` | Bytes to replay records. Pure. |
| `src/lib/pipelineData/jsonlIndex.ts` | Sparse byte-offset index over the JSONL. Pure. |
| `src/lib/pipelineData/rangeFetcher.ts` | HTTP range reads against a presigned URL. |
| `src/composables/usePipelineReplay.ts` | The replay playback source. |
| `src/components/PipelineOutputSurface.vue` | Canvas, zoom/pan, HUD, and the four states. |

**Modify:**

| Path | Change |
| --- | --- |
| `netlify/functions/aws-storage.cjs:170-172` | `kind` parameter selecting a server-built key. |
| `src/services/awsStorageService.ts` | `getUrlForProject(id, kind)`, suffix guard. |
| `src/services/videoService.ts:627,723` | Call-site rename. |
| `src/views/EditorView.vue:1365,1645,1674-1690` | Symmetric pause, mount the surface, bind the timeline. |

**Test:**

`src/lib/vis/__tests__/pitchGeometry.test.ts`, `src/lib/vis/__tests__/colorResolver.test.ts`, `src/lib/pipelineData/__tests__/frameWindow.test.ts`, `src/lib/pipelineData/__tests__/jsonlIndex.test.ts`, `src/composables/__tests__/usePipelineReplay.test.ts`, `src/components/__tests__/pipelineOutputSurface.test.ts`, `src/services/__tests__/awsStorageKind.test.ts`, and additions to `netlify/functions/__tests__/aws-storage.test.ts`.

---

### Task 1: Vendor the 2D renderer

The renderer already exists, fully working, in a sibling repository. This task copies it and trims the 3D half out of its constants. It is a copy, not a rewrite: do not restructure it.

**Files:**
- Create: `src/lib/vis/types.ts`, `src/lib/vis/constants.ts`, `src/lib/vis/pitchGeometry.ts`, `src/lib/vis/useColorResolver.ts`, `src/lib/vis/useRenderer2D.ts`
- Test: `src/lib/vis/__tests__/pitchGeometry.test.ts`, `src/lib/vis/__tests__/colorResolver.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Frame`, `Team`, `Player`, `Ball`, `PitchDimensions`, `TeamColors`, `Transform2D` types from `@/lib/vis/types`
  - `build2DTransform(pd?: Partial<PitchDimensions>): Transform2D`
  - `worldToPx(x: number, y: number, t: Transform2D): [number, number]`
  - `buildPitchCache(pd, t): OffscreenCanvas`
  - `resolveTeamColors(team: Team, teamId: number): TeamColors`
  - `useRenderer2D(canvas: HTMLCanvasElement): { renderFrame(frame: Frame): void; invalidateCache(): void }`
  - `FRAME_W = 1280`, `FRAME_H = 720`, `PITCH_MARGIN = 40`, `LINE_COLOR = '#ffffff'`, `PLAYER_RADIUS = 12`

- [ ] **Step 1: Copy the five source files**

```bash
SRC=~/Desktop/projects/datalabelling-frontend/src/lib/vis
mkdir -p src/lib/vis/__tests__
cp "$SRC/types.ts" "$SRC/constants.ts" "$SRC/pitchGeometry.ts" \
   "$SRC/useColorResolver.ts" "$SRC/useRenderer2D.ts" src/lib/vis/
```

- [ ] **Step 2: Replace `src/lib/vis/constants.ts` with the 2D-only version**

The copied file carries GLB and HDR model URLs, camera-follow distances, animation speed thresholds and cylinder-fallback dimensions. None of that is reachable from the 2D renderer, and shipping it would leave dead references to asset files this repository does not have. Replace the whole file with:

```ts
// ---------------------------------------------------------------------------
// 2D canvas constants.
//
// Vendored from datalabelling-frontend/src/lib/vis/constants.ts, trimmed to the
// 2D half. The 3D model URLs, camera-follow distances, animation thresholds and
// cylinder-fallback dimensions are deliberately not carried across: this
// repository renders 2D only and has none of the GLB/HDR assets they name.
// ---------------------------------------------------------------------------

/** Internal canvas width in pixels. */
export const FRAME_W = 1280
/** Internal canvas height in pixels. */
export const FRAME_H = 720
/** Margin (px) between canvas edge and pitch outline. */
export const PITCH_MARGIN = 40
/** Colour used for pitch markings. */
export const LINE_COLOR = '#ffffff'
/** Radius (px) of a player circle on the 2D canvas. */
export const PLAYER_RADIUS = 12
```

- [ ] **Step 3: Add the origin header to the other four files**

Insert this as the first line of `types.ts`, `pitchGeometry.ts`, `useColorResolver.ts` and `useRenderer2D.ts`, above the existing comment block:

```ts
// Vendored from datalabelling-frontend/src/lib/vis/ on 2026-08-22. Keep edits
// minimal so the two copies stay diffable.
```

- [ ] **Step 4: Write the failing geometry test**

Create `src/lib/vis/__tests__/pitchGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { build2DTransform, worldToPx } from '@/lib/vis/pitchGeometry';
import { FRAME_W, FRAME_H } from '@/lib/vis/constants';

const FULL = { length: 105, width: 68 };

describe('build2DTransform', () => {
  it('centres the pitch on the canvas', () => {
    const t = build2DTransform(FULL);
    const [cx, cy] = worldToPx(0, 0, t);
    expect(cx).toBeCloseTo(FRAME_W / 2, 5);
    expect(cy).toBeCloseTo(FRAME_H / 2, 5);
  });

  it('falls back to FIFA standard dimensions when none are given', () => {
    expect(build2DTransform(undefined).pl).toBe(105);
    expect(build2DTransform(undefined).pw).toBe(68);
  });

  it('keeps both pitch ends inside the canvas', () => {
    const t = build2DTransform(FULL);
    const [left] = worldToPx(-FULL.length / 2, 0, t);
    const [right] = worldToPx(FULL.length / 2, 0, t);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(FRAME_W);
  });

  it('scales x and y by the same factor', () => {
    const t = build2DTransform(FULL);
    const [x0, y0] = worldToPx(0, 0, t);
    const [x1] = worldToPx(10, 0, t);
    const [, y1] = worldToPx(0, 10, t);
    expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 5);
  });
});
```

- [ ] **Step 5: Write the failing colour-resolver test**

Create `src/lib/vis/__tests__/colorResolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTeamColors } from '@/lib/vis/useColorResolver';
import type { Team } from '@/lib/vis/types';

const team = (over: Partial<Team> = {}): Team =>
  ({ team_id: 0, players: [], ...over }) as Team;

describe('resolveTeamColors', () => {
  it('returns CSS colour strings and an rgb tuple', () => {
    const c = resolveTeamColors(
      team({ ordered_colors: [[232, 205, 204], [207, 112, 129], [137, 54, 57]] }),
      0
    );
    expect(typeof c.fill).toBe('string');
    expect(typeof c.outline).toBe('string');
    expect(typeof c.text).toBe('string');
    expect(c.fillRgb).toHaveLength(3);
  });

  it('returns a usable set for a team carrying no colour data', () => {
    const c = resolveTeamColors(team(), 1);
    expect(c.fill).toBeTruthy();
    expect(c.outline).toBeTruthy();
    expect(c.fillRgb.every((n) => n >= 0 && n <= 255)).toBe(true);
  });

  it('gives the two teams different fills when neither carries colours', () => {
    expect(resolveTeamColors(team(), 0).fill).not.toBe(
      resolveTeamColors(team(), 1).fill
    );
  });
});
```

- [ ] **Step 6: Run both tests**

Run: `npm test -- src/lib/vis`
Expected: PASS. The implementation is already complete, so these are characterisation tests over vendored code. If `resolveTeamColors` fails the third case, read the copied implementation and correct the test's expectation to match actual behaviour rather than changing the vendored file.

- [ ] **Step 7: Typecheck**

Run: `npx vue-tsc --noEmit`
Expected: no errors from `src/lib/vis/`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/vis
git commit -m "feat: vendor the 2D pitch renderer

Copied from datalabelling-frontend/src/lib/vis. Only the 2D path comes
across, so constants.ts is trimmed to its 2D half: the GLB/HDR URLs and
camera constants name assets this repository does not have.

Zero npm dependencies - this is plain canvas 2D."
```

---

### Task 2: Parse a byte range into replay records

**Files:**
- Create: `src/lib/pipelineData/frameWindow.ts`
- Test: `src/lib/pipelineData/__tests__/frameWindow.test.ts`

**Interfaces:**
- Consumes: `Frame` from `@/lib/vis/types` (Task 1).
- Produces:
  - `interface ReplayRecord { frameCount: number; t: number; frame: Frame }`
  - `readRecord(line: string): ReplayRecord | null`
  - `parseWindow(text: string, opts: { startsAtBof: boolean; endsAtEof: boolean }): ReplayRecord[]`

**Why the two flags.** A range taken from the middle of the file begins and ends mid-record, and both partial fragments must be discarded. A range taken from the start of the file has a complete first record; a range taken to the end of the file has a complete last record, which may or may not carry a trailing newline. Discarding unconditionally is the bug that makes the index's duration come out one frame short.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pipelineData/__tests__/frameWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readRecord, parseWindow } from '@/lib/pipelineData/frameWindow';

function record(frameCount: number, t: number, extra: object = {}) {
  return JSON.stringify({
    match_id: 1,
    pitch_dimensions: { length: 105, width: 68 },
    teams: [{ team_id: 0, players: [], actions: [] }],
    balls: [],
    state: { actions: [] },
    frame_data: [
      {
        frame_count: frameCount,
        frame_uuid: [
          { timestamp: t, uuid: 'a' },
          { timestamp: t + 0.04, uuid: 'b' },
        ],
      },
    ],
    ...extra,
  });
}

const WHOLE = { startsAtBof: true, endsAtEof: true };
const MIDDLE = { startsAtBof: false, endsAtEof: false };

describe('readRecord', () => {
  it('reads frame count and timestamp', () => {
    const r = readRecord(record(457, 1208.44));
    expect(r?.frameCount).toBe(457);
    expect(r?.t).toBeCloseTo(1208.44, 5);
  });

  it('unwraps a { match: ... } envelope', () => {
    const wrapped = JSON.stringify({ match: JSON.parse(record(12, 5)) });
    expect(readRecord(wrapped)?.frameCount).toBe(12);
  });

  it('drops frame_uuid from the retained frame but keeps frame_count', () => {
    const r = readRecord(record(9, 1));
    expect(r?.frame.frame_data?.[0]).toEqual({ frame_count: 9 });
  });

  it('returns null for malformed JSON', () => {
    expect(readRecord('{ not json')).toBeNull();
  });

  it('returns null when the record carries no frame_data', () => {
    expect(readRecord(JSON.stringify({ teams: [] }))).toBeNull();
  });
});

describe('parseWindow', () => {
  it('keeps every record of a whole file', () => {
    const text = [record(1, 10), record(2, 10.04), record(3, 10.08)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2, 3]);
  });

  it('keeps the final record when the range ends at EOF without a newline', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('keeps the final record when the range ends at EOF with a trailing newline', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\n') + '\n';
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('discards both partial fragments of a mid-file range', () => {
    const text = 'ount": 99}]}\n' + record(2, 10.04) + '\n' + '{"match_id": 1, "fra';
    expect(parseWindow(text, MIDDLE).map((r) => r.frameCount)).toEqual([2]);
  });

  it('keeps the first record when the range starts at BOF', () => {
    const text = record(1, 10) + '\n' + record(2, 10.04) + '\n{"partial';
    const opts = { startsAtBof: true, endsAtEof: false };
    expect(parseWindow(text, opts).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('skips a malformed line without dropping its neighbours', () => {
    const text = [record(1, 10), '{ broken', record(3, 10.08)].join('\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 3]);
  });

  it('handles CRLF line endings', () => {
    const text = [record(1, 10), record(2, 10.04)].join('\r\n');
    expect(parseWindow(text, WHOLE).map((r) => r.frameCount)).toEqual([1, 2]);
  });

  it('returns an empty array for a range holding no complete record', () => {
    expect(parseWindow('no newline here at all', MIDDLE)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- frameWindow`
Expected: FAIL, cannot resolve `@/lib/pipelineData/frameWindow`.

- [ ] **Step 3: Implement**

Create `src/lib/pipelineData/frameWindow.ts`:

```ts
import type { Frame } from '@/lib/vis/types';

/** One JSONL record, reduced to what the replay and the renderer need. */
export interface ReplayRecord {
  /** The pipeline's own frame number. Not zero-based. */
  frameCount: number;
  /** Absolute record timestamp in seconds. Not zero-based. */
  t: number;
  /** The frame handed to the renderer. */
  frame: Frame;
}

/**
 * Read one JSONL line.
 *
 * Two shapes reach this. The stored file holds bare frames; the live socket
 * wraps them as `{ match: ... }` (see DataOutputView.vue:582 in
 * datalabelling-frontend). Accept both so one parser serves either source.
 *
 * `frame_uuid` is dropped from the retained frame. It is a rolling window of
 * nine `{timestamp, uuid}` entries per record, it is the single largest field,
 * and the renderer never reads it. The first entry's timestamp is lifted out as
 * `t` before it goes.
 */
export function readRecord(line: string): ReplayRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const envelope = parsed as { match?: unknown };
  const frame = (envelope.match ?? parsed) as Frame;

  const meta = frame.frame_data?.[0] as
    | { frame_count?: number; frame_uuid?: { timestamp?: number }[] }
    | undefined;
  if (!meta || typeof meta.frame_count !== 'number') return null;

  const t = meta.frame_uuid?.[0]?.timestamp;
  if (typeof t !== 'number') return null;

  return {
    frameCount: meta.frame_count,
    t,
    frame: { ...frame, frame_data: [{ frame_count: meta.frame_count }] },
  };
}

/**
 * Parse a byte range into records.
 *
 * A range from the middle of the file starts and ends mid-record, and both
 * fragments have to go. The flags say which ends are real boundaries: without
 * `endsAtEof`, reading the tail of the file to find its last record silently
 * returns the second-to-last one instead.
 */
export function parseWindow(
  text: string,
  opts: { startsAtBof: boolean; endsAtEof: boolean }
): ReplayRecord[] {
  const lines = text.split('\n');

  if (!opts.startsAtBof) lines.shift();
  if (!opts.endsAtEof) lines.pop();

  const out: ReplayRecord[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const record = readRecord(line);
    if (record) out.push(record);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- frameWindow`
Expected: PASS, all thirteen cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipelineData/frameWindow.ts src/lib/pipelineData/__tests__/frameWindow.test.ts
git commit -m "feat: parse a JSONL byte range into replay records

The endsAtEof flag is load-bearing. A mid-file range ends in a partial
record that must be dropped, but the file's final range does not: its last
line is a real record. Dropping unconditionally makes the index report a
duration one frame short."
```

---

### Task 3: Build a sparse index over the JSONL

**Files:**
- Create: `src/lib/pipelineData/jsonlIndex.ts`
- Test: `src/lib/pipelineData/__tests__/jsonlIndex.test.ts`

**Interfaces:**
- Consumes: `ReplayRecord`, `parseWindow` from Task 2.
- Produces:
  - `interface IndexEntry { offset: number; frameCount: number; t: number }`
  - `interface RangeFetcher { head(): Promise<{ size: number; acceptsRanges: boolean }>; range(start: number, endInclusive: number): Promise<string> }`
  - `interface JsonlIndex { size: number; acceptsRanges: boolean; first: IndexEntry; last: IndexEntry; meanRecordBytes: number; entries: IndexEntry[] }`
  - `buildIndex(fetcher: RangeFetcher, probes?: number): Promise<JsonlIndex>`
  - `estimateOffset(index: JsonlIndex, t: number): number`
  - `insertEntry(index: JsonlIndex, entry: IndexEntry): void`
  - `PROBE_BYTES = 65536`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pipelineData/__tests__/jsonlIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildIndex,
  estimateOffset,
  insertEntry,
  type RangeFetcher,
  type JsonlIndex,
} from '@/lib/pipelineData/jsonlIndex';

/** A file of `count` records, each padded to a fixed width so offsets are exact. */
function fakeFile(count: number, startFrame = 457, t0 = 1208.4, dt = 0.04) {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const body = {
      match_id: 1,
      teams: [{ team_id: 0, players: [], actions: [] }],
      balls: [],
      state: { actions: [] },
      frame_data: [
        {
          frame_count: startFrame + i,
          frame_uuid: [{ timestamp: Number((t0 + i * dt).toFixed(4)), uuid: 'x' }],
        },
      ],
      pad: '',
    };
    let line = JSON.stringify(body);
    // Pad every record to exactly 400 bytes so byte offsets are predictable.
    const padding = 400 - line.length;
    body.pad = 'p'.repeat(Math.max(0, padding));
    line = JSON.stringify(body);
    lines.push(line);
  }
  return lines.join('\n');
}

function fetcherFor(text: string, acceptsRanges = true): RangeFetcher {
  return {
    async head() {
      return { size: text.length, acceptsRanges };
    },
    async range(start: number, endInclusive: number) {
      return text.slice(start, endInclusive + 1);
    },
  };
}

describe('buildIndex', () => {
  it('reads the first and last record', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457 + 499);
  });

  it('reports a duration spanning the whole file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.last.t - index.first.t).toBeCloseTo(499 * 0.04, 3);
  });

  it('keeps entries sorted by offset', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    const offsets = index.entries.map((e) => e.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it('measures a plausible mean record size', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(index.meanRecordBytes).toBeGreaterThan(300);
    expect(index.meanRecordBytes).toBeLessThan(500);
  });

  it('handles a single-record file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(1)));
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457);
    expect(index.last.t - index.first.t).toBe(0);
  });

  it('reports when ranges are unsupported', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(50), false));
    expect(index.acceptsRanges).toBe(false);
    expect(index.first.frameCount).toBe(457);
    expect(index.last.frameCount).toBe(457 + 49);
  });
});

describe('estimateOffset', () => {
  it('returns the first offset for the start of the file', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(estimateOffset(index, index.first.t)).toBe(index.first.offset);
  });

  it('lands within one window of the true offset mid-file', async () => {
    const text = fakeFile(500);
    const index = await buildIndex(fetcherFor(text));
    const target = index.first.t + 250 * 0.04;
    const guess = estimateOffset(index, target);
    expect(Math.abs(guess - 250 * 400)).toBeLessThan(20 * 400);
  });

  it('clamps a target past the end to the last known offset', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    expect(estimateOffset(index, index.last.t + 1000)).toBeLessThanOrEqual(
      index.last.offset
    );
  });
});

describe('insertEntry', () => {
  it('keeps the entry list sorted and makes later estimates better', async () => {
    const index: JsonlIndex = await buildIndex(fetcherFor(fakeFile(500)));
    const truth = { offset: 250 * 400, frameCount: 457 + 250, t: index.first.t + 10 };
    insertEntry(index, truth);
    const offsets = index.entries.map((e) => e.offset);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(estimateOffset(index, truth.t)).toBe(truth.offset);
  });

  it('does not duplicate an offset it already holds', async () => {
    const index = await buildIndex(fetcherFor(fakeFile(500)));
    const before = index.entries.length;
    insertEntry(index, { ...index.first });
    expect(index.entries.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- jsonlIndex`
Expected: FAIL, cannot resolve `@/lib/pipelineData/jsonlIndex`.

- [ ] **Step 3: Implement**

Create `src/lib/pipelineData/jsonlIndex.ts`:

```ts
import { parseWindow, type ReplayRecord } from './frameWindow';

/** How much to read for each probe. Comfortably more than one record. */
export const PROBE_BYTES = 65536;

export interface IndexEntry {
  offset: number;
  frameCount: number;
  t: number;
}

export interface RangeFetcher {
  head(): Promise<{ size: number; acceptsRanges: boolean }>;
  range(start: number, endInclusive: number): Promise<string>;
}

export interface JsonlIndex {
  size: number;
  acceptsRanges: boolean;
  first: IndexEntry;
  last: IndexEntry;
  /** Measured, not assumed: window sizes are derived from this. */
  meanRecordBytes: number;
  /** Sorted by offset. Densifies as the file is used. */
  entries: IndexEntry[];
}

function entryFrom(record: ReplayRecord, offset: number): IndexEntry {
  return { offset, frameCount: record.frameCount, t: record.t };
}

/**
 * Build the index with about ten small reads.
 *
 * When ranges are unsupported the whole object is read once instead, and the
 * index is built from that. Same shape either way, so nothing downstream has to
 * know which happened.
 */
export async function buildIndex(
  fetcher: RangeFetcher,
  probes = 8
): Promise<JsonlIndex> {
  const { size, acceptsRanges } = await fetcher.head();

  if (!acceptsRanges) {
    const text = await fetcher.range(0, size - 1);
    const records = parseWindow(text, { startsAtBof: true, endsAtEof: true });
    if (!records.length) throw new Error('Pipeline data file holds no records');
    return {
      size,
      acceptsRanges: false,
      first: entryFrom(records[0], 0),
      last: entryFrom(records[records.length - 1], size),
      meanRecordBytes: Math.max(1, Math.round(size / records.length)),
      entries: [entryFrom(records[0], 0)],
    };
  }

  const head = await fetcher.range(0, Math.min(PROBE_BYTES, size) - 1);
  const headRecords = parseWindow(head, {
    startsAtBof: true,
    endsAtEof: size <= PROBE_BYTES,
  });
  if (!headRecords.length) throw new Error('Pipeline data file holds no records');

  // Mean record size from the head sample. Every window size derives from this
  // rather than from a fixed byte count, because per-record size scales with
  // how many players a frame holds.
  const headBytes = size <= PROBE_BYTES ? size : head.lastIndexOf('\n') + 1;
  const meanRecordBytes = Math.max(
    1,
    Math.round(headBytes / headRecords.length)
  );

  const tailStart = Math.max(0, size - PROBE_BYTES);
  const tail =
    tailStart === 0 ? head : await fetcher.range(tailStart, size - 1);
  const tailRecords = parseWindow(tail, {
    startsAtBof: tailStart === 0,
    endsAtEof: true,
  });
  const lastRecord = tailRecords[tailRecords.length - 1] ?? headRecords[0];

  const entries: IndexEntry[] = [entryFrom(headRecords[0], 0)];

  for (let i = 1; i <= probes; i++) {
    const at = Math.floor((size * i) / (probes + 1));
    if (at <= 0 || at >= size) continue;
    const end = Math.min(size, at + PROBE_BYTES) - 1;
    const text = await fetcher.range(at, end);
    const newlineAt = text.indexOf('\n');
    if (newlineAt < 0) continue;
    const records = parseWindow(text, {
      startsAtBof: false,
      endsAtEof: end === size - 1,
    });
    if (!records.length) continue;
    insertEntryInto(entries, entryFrom(records[0], at + newlineAt + 1));
  }

  return {
    size,
    acceptsRanges: true,
    first: entries[0],
    last: entryFrom(lastRecord, size),
    meanRecordBytes,
    entries,
  };
}

function insertEntryInto(entries: IndexEntry[], entry: IndexEntry): void {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].offset < entry.offset) lo = mid + 1;
    else hi = mid;
  }
  if (entries[lo]?.offset === entry.offset) return;
  entries.splice(lo, 0, entry);
}

/** Record an offset observed while fetching, so later estimates improve. */
export function insertEntry(index: JsonlIndex, entry: IndexEntry): void {
  insertEntryInto(index.entries, entry);
}

/**
 * Estimate the byte offset of the record at time `t`.
 *
 * Linear interpolation between the two bracketing known entries. Records are
 * near-uniform in size, so this lands close; the caller corrects from what it
 * actually reads and feeds the correction back through insertEntry.
 */
export function estimateOffset(index: JsonlIndex, t: number): number {
  const entries = index.entries;
  if (t <= entries[0].t) return entries[0].offset;

  const tail = { offset: index.last.offset, t: index.last.t };
  for (let i = 0; i < entries.length; i++) {
    const lo = entries[i];
    const hi = entries[i + 1] ?? tail;
    if (t > hi.t) continue;
    const span = hi.t - lo.t;
    if (span <= 0) return lo.offset;
    const ratio = (t - lo.t) / span;
    return Math.round(lo.offset + ratio * (hi.offset - lo.offset));
  }
  return entries[entries.length - 1].offset;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- jsonlIndex`
Expected: PASS, all eleven cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipelineData/jsonlIndex.ts src/lib/pipelineData/__tests__/jsonlIndex.test.ts
git commit -m "feat: build a sparse byte-offset index over the pipeline JSONL

About ten small range reads give first record, last record, mean record
size and eight interior probes. Seeking interpolates an offset from that
and feeds the correction back, so the index densifies as it is used.

Mean record size is measured rather than assumed because per-record bytes
scale with how many players a frame holds."
```

---

### Task 4: Fetch pipeline data through the storage proxy

**Files:**
- Modify: `netlify/functions/aws-storage.cjs:170-172`
- Modify: `src/services/awsStorageService.ts`
- Modify: `src/services/videoService.ts:627,723`
- Create: `src/lib/pipelineData/rangeFetcher.ts`
- Test: `netlify/functions/__tests__/aws-storage.test.ts` (add cases), `src/services/__tests__/awsStorageKind.test.ts`

**Interfaces:**
- Consumes: `RangeFetcher` from Task 3.
- Produces:
  - `AwsStorageService.getUrlForProject(outputVideoId: string, kind?: 'video' | 'data'): Promise<string>`
  - `AwsStorageService.getVideoUrlForProject(outputVideoId: string): Promise<string>` (kept, delegates)
  - `httpRangeFetcher(url: string): RangeFetcher`

- [ ] **Step 1: Write the failing function tests**

Append to `netlify/functions/__tests__/aws-storage.test.ts`, inside a new `describe`. Follow the existing file's `routedFetch` / `loadHandler` / `event` helpers, and its `beforeEach` env setup.

`AWS_PIPELINE_DATA_KEY` leaks between tests if it is not cleared, and the 501 case then passes for the wrong reason, so the new `describe` needs its own teardown:

```ts
describe('kind parameter', () => {
  afterEach(() => {
    delete process.env.AWS_PIPELINE_DATA_KEY;
  });

  it('defaults to the video key when kind is absent', async () => {
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    await handler(event({ outputVideoId: VALID_ID }));
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain(encodeURIComponent('streams/generated.mp4'));
  });

  it('uses the configured data key template for kind=data', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    const url = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain(
      encodeURIComponent(`pipeline-output/${VALID_ID}/data/${VALID_ID}.jsonl`)
    );
  });

  it('answers 501 for kind=data when no template is configured', async () => {
    delete process.env.AWS_PIPELINE_DATA_KEY;
    vi.stubGlobal('fetch', routedFetch({ videoVisible: true }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(501);
  });

  it('rejects an unknown kind', async () => {
    vi.stubGlobal('fetch', routedFetch({ videoVisible: true }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'secrets' }));
    expect(res.statusCode).toBe(400);
  });

  it('still authorises before touching the data key', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    vi.stubGlobal('fetch', routedFetch({ videoVisible: false }));
    const handler = await loadHandler();
    const res = await handler(event({ outputVideoId: VALID_ID, kind: 'data' }));
    expect(res.statusCode).toBe(403);
  });

  it('substitutes only the validated id, never caller text', async () => {
    process.env.AWS_PIPELINE_DATA_KEY = 'pipeline-output/{id}/data/{id}.jsonl';
    const fetchMock = routedFetch({ videoVisible: true });
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler();
    const res = await handler(
      event({ outputVideoId: '../../etc/passwd', kind: 'data' })
    );
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- aws-storage`
Expected: FAIL on the `kind=data` cases; the current handler ignores the parameter and returns the mp4 key.

- [ ] **Step 3: Implement the function change**

In `netlify/functions/aws-storage.cjs`, add near `OUTPUT_VIDEO_ID`:

```js
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
```

Then replace lines 170-172 with:

```js
  const filepath = keyFor(kind, outputVideoId);
  if (!filepath) {
    return json(501, {
      error:
        'Pipeline data is not configured. Set AWS_PIPELINE_DATA_KEY in Netlify env vars to the object key template, using {id} for the pipeline id.',
    });
  }
  const targetUrl =
    lambdaBaseUrl + '/api/v1/storage/' + encodeURIComponent(filepath) + '/no-redirect';
```

And immediately after the existing `outputVideoId` validation at the top of the handler, add:

```js
  const kind =
    (event.queryStringParameters && event.queryStringParameters.kind) || 'video';

  if (!KINDS.includes(kind)) {
    return json(400, { error: 'Invalid kind parameter' });
  }
```

- [ ] **Step 4: Run the function tests**

Run: `npm test -- aws-storage`
Expected: PASS, including every pre-existing case. The default path is unchanged, so nothing that passed before may now fail.

- [ ] **Step 5: Write the failing service test**

Create `src/services/__tests__/awsStorageKind.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/composables/useSupabase', () => ({
  getOptimizedSession: vi.fn(async () => ({ access_token: 'tok' })),
}));

import { AwsStorageService } from '@/services/awsStorageService';

const ID = 'bc9ac890-942a-4052-9b55-25e38bf53d51';

function respondWith(url: string, status = 200) {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify({ url }),
  }));
}

describe('getUrlForProject', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('requests the video kind by default', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getUrlForProject(ID);
    expect(String(f.mock.calls[0][0])).not.toContain('kind=');
  });

  it('requests kind=data when asked', async () => {
    const f = respondWith('https://s3.example.com/x/data.jsonl?sig=1');
    vi.stubGlobal('fetch', f);
    await AwsStorageService.getUrlForProject(ID, 'data');
    expect(String(f.mock.calls[0][0])).toContain('kind=data');
  });

  it('rejects a data URL that points at the video, so an old deploy cannot mislead it', async () => {
    const f = respondWith('https://s3.example.com/x/streams/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getUrlForProject(ID, 'data')).rejects.toThrow(
      /pipeline data/i
    );
  });

  it('keeps getVideoUrlForProject working', async () => {
    const f = respondWith('https://s3.example.com/generated.mp4?sig=1');
    vi.stubGlobal('fetch', f);
    await expect(AwsStorageService.getVideoUrlForProject(ID)).resolves.toContain(
      'generated.mp4'
    );
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npm test -- awsStorageKind`
Expected: FAIL, `getUrlForProject` is not a function.

- [ ] **Step 7: Implement the service change**

In `src/services/awsStorageService.ts`, replace `getVideoUrlForProject` with:

```ts
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
```

- [ ] **Step 8: Run the service tests**

Run: `npm test -- awsStorageKind`
Expected: PASS, all four cases. `videoService.ts:627` and `:723` need no change because `getVideoUrlForProject` still exists.

- [ ] **Step 9: Implement the range fetcher**

Create `src/lib/pipelineData/rangeFetcher.ts`:

```ts
import type { RangeFetcher } from './jsonlIndex';

/**
 * Range reads against a presigned URL.
 *
 * S3 answers a ranged GET with 206 and a Content-Range. Some objects cannot be
 * ranged at all - notably anything served with a Content-Encoding, where byte
 * offsets refer to the encoded stream and are useless to us. head() reports
 * that, and buildIndex falls back to reading the object whole.
 */
export function httpRangeFetcher(url: string): RangeFetcher {
  return {
    async head() {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Pipeline data is unreachable (${res.status})`);
      }
      const size = Number(res.headers.get('content-length') ?? 0);
      const acceptsRanges =
        (res.headers.get('accept-ranges') ?? '').toLowerCase() === 'bytes' &&
        !res.headers.get('content-encoding') &&
        size > 0;
      return { size, acceptsRanges };
    },

    async range(start: number, endInclusive: number) {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { Range: `bytes=${start}-${endInclusive}` },
      });
      if (!res.ok) {
        throw new Error(`Pipeline data range request failed (${res.status})`);
      }
      return res.text();
    },
  };
}
```

- [ ] **Step 10: Typecheck and commit**

Run: `npx vue-tsc --noEmit`
Expected: no errors.

```bash
git add netlify/functions/aws-storage.cjs netlify/functions/__tests__/aws-storage.test.ts \
        src/services/awsStorageService.ts src/services/__tests__/awsStorageKind.test.ts \
        src/lib/pipelineData/rangeFetcher.ts
git commit -m "feat: fetch pipeline data through the storage proxy

The caller still names a kind, never a path. The data key is a Netlify env
template so the frontend ships before the key is confirmed and starts
working when the variable is set; unset answers 501 and the tab shows its
no-data state.

The client rejects a data URL pointing at generated.mp4, which is what a
function deployed before this change would return. That makes the deploy
order between function and frontend not matter."
```

---

### Task 5: The replay playback source

**Files:**
- Create: `src/composables/usePipelineReplay.ts`
- Test: `src/composables/__tests__/usePipelineReplay.test.ts`

**Interfaces:**
- Consumes: `buildIndex`, `estimateOffset`, `insertEntry`, `RangeFetcher`, `JsonlIndex` (Task 3); `parseWindow`, `ReplayRecord` (Task 2); `Frame` (Task 1).
- Produces:
  - `type ReplayState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'`
  - `interface PipelineReplay { currentTime, duration, currentFrame, totalFrames, fps, isPlaying: Ref<...>; frame: Ref<Frame | null>; state: Ref<ReplayState>; error: Ref<string | null>; load(): Promise<void>; play(): void; pause(): void; seek(t: number): Promise<void>; whenIdle(): Promise<void>; dispose(): void }`
  - `usePipelineReplay(opts: { openFetcher: () => Promise<RangeFetcher | null>; raf?: (cb: (ms: number) => void) => number; caf?: (h: number) => void; windowSeconds?: number; lruSize?: number }): PipelineReplay`

The `raf` / `caf` injection exists so the test drives the clock by hand. Defaults are `window.requestAnimationFrame` / `cancelAnimationFrame`.

`whenIdle()` resolves once any background prefetch has settled. Prefetching is fire-and-forget during playback, so without this a test can only assert on it by racing microtasks.

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/usePipelineReplay.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import type { RangeFetcher } from '@/lib/pipelineData/jsonlIndex';

const RECORD_BYTES = 400;

function fakeFile(count: number, startFrame = 457, t0 = 1000, dt = 0.04) {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const body: Record<string, unknown> = {
      match_id: 1,
      teams: [{ team_id: 0, players: [], actions: [] }],
      balls: [],
      state: { actions: [] },
      frame_data: [
        {
          frame_count: startFrame + i,
          frame_uuid: [{ timestamp: Number((t0 + i * dt).toFixed(4)), uuid: 'x' }],
        },
      ],
      pad: '',
    };
    body.pad = 'p'.repeat(Math.max(0, RECORD_BYTES - JSON.stringify(body).length));
    lines.push(JSON.stringify(body));
  }
  return lines.join('\n');
}

function counting(text: string) {
  const calls: Array<[number, number]> = [];
  const fetcher: RangeFetcher = {
    async head() {
      return { size: text.length, acceptsRanges: true };
    },
    async range(start, end) {
      calls.push([start, end]);
      return text.slice(start, end + 1);
    },
  };
  return { fetcher, calls };
}

/** A hand-driven rAF: nothing runs until the test calls tick(). */
function manualClock() {
  let queued: ((ms: number) => void) | null = null;
  return {
    raf: (cb: (ms: number) => void) => {
      queued = cb;
      return 1;
    },
    caf: () => {
      queued = null;
    },
    tick(ms: number) {
      const cb = queued;
      queued = null;
      cb?.(ms);
    },
    get pending() {
      return queued !== null;
    },
  };
}

describe('usePipelineReplay', () => {
  it('reports empty when no fetcher is available', async () => {
    const r = usePipelineReplay({ openFetcher: async () => null });
    await r.load();
    expect(r.state.value).toBe('empty');
  });

  it('reports error when opening the fetcher throws', async () => {
    const r = usePipelineReplay({
      openFetcher: async () => {
        throw new Error('boom');
      },
    });
    await r.load();
    expect(r.state.value).toBe('error');
    expect(r.error.value).toContain('boom');
  });

  it('exposes duration, total frames and fps after loading', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    expect(r.state.value).toBe('ready');
    expect(r.duration.value).toBeCloseTo(499 * 0.04, 2);
    expect(r.totalFrames.value).toBe(500);
    expect(r.fps.value).toBe(25);
  });

  it('starts at the first record', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    expect(r.currentTime.value).toBe(0);
    expect(r.currentFrame.value).toBe(457);
    expect(r.frame.value).not.toBeNull();
  });

  it('seeks to the record bracketing the requested time', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(4);
    expect(r.currentFrame.value).toBe(457 + 100);
    expect(r.currentTime.value).toBeCloseTo(4, 2);
  });

  it('clamps a seek past the end', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(9999);
    expect(r.currentFrame.value).toBe(457 + 499);
  });

  it('clamps a negative seek to zero', async () => {
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(-5);
    expect(r.currentTime.value).toBe(0);
  });

  it('advances the clock while playing and stops on pause', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();

    r.play();
    expect(r.isPlaying.value).toBe(true);
    clock.tick(0);
    clock.tick(1000);
    expect(r.currentTime.value).toBeCloseTo(1, 1);

    r.pause();
    expect(r.isPlaying.value).toBe(false);
    expect(clock.pending).toBe(false);
  });

  it('pauses itself at the end of the data', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(50));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    clock.tick(0);
    clock.tick(60_000);
    expect(r.isPlaying.value).toBe(false);
    expect(r.currentTime.value).toBeCloseTo(r.duration.value, 2);
  });

  it('serves a second seek inside a cached window without refetching', async () => {
    const { fetcher, calls } = counting(fakeFile(2000));
    const r = usePipelineReplay({ openFetcher: async () => fetcher });
    await r.load();
    await r.seek(20);
    const after = calls.length;
    await r.seek(20.4);
    expect(calls.length).toBe(after);
  });

  it('evicts the oldest window past the LRU limit', async () => {
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      lruSize: 2,
    });
    await r.load();
    await r.seek(10);
    await r.seek(50);
    await r.seek(90);
    const before = calls.length;
    await r.seek(10);
    expect(calls.length).toBeGreaterThan(before);
  });

  it('prefetches the next window before playback reaches the boundary', async () => {
    const clock = manualClock();
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    await r.seek(9);
    await r.whenIdle();
    const before = calls.length;

    r.play();
    clock.tick(0);
    clock.tick(100);
    await r.whenIdle();

    // Still inside the first window, but the next one is already on its way.
    expect(r.currentTime.value).toBeLessThan(10);
    expect(calls.length).toBeGreaterThan(before);
    r.pause();
  });

  it('does not stack prefetches while one is in flight', async () => {
    const clock = manualClock();
    const { fetcher, calls } = counting(fakeFile(4000));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
      windowSeconds: 10,
    });
    await r.load();
    await r.seek(9);
    await r.whenIdle();
    const before = calls.length;

    r.play();
    clock.tick(0);
    clock.tick(20);
    clock.tick(40);
    clock.tick(60);
    await r.whenIdle();

    expect(calls.length).toBe(before + 1);
    r.pause();
  });

  it('stops the clock on dispose', async () => {
    const clock = manualClock();
    const { fetcher } = counting(fakeFile(500));
    const r = usePipelineReplay({
      openFetcher: async () => fetcher,
      raf: clock.raf,
      caf: clock.caf,
    });
    await r.load();
    r.play();
    r.dispose();
    expect(clock.pending).toBe(false);
    expect(r.isPlaying.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- usePipelineReplay`
Expected: FAIL, cannot resolve `@/composables/usePipelineReplay`.

- [ ] **Step 3: Implement**

Create `src/composables/usePipelineReplay.ts`:

```ts
import { ref, type Ref } from 'vue';
import type { Frame } from '@/lib/vis/types';
import { parseWindow, type ReplayRecord } from '@/lib/pipelineData/frameWindow';
import {
  buildIndex,
  estimateOffset,
  insertEntry,
  type JsonlIndex,
  type RangeFetcher,
} from '@/lib/pipelineData/jsonlIndex';

export type ReplayState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface PipelineReplay {
  currentTime: Ref<number>;
  duration: Ref<number>;
  currentFrame: Ref<number>;
  totalFrames: Ref<number>;
  fps: Ref<number>;
  isPlaying: Ref<boolean>;
  frame: Ref<Frame | null>;
  state: Ref<ReplayState>;
  error: Ref<string | null>;
  load(): Promise<void>;
  play(): void;
  pause(): void;
  seek(t: number): Promise<void>;
  /** Resolves once any background prefetch has settled. */
  whenIdle(): Promise<void>;
  dispose(): void;
}

interface LoadedWindow {
  startOffset: number;
  records: ReplayRecord[];
}

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_LRU = 4;
/** How close to the end of the loaded window playback may get before the next
 *  one is fetched. Without this the pitch freezes at every window boundary
 *  while the range request is in flight. */
const PREFETCH_SECONDS = 8;

/**
 * Replay the pipeline's frame JSONL on its own clock.
 *
 * Deliberately independent of the video element. The two surfaces never have to
 * agree on a position, which is why replay time is measured from the first
 * record in the file rather than mapped onto video time.
 */
export function usePipelineReplay(opts: {
  openFetcher: () => Promise<RangeFetcher | null>;
  raf?: (cb: (ms: number) => void) => number;
  caf?: (handle: number) => void;
  windowSeconds?: number;
  lruSize?: number;
}): PipelineReplay {
  const raf =
    opts.raf ?? ((cb: (ms: number) => void) => requestAnimationFrame(cb));
  const caf = opts.caf ?? ((h: number) => cancelAnimationFrame(h));
  const windowSeconds = opts.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const lruSize = opts.lruSize ?? DEFAULT_LRU;

  const currentTime = ref(0);
  const duration = ref(0);
  const currentFrame = ref(0);
  const totalFrames = ref(0);
  const fps = ref(25);
  const isPlaying = ref(false);
  const frame = ref<Frame | null>(null);
  const state = ref<ReplayState>('idle');
  const error = ref<string | null>(null);

  let fetcher: RangeFetcher | null = null;
  let index: JsonlIndex | null = null;
  let windows: LoadedWindow[] = [];
  let rafHandle: number | null = null;
  let lastTickMs: number | null = null;
  let prefetching: Promise<unknown> | null = null;

  /** Absolute file time for a replay time. */
  const abs = (t: number) => (index ? index.first.t + t : t);

  function windowBytes(): number {
    if (!index) return 0;
    const perSecond = fps.value * index.meanRecordBytes;
    return Math.max(index.meanRecordBytes * 2, Math.round(perSecond * windowSeconds));
  }

  function findIn(win: LoadedWindow, target: number): ReplayRecord | null {
    const records = win.records;
    if (!records.length) return null;
    if (target < records[0].t || target > records[records.length - 1].t) return null;
    let lo = 0;
    let hi = records.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (records[mid].t <= target) lo = mid;
      else hi = mid - 1;
    }
    return records[lo];
  }

  function touch(win: LoadedWindow): void {
    windows = [win, ...windows.filter((w) => w !== win)].slice(0, lruSize);
  }

  async function recordAt(target: number): Promise<ReplayRecord | null> {
    if (!index || !fetcher) return null;

    for (const win of windows) {
      const hit = findIn(win, target);
      if (hit) {
        touch(win);
        return hit;
      }
    }

    const span = windowBytes();
    // Start a little before the estimate: interpolation can overshoot, and
    // landing early costs one window's worth of records rather than a retry.
    let start = Math.max(0, estimateOffset(index, target) - Math.round(span / 4));
    for (let attempt = 0; attempt < 3; attempt++) {
      const end = Math.min(index.size, start + span) - 1;
      const text = await fetcher.range(start, end);
      const records = parseWindow(text, {
        startsAtBof: start === 0,
        endsAtEof: end === index.size - 1,
      });
      if (!records.length) return null;

      // Feed the true offset back so the next estimate in this region is better.
      const firstNewline = start === 0 ? -1 : text.indexOf('\n');
      insertEntry(index, {
        offset: start === 0 ? 0 : start + firstNewline + 1,
        frameCount: records[0].frameCount,
        t: records[0].t,
      });

      const win: LoadedWindow = { startOffset: start, records };
      touch(win);

      const hit = findIn(win, target);
      if (hit) return hit;

      if (target < records[0].t) {
        if (start === 0) return records[0];
        start = Math.max(0, start - span);
      } else {
        const next = start + span;
        if (next >= index.size) return records[records.length - 1];
        start = next;
      }
    }
    return null;
  }

  function show(record: ReplayRecord): void {
    frame.value = record.frame;
    currentFrame.value = record.frameCount;
  }

  /**
   * Pull the next window in while the current one still has room.
   *
   * Fire and forget: playback must not wait on it. One at a time, because
   * every rAF tick asks and a boundary is many ticks wide.
   */
  function maybePrefetch(): void {
    if (prefetching || !index || !windows.length) return;
    const records = windows[0].records;
    const lastT = records[records.length - 1]?.t;
    if (lastT === undefined) return;
    if (abs(currentTime.value) < lastT - PREFETCH_SECONDS) return;
    if (lastT >= index.last.t) return;

    prefetching = recordAt(lastT + 1e-6).finally(() => {
      prefetching = null;
    });
  }

  /** Resolves once any background prefetch has settled. For tests. */
  async function whenIdle(): Promise<void> {
    while (prefetching) await prefetching;
  }

  async function load(): Promise<void> {
    state.value = 'loading';
    error.value = null;
    try {
      fetcher = await opts.openFetcher();
      if (!fetcher) {
        state.value = 'empty';
        return;
      }
      index = await buildIndex(fetcher);
      duration.value = Math.max(0, index.last.t - index.first.t);
      totalFrames.value = index.last.frameCount - index.first.frameCount + 1;
      if (duration.value > 0 && totalFrames.value > 1) {
        fps.value = Math.max(
          1,
          Math.round((totalFrames.value - 1) / duration.value)
        );
      }
      currentTime.value = 0;
      const first = await recordAt(index.first.t);
      if (first) show(first);
      state.value = 'ready';
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      state.value = 'error';
    }
  }

  async function seek(t: number): Promise<void> {
    if (state.value !== 'ready' || !index) return;
    const clamped = Math.min(Math.max(0, t), duration.value);
    currentTime.value = clamped;
    const record = await recordAt(abs(clamped));
    if (record) show(record);
  }

  function tick(ms: number): void {
    if (!isPlaying.value) return;
    if (lastTickMs === null) {
      lastTickMs = ms;
      rafHandle = raf(tick);
      return;
    }
    const delta = (ms - lastTickMs) / 1000;
    lastTickMs = ms;

    const next = currentTime.value + delta;
    if (next >= duration.value) {
      currentTime.value = duration.value;
      void seek(duration.value);
      pause();
      return;
    }
    currentTime.value = next;
    void seek(next);
    maybePrefetch();
    rafHandle = raf(tick);
  }

  function play(): void {
    if (state.value !== 'ready' || isPlaying.value) return;
    isPlaying.value = true;
    lastTickMs = null;
    rafHandle = raf(tick);
  }

  function pause(): void {
    isPlaying.value = false;
    lastTickMs = null;
    if (rafHandle !== null) {
      caf(rafHandle);
      rafHandle = null;
    }
  }

  function dispose(): void {
    pause();
    windows = [];
    index = null;
    fetcher = null;
  }

  return {
    currentTime,
    duration,
    currentFrame,
    totalFrames,
    fps,
    isPlaying,
    frame,
    state,
    error,
    load,
    play,
    pause,
    seek,
    whenIdle,
    dispose,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- usePipelineReplay`
Expected: PASS, all fourteen cases.

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePipelineReplay.ts src/composables/__tests__/usePipelineReplay.test.ts
git commit -m "feat: add the pipeline replay playback source

Own clock, deliberately independent of the video: replay time is measured
from the first record in the file, so the mp4 and the JSONL never have to
agree and a dropped frame cannot drift the two apart.

rAF is injectable so the test drives the clock by hand. Window size comes
from the measured mean record size rather than a fixed byte count."
```

---

### Task 6: The pipeline surface component

**Files:**
- Create: `src/components/PipelineOutputSurface.vue`
- Test: `src/components/__tests__/pipelineOutputSurface.test.ts`

**Interfaces:**
- Consumes: `useRenderer2D` (Task 1), `PipelineReplay` and `ReplayState` (Task 5).
- Produces: a component taking `:replay="PipelineReplay"` and emitting `(e: 'context-menu', ev: MouseEvent)`.

The canvas is not unit tested: jsdom has no 2D context, so `getContext('2d')` returns null there. The component guards on that, and the tests cover the four states plus the context-menu emit. Drawing correctness is covered by manual verification in Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/pipelineOutputSurface.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import type { PipelineReplay, ReplayState } from '@/composables/usePipelineReplay';

function fakeReplay(state: ReplayState, message: string | null = null) {
  return {
    currentTime: ref(0),
    duration: ref(120),
    currentFrame: ref(457),
    totalFrames: ref(3000),
    fps: ref(25),
    isPlaying: ref(false),
    frame: ref(null),
    state: ref(state),
    error: ref(message),
    load: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(async () => {}),
    whenIdle: vi.fn(async () => {}),
    dispose: vi.fn(),
  } as unknown as PipelineReplay;
}

function mount(replay: PipelineReplay) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({
      setup: () => () => h(PipelineOutputSurface, { replay }),
    })
  );
  app.mount(root);
  return {
    root,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

const at = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-testid="${id}"]`);

describe('PipelineOutputSurface', () => {
  it('shows the loading state', async () => {
    const m = mount(fakeReplay('loading'));
    await nextTick();
    expect(at(m.root, 'pipeline-loading')).not.toBeNull();
    m.unmount();
  });

  it('shows the no-data state', async () => {
    const m = mount(fakeReplay('empty'));
    await nextTick();
    expect(at(m.root, 'pipeline-empty')).not.toBeNull();
    m.unmount();
  });

  it('shows the error state with its message', async () => {
    const m = mount(fakeReplay('error', 'range request failed'));
    await nextTick();
    const el = at(m.root, 'pipeline-error');
    expect(el?.textContent).toContain('range request failed');
    m.unmount();
  });

  it('shows the canvas when ready', async () => {
    const m = mount(fakeReplay('ready'));
    await nextTick();
    expect(at(m.root, 'pipeline-canvas')).not.toBeNull();
    expect(at(m.root, 'pipeline-empty')).toBeNull();
    m.unmount();
  });

  it('calls load on mount', async () => {
    const replay = fakeReplay('idle');
    const m = mount(replay);
    await nextTick();
    expect(replay.load).toHaveBeenCalledOnce();
    m.unmount();
  });

  it('disposes on unmount', async () => {
    const replay = fakeReplay('ready');
    const m = mount(replay);
    await nextTick();
    m.unmount();
    expect(replay.dispose).toHaveBeenCalledOnce();
  });

  it('emits context-menu instead of opening the browser menu', async () => {
    const replay = fakeReplay('ready');
    const seen: MouseEvent[] = [];
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(PipelineOutputSurface, {
            replay,
            onContextMenu: (e: MouseEvent) => seen.push(e),
          }),
      })
    );
    app.mount(root);
    await nextTick();

    const stage = root.querySelector('[data-testid="pipeline-stage"]')!;
    stage.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(seen).toHaveLength(1);

    app.unmount();
    root.remove();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- pipelineOutputSurface`
Expected: FAIL, cannot resolve `@/components/PipelineOutputSurface.vue`.

- [ ] **Step 3: Implement**

Create `src/components/PipelineOutputSurface.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useRenderer2D } from '@/lib/vis/useRenderer2D';
import { FRAME_W, FRAME_H } from '@/lib/vis/constants';
import type { PipelineReplay } from '@/composables/usePipelineReplay';

const props = defineProps<{ replay: PipelineReplay }>();
const emit = defineEmits<{ (e: 'context-menu', ev: MouseEvent): void }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let renderer: ReturnType<typeof useRenderer2D> | null = null;

// Zoom and pan, kept from FootballPitchView: inspecting a cluster of players is
// the common QA gesture and the pitch is small at editor sizes.
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.15;

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;

const stageRef = ref<HTMLElement | null>(null);

const canvasTransform = computed(
  () => `translate(calc(-50% + ${panX.value}px), calc(-50% + ${panY.value}px)) scale(${zoom.value})`
);

function onWheel(e: WheelEvent) {
  const stage = stageRef.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const mx = e.clientX - rect.left - rect.width / 2;
  const my = e.clientY - rect.top - rect.height / 2;

  const oldZoom = zoom.value;
  const next = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, oldZoom + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))
  );
  if (next === oldZoom) return;

  const scale = next / oldZoom;
  panX.value = mx - scale * (mx - panX.value);
  panY.value = my - scale * (my - panY.value);
  zoom.value = next;

  if (next <= MIN_ZOOM) {
    panX.value = 0;
    panY.value = 0;
  }
}

function onPointerDown(e: PointerEvent) {
  if (zoom.value <= MIN_ZOOM) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panOriginX = panX.value;
  panOriginY = panY.value;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!isPanning) return;
  panX.value = panOriginX + (e.clientX - panStartX);
  panY.value = panOriginY + (e.clientY - panStartY);
}

function onPointerUp() {
  isPanning = false;
}

function resetZoom() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function ensureRenderer() {
  const canvas = canvasRef.value;
  if (!canvas || renderer) return;
  // jsdom has no 2D context, so this is null under test. The component still
  // mounts and its states still render; only drawing is skipped.
  if (!canvas.getContext('2d')) return;
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  renderer = useRenderer2D(canvas);
}

watch(
  () => props.replay.frame.value,
  (frame) => {
    if (!frame) return;
    ensureRenderer();
    renderer?.renderFrame(frame);
  }
);

watch(
  () => props.replay.state.value,
  async (state) => {
    if (state !== 'ready') return;
    ensureRenderer();
    const frame = props.replay.frame.value;
    if (frame) renderer?.renderFrame(frame);
  }
);

onMounted(() => {
  void props.replay.load();
});

onUnmounted(() => {
  props.replay.dispose();
  renderer = null;
});
</script>

<template>
  <div
    ref="stageRef"
    data-testid="pipeline-stage"
    class="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    @contextmenu.prevent="emit('context-menu', $event)"
  >
    <div
      v-if="replay.state.value === 'loading' || replay.state.value === 'idle'"
      data-testid="pipeline-loading"
      class="flex flex-col items-center text-center"
    >
      <div
        class="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-gray-300"
      ></div>
      <p class="text-[12px] text-gray-400">Loading pipeline data</p>
    </div>

    <div
      v-else-if="replay.state.value === 'empty'"
      data-testid="pipeline-empty"
      class="flex flex-col items-center text-center"
    >
      <svg
        class="mb-3 h-8 w-8 text-gray-600"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
      <p class="text-[12px] text-gray-400">No pipeline data for this project</p>
      <p class="mt-1 text-[11px] text-gray-600">
        Annotations you add here stay separate from the video's.
      </p>
    </div>

    <div
      v-else-if="replay.state.value === 'error'"
      data-testid="pipeline-error"
      class="flex max-w-sm flex-col items-center text-center"
    >
      <p class="text-[12px] text-gray-300">Could not load pipeline data</p>
      <p class="mt-1 text-[11px] text-gray-500">{{ replay.error.value }}</p>
      <button
        type="button"
        class="mt-3 rounded border border-white/15 px-3 py-1 text-[11px] text-gray-300 hover:bg-white/5"
        @click="replay.load()"
      >
        Try again
      </button>
    </div>

    <template v-else>
      <div
        class="absolute inset-0 overflow-hidden"
        :class="{ 'cursor-grab': zoom > 1 }"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="resetZoom"
      >
        <canvas
          ref="canvasRef"
          data-testid="pipeline-canvas"
          :width="FRAME_W"
          :height="FRAME_H"
          class="absolute left-1/2 top-1/2 max-h-full max-w-full object-contain"
          style="aspect-ratio: 1280 / 720"
          :style="{ transform: canvasTransform }"
        />
      </div>

      <div
        class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white"
      >
        F{{ replay.currentFrame.value }}
      </div>

      <div
        v-if="zoom > 1"
        class="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white"
      >
        {{ zoom.toFixed(1) }}x
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- pipelineOutputSurface`
Expected: PASS, all seven cases.

- [ ] **Step 5: Typecheck and commit**

Run: `npx vue-tsc --noEmit`
Expected: no errors.

```bash
git add src/components/PipelineOutputSurface.vue src/components/__tests__/pipelineOutputSurface.test.ts
git commit -m "feat: add the pipeline output surface component

Canvas, zoom and pan, frame HUD, and the four states. Zoom/pan is the one
thing worth keeping from FootballPitchView: inspecting a cluster of players
is the common QA gesture.

The canvas is not unit tested because jsdom has no 2D context. The
component guards on that so the states still render under test."
```

---

### Task 7: Wire the surface into the editor

**Files:**
- Create: `src/utils/timelineBinding.ts`
- Modify: `src/views/EditorView.vue`
- Test: `src/utils/__tests__/timelineBinding.test.ts`

**Interfaces:**
- Consumes: `PipelineOutputSurface` (Task 6), `usePipelineReplay` (Task 5), `httpRangeFetcher` (Task 4), `AwsStorageService.getUrlForProject` (Task 4), `AnnotationSurface` from `@/types/database`.
- Produces:
  - `interface TimelineNumbers { currentTime: number; duration: number; currentFrame: number; totalFrames: number; fps: number; isPlaying: boolean }`
  - `timelineNumbersFor(surface: AnnotationSurface, video: TimelineNumbers, replay: TimelineNumbers): TimelineNumbers`

`EditorView` cannot practically be mounted in a test: it imports the router, Supabase, the auth composable and about forty other modules. Extracting the binding gives the spec's "the timeline binds to the right source per surface" test something real to assert against, and collapses what would otherwise be six near-identical computeds into one. It follows the existing `src/utils/pipelineSurface.ts` pattern, which pulled `isPipelineSurfaceVisible` out of this same component for the same reason.

- [ ] **Step 1: Add the imports**

In the `<script setup>` block of `src/views/EditorView.vue`, alongside the existing component imports near line 21:

```ts
import PipelineOutputSurface from '@/components/PipelineOutputSurface.vue';
import { usePipelineReplay } from '@/composables/usePipelineReplay';
import { httpRangeFetcher } from '@/lib/pipelineData/rangeFetcher';
import { AwsStorageService } from '@/services/awsStorageService';
```

- [ ] **Step 2: Create the replay source**

Immediately after `const activeSurface = ref<AnnotationSurface>('video');` (near line 255):

```ts
// The replay reads the pipeline's JSONL for this project. `openFetcher` returns
// null for anything that is not an AWS pipeline video, which is most projects,
// and the surface renders its no-data state.
const pipelineReplay = usePipelineReplay({
  openFetcher: async () => {
    const video = currentVideoObject.value;
    const id = video?.videoId;
    if (typeof id !== 'string' || !id.startsWith('aws:')) return null;
    const signed = await AwsStorageService.getUrlForProject(
      id.replace(/^aws:/, ''),
      'data'
    );
    return httpRangeFetcher(signed);
  },
});
```

- [ ] **Step 3: Write the failing binding test**

Create `src/utils/__tests__/timelineBinding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  timelineNumbersFor,
  type TimelineNumbers,
} from '@/utils/timelineBinding';

const VIDEO: TimelineNumbers = {
  currentTime: 12,
  duration: 600,
  currentFrame: 360,
  totalFrames: 18000,
  fps: 30,
  isPlaying: true,
};

const REPLAY: TimelineNumbers = {
  currentTime: 4,
  duration: 300,
  currentFrame: 557,
  totalFrames: 7500,
  fps: 25,
  isPlaying: false,
};

describe('timelineNumbersFor', () => {
  it('gives the video numbers on the video surface', () => {
    expect(timelineNumbersFor('video', VIDEO, REPLAY)).toEqual(VIDEO);
  });

  it('gives the replay numbers on the pipeline surface', () => {
    expect(timelineNumbersFor('pipeline', VIDEO, REPLAY)).toEqual(REPLAY);
  });

  it('never blends the two, so a position cannot leak across a tab switch', () => {
    const picked = timelineNumbersFor('pipeline', VIDEO, REPLAY);
    expect(picked.currentTime).toBe(REPLAY.currentTime);
    expect(picked.duration).toBe(REPLAY.duration);
    expect(picked.currentFrame).toBe(REPLAY.currentFrame);
    expect(picked.fps).toBe(REPLAY.fps);
    expect(picked.isPlaying).toBe(REPLAY.isPlaying);
  });

  it('falls back to the video numbers for an unrecognised surface', () => {
    expect(
      timelineNumbersFor('something-else' as never, VIDEO, REPLAY)
    ).toEqual(VIDEO);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npm test -- timelineBinding`
Expected: FAIL, cannot resolve `@/utils/timelineBinding`.

- [ ] **Step 5: Implement the binding helper**

Create `src/utils/timelineBinding.ts`:

```ts
import type { AnnotationSurface } from '@/types/database';

/** Everything VideoTimeline needs to draw itself. */
export interface TimelineNumbers {
  currentTime: number;
  duration: number;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
}

/**
 * Pick which playback source the timeline shows.
 *
 * VideoTimeline is purely presentational, so a tab switch changes only which
 * set of numbers it is handed. The two clocks are deliberately independent and
 * this returns one or the other whole: blending fields would put one surface's
 * position on the other's duration, which is how a playhead ends up somewhere
 * that exists on neither.
 *
 * Unknown surfaces fall back to the video, which is the surface every project
 * has.
 */
export function timelineNumbersFor(
  surface: AnnotationSurface,
  video: TimelineNumbers,
  replay: TimelineNumbers
): TimelineNumbers {
  return surface === 'pipeline' ? replay : video;
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- timelineBinding`
Expected: PASS, all four cases.

- [ ] **Step 7: Bind the timeline in EditorView**

After the `pipelineReplay` declaration, add:

```ts
// One timeline, two sources. Nothing carries a position across a tab switch.
const timeline = computed(() =>
  timelineNumbersFor(
    activeSurface.value,
    {
      currentTime: currentTime.value,
      duration: duration.value,
      currentFrame: currentFrame.value,
      totalFrames: totalFrames.value,
      fps: fps.value,
      isPlaying: isPlaying.value,
    },
    {
      currentTime: pipelineReplay.currentTime.value,
      duration: pipelineReplay.duration.value,
      currentFrame: pipelineReplay.currentFrame.value,
      totalFrames: pipelineReplay.totalFrames.value,
      fps: pipelineReplay.fps.value,
      isPlaying: pipelineReplay.isPlaying.value,
    }
  )
);

const onPipeline = computed(() => activeSurface.value === 'pipeline');

const onTimelineSeek = (time: number) => {
  if (onPipeline.value) void pipelineReplay.seek(time);
  else handleTimelineSeek(time);
};
const onTimelinePlay = () => {
  if (onPipeline.value) pipelineReplay.play();
  else handleTimelinePlay();
};
const onTimelinePause = () => {
  if (onPipeline.value) pipelineReplay.pause();
  else handleTimelinePause();
};
```

Add `timelineNumbersFor` to the import added in Step 1:

```ts
import { timelineNumbersFor } from '@/utils/timelineBinding';
```

- [ ] **Step 8: Make the pause on tab switch symmetric**

Replace the watcher at line 1365 with:

```ts
// Each surface owns its own clock, so leaving a tab stops that tab's playback.
// Without this the audio kept running behind the pipeline tab; the mirror case
// is the replay advancing behind the video tab, burning range requests on a
// pitch nobody is looking at.
watch(activeSurface, (surface, previous) => {
  if (surface === 'pipeline' && isPlaying.value) {
    unifiedVideoPlayerRef.value?.pause();
  }
  if (previous === 'pipeline' && pipelineReplay.isPlaying.value) {
    pipelineReplay.pause();
  }
});
```

- [ ] **Step 9: Replace the empty state with the surface**

Replace the whole `<div v-if="activeSurface === 'pipeline'" data-testid="pipeline-empty-state" ...>` block (near line 1645, through its closing `</div>`) with:

```html
            <div
              v-if="activeSurface === 'pipeline'"
              class="relative h-full w-full"
            >
              <PipelineOutputSurface
                :replay="pipelineReplay"
                @context-menu="openQuickPick"
              />
            </div>
```

- [ ] **Step 10: Point the timeline at the binding**

In the `<VideoTimeline v-if="playerMode === 'single'" ...>` block (near line 1674), replace the six value props and the three transport handlers:

```html
          <VideoTimeline
            v-if="playerMode === 'single'"
            :current-time="timeline.currentTime"
            :duration="timeline.duration"
            :current-frame="timeline.currentFrame"
            :total-frames="timeline.totalFrames"
            :fps="timeline.fps"
            :annotations="annotations"
            :selected-annotation="selectedAnnotation"
            :is-playing="timeline.isPlaying"
            :player-mode="playerMode"
            @seek-to-time="onTimelineSeek"
            @annotation-click="handleAnnotationSeek"
            @play="onTimelinePlay"
            @pause="onTimelinePause"
            @open-quick-pick="openQuickPickAtTime"
          />
```

`:annotations` is unchanged: `useVideoAnnotations` already filters by `activeSurface`, so the markers follow the tab with no work here.

- [ ] **Step 11: Run the full suite and typecheck**

Run: `npm test`
Expected: PASS. In particular `editorSurfaceTabs` and `useVideoAnnotationsSurface` must still pass.

Run: `npx vue-tsc --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/views/EditorView.vue src/utils/timelineBinding.ts \
        src/utils/__tests__/timelineBinding.test.ts
git commit -m "feat: replay the pipeline output in its tab

One VideoTimeline, two sources. The component is purely presentational, so
a tab switch only changes which numbers it gets and which source its events
reach; it needed no changes at all.

Leaving a tab now pauses that tab's playback in both directions, and
right-click on the pitch reaches the same quick pick the video has. Both
were limitations the container round recorded as worth revisiting once this
tab had real content."
```

---

### Task 8: Verify and record what is left

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-pipeline-2d-replay-design.md`

- [ ] **Step 1: Run everything**

```bash
npm test
npx vue-tsc --noEmit
npx eslint src netlify --ext .ts,.vue
npm run build
```

Expected: all pass. `npm run build` must not pull `three` or any new package into the bundle; the 2D renderer has no dependencies.

- [ ] **Step 2: Verify in the running app**

Run `npm run dev`, sign in, and open a **finished** AWS pipeline project from the dashboard.

With `AWS_PIPELINE_DATA_KEY` unset, confirm:

- [ ] The Pipeline output tab shows "No pipeline data for this project", not an error and not a spinner that never resolves.
- [ ] The Video tab is unaffected: playback, seeking and annotations all behave as before.
- [ ] A plain uploaded project shows the same no-data state.

With `AWS_PIPELINE_DATA_KEY` set to the real template, confirm:

- [ ] The pitch renders. Players, officials and the ball are in plausible positions, jersey numbers are legible, and the gold possession ring appears on the player holding the ball.
- [ ] Pressing play on the timeline advances the pitch smoothly, and the frame number in the HUD climbs.
- [ ] Scrubbing to an arbitrary point lands there and the pitch matches the frame number shown.
- [ ] Scrubbing to the same region a second time is visibly faster, since the index has densified.
- [ ] Scroll zooms toward the pointer, drag pans, double-click resets.
- [ ] Right-click on the pitch opens the annotation quick pick.
- [ ] An annotation added on the pipeline tab appears on the timeline there, and **not** on the Video tab.
- [ ] Switching tabs mid-playback pauses that tab's playback, and each tab keeps its own position.

Be picky here: pixel-level sloppiness in the HUD, the states or the canvas fit is a defect, not a detail.

- [ ] **Step 3: Update the spec to match what shipped**

In `docs/superpowers/specs/2026-08-22-pipeline-2d-replay-design.md`:

- Replace the `KIND_SUFFIX` block in "Storage proxy" with the `AWS_PIPELINE_DATA_KEY` env template, and move the "outstanding input" section's framing from "a constant to fill in" to "a Netlify environment variable to set".
- Under the trimming description, correct "trims each record to the fields the renderer reads" to what was built: `frame_uuid` is dropped and everything else is kept. It is the single largest field and the only one the renderer provably never reads; dropping more would risk starving a future raw-data inspector for no measured gain.
- Change Status to `implemented`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-22-pipeline-2d-replay-design.md
git commit -m "docs: reconcile the replay spec with what shipped

The data key became a Netlify env template rather than a code constant, and
record trimming drops frame_uuid rather than allowlisting renderer fields."
```

---

## Still outstanding after this plan

**`AWS_PIPELINE_DATA_KEY` has no value yet.** Everything above is implementable and testable without it, and the tab degrades honestly while it is unset. What is still needed from the pipeline team is one string: the object key of the frame JSONL for a finished match, with `{id}` where the pipeline id goes.

Two things could still change the picture when that answer arrives:

- **If no JSONL is stored at all**, the tab stays in its no-data state permanently and the work becomes a request to persist the frame stream alongside `streams/generated.mp4`. Nothing in this plan is wasted; it is the consumer waiting for a producer.
- **If the object is keyed by DALF's game id rather than the pipeline id**, Perspecto never receives that id today. `Home.vue:1090` sends only `?outputVideo={pipe_id}` while the row carries `game_id` alongside. That is a one-line change in DALF plus a second query parameter here.
