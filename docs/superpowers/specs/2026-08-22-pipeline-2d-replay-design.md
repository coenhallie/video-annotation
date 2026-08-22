# 2D pipeline replay in the Pipeline output tab

Date: 2026-08-22
Status: implemented and reviewed. Not yet verified against real data: the tab
cannot leave its "no pipeline data" state until `AWS_PIPELINE_DATA_KEY` is set
in Netlify. See Verification at the end for what that leaves unproven.

## Problem

The Pipeline output tab exists and is empty. The pipeline emits one JSON record
per video frame describing every player, the ball, and the current actions, and
a finished match leaves that record stream behind as a JSONL file. QA needs to
watch and scrub that data as a top-down 2D pitch, and annotate precise moments
in it.

The previous round (`2026-08-21-pipeline-output-tab-design.md`) built the
container and said "fetching and rendering pipeline data is a later change".
This is that change.

## Scope

In scope:

- A 2D canvas pitch replay filling the Pipeline output tab.
- Its own playback clock, driven by the JSONL, independent of the video.
- The existing `VideoTimeline` reused unchanged, bound to whichever surface is
  active.
- Windowed fetching so match length does not bound memory.

Out of scope, deliberately:

- The 3D renderer. 2D only.
- Any synchronisation between the video's playhead and the replay's.
- Drawing annotations on the pitch (see Limitations).
- Joining player names from the DALF API (see Not now, but available).

## The data

One JSONL line equals one WebSocket message equals one video frame.

```
match_id, pitch_dimensions{length,width,...},
teams[]{team_id, ordered_colors[][], actions[],
        players[]{track_id, person_type, player_number,
                  projected_coordinates{x,y}, in_possession,
                  occlusion, number_probability, is_agent}},
balls[]{projected_coordinates{x,y,z}, is_high_ball, probability},
state{actions[]{action_type, action_origin}},
frame_data[]{frame_count, frame_uuid[]{timestamp, uuid}}
```

Measured against `football-visualisation/test_data.jsonl` (201 records):
records 40 ms apart, `frame_count` incrementing by exactly one, each record
carrying a trailing window of nine `frame_uuid` entries. DALF's `/start`
endpoint reports `"fps": 25` for the match, which agrees.

Two facts about the shape that the parser has to handle:

1. **The envelope varies.** `DataOutputView.vue:582` reads `data?.match ?? data`,
   so the socket sometimes wraps the frame in `{ match: ... }`. Stored lines in
   the sample are bare. Accept both.
2. **Neither `frame_count` nor `timestamp` is zero-based.** In the sample,
   `frame_count` starts at 457 and the timestamp clock starts near 1208 s. All
   replay time is therefore relative to the first record in the file.

### Time base

Because the replay is independent of the video (see below), the JSONL is the
only clock that matters and the mp4 never has to agree with it. Replay time is

```
t(record) = record.frame_data[0].frame_uuid[0].timestamp - t0
```

where `t0` is the same field on the first record. This is robust to a dropped
record in a way a positional index is not: a positional index desyncs silently
on one missing frame, drifting further out of position the longer the match
runs, with nothing on screen indicating an error.

## Two playback sources, one timeline component

`VideoTimeline` is already purely presentational. It takes `currentTime`,
`duration`, `currentFrame`, `totalFrames`, `fps`, `annotations`,
`selectedAnnotation`, `isPlaying`, `playerMode`, and emits `seek-to-time`,
`play`, `pause`, `annotation-click`, `open-quick-pick`. It has no reference to
the video element.

**It needs no changes.** `EditorView` binds it to whichever source
`activeSurface` selects:

| prop | Video tab | Pipeline tab |
| --- | --- | --- |
| `currentTime` | video `currentTime` | seconds since the first record |
| `duration` | video duration | last record's `t` |
| `currentFrame` | video frame | `frame_count` |
| `totalFrames` | video total | record count |
| `fps` | detected from video | `Math.round(1 / median delta)`, 25 |
| `isPlaying` | player state | replay state |
| play / pause / seek | `unifiedVideoPlayerRef` | `usePipelineReplay` |

Both sources expose the same shape, so the switch is one computed in
`EditorView` and the timeline's five emits route to the active source. There is
no second scrubber and no forked timeline.

`fps` is display-only in `VideoTimeline` (it renders `{{ fps }}fps` and nothing
computes with it), so it is rounded. `currentFrame` carries the real
`frame_count` and stays authoritative for frame numbers.

The two clocks are deliberately independent. Switching tabs does not carry a
position across, and nothing tries to make them agree.

### Pausing on switch

`EditorView.vue:1365` already pauses the video when the user leaves for the
pipeline tab. It gains the mirror: pause the replay when the user leaves for the
video tab. With independent clocks this is correct rather than a workaround, and
it retires the previous design's "playback can run behind the empty pipeline
tab" limitation.

### Mounting

The surface is gated `v-if="pipelineEverOpened"` and hidden with `v-show`, not
torn down.

A plain `v-if` on the active surface was tried first and rejected: it disposed
the replay on every switch away, so returning re-fetched and re-indexed the whole
JSONL behind a spinner, about ten range requests each visit, with the position
reset to zero. The `v-if` on "has been opened at least once" still matters
though, because most projects here are plain uploads with no pipeline data, and
mounting on every editor open would fire a request for each one that can only
fail.

Two consequences, both handled:

- The pause on leaving the tab becomes load-bearing rather than cosmetic. A
  mounted but hidden replay that kept ticking would pull byte ranges for a pitch
  nobody is looking at.
- `pipelineEverOpened` resets to `false` when the project changes. `EditorView`
  is reused across editor-to-editor navigation, and the surface's `load()` runs
  only once per mount, so without the reset the pipeline tab would keep showing
  the previous match's replay.

## Annotations

No schema change. `annotations` already carries `timestamp` and `frame`, and
`surface` already separates the two tabs. A pipeline annotation stores its
replay time and its `frame_count`. Reading, creating and realtime filtering are
all surface-aware already.

The pitch container binds `@contextmenu` to `openQuickPick`, the same handler
the player container uses, so right-click annotates on the pitch as it does on
the video. That retires the previous design's note that the quick pick was
unreachable on this tab.

## Fetching: sparse index, then windows

### Storage proxy

`netlify/functions/aws-storage.cjs` builds its path server-side from a
regex-validated id, deliberately, so no caller can name an arbitrary object.
That property is preserved and was re-traced end to end during review.

`kind` is read from the query string, defaults to `video`, and anything outside
`['video', 'data']` is a 400. The video key stays a code constant. **The data
key is a Netlify environment variable**, `AWS_PIPELINE_DATA_KEY`, holding a
template such as `pipeline-output/{id}/data/{id}.jsonl`; the function
substitutes the validated id for `{id}` and nothing else, so the caller still
names an id and a kind, never a path.

It is configuration rather than a constant because nobody has confirmed the real
key yet. Unset, `kind=data` answers 501 and the tab shows its "no pipeline data"
state, which is the correct answer for the majority of projects regardless. Set
it and the feature starts working with no code change and no frontend redeploy.

`AwsStorageService.getVideoUrlForProject(id)` is unchanged for its two existing
call sites. Pipeline data goes through a separate
`getPipelineDataSource(id)` returning `{url, size, acceptsRanges}`, because the
server's answer for that kind is an envelope rather than a bare URL and never
fitted a string-returning contract.

**Deploy hazard.** A function deployed before this change ignores `kind` and
answers with the **mp4's** presigned URL, in the Lambda's own shape rather than
this envelope. The client rejects a response that is not the envelope, or whose
url points at `generated.mp4`, and treats either as "no pipeline data". That
makes the deploy order between function and frontend not matter.

### The index

Range requests against the presigned URL. On opening the tab:

1. The object's size and range support, **supplied by the server** rather than
   discovered here (see below).
2. First ~64 KB: the first record's `frame_count` and `t0`, and the mean record
   size.
3. Last ~64 KB: the last record, giving `duration` and total frames.
4. Roughly eight evenly spaced probes, each reading a small range and taking the
   first complete record in it.

Step 3 is the one that is easy to get wrong. A mid-file range ends in a partial
record that must be discarded, but the file's final range does not: its last
line is a real record, which may or may not carry a trailing newline. A parser
that always drops the trailing segment silently returns the second-to-last
record here, and `duration` comes out one frame short. `frameWindow` therefore
takes an `endsAtEof` flag and only discards the trailing partial when it is
false.

That is about ten small requests and well under a megabyte. The result is a
sparse, sorted table of `byteOffset -> frame_count -> t`.

A seek interpolates an offset from the table, fetches a window, and reads the
`t` it actually landed on. If interpolation overshot or undershot, the observed
`(offset, t)` pair is inserted into the table and the fetch retried from the
corrected offset. **The index therefore densifies as the file is used**, so
repeated seeking in a region converges to one request.

### The windows

A window is **30 seconds of replay**, and its byte size is computed from the
mean record size measured in step 2 of the bootstrap. It is deliberately not a
fixed byte count: the only per-record size available before this work is ~5.2 KB,
measured on a 201-record clip whose frames hold nine and two players. A real
frame holds twenty-two plus officials, so production records are plausibly two
to three times larger. A fixed 4 MB window would hold half a minute on the
sample and ten seconds in production, which would make the prefetch rule below
fire continuously.

Windows are parsed into records with `frame_uuid` dropped, and kept in an LRU of
four. Resident memory therefore scales with record size rather than being fixed.
Playback prefetches the next window when fewer than eight seconds of the current
one remain.

On trimming: this originally said records are cut down to "the fields the
renderer reads". What shipped drops `frame_uuid` and keeps everything else. That
field is a rolling window of nine `{timestamp, uuid}` entries per record, by far
the largest thing in it, and the only field the renderer provably never reads.
Allow-listing further would risk starving a future raw-data inspector for no
measured gain.

### Why the size probe is server-side

The original design had the browser learn the object's size and range support
with an HTTP `HEAD`. **That cannot work**, and it was caught in review rather
than in testing, because every test uses a fake fetcher:

- A presigned URL is signed for one HTTP method. This one is minted for
  playback, so a `HEAD` against it fails signature verification.
- A ranged GET does not rescue it client-side either. `Content-Length` is
  CORS-safelisted, but on a `206` it is the length of the slice, not the total,
  and the headers that carry the real answers, `Content-Range` and
  `Accept-Ranges`, are **not** safelisted. A browser therefore cannot learn the
  size at all without the bucket setting `Access-Control-Expose-Headers`.

So the Netlify Function probes the object with a one-byte ranged GET, where no
CORS restriction applies, and returns `{url, size, acceptsRanges}`. A `206` with
a parseable `Content-Range` answers both questions at once; a `200` means the
server ignored the range and the object must be read whole; a `Content-Encoding`
counts as no range support, since byte offsets would then refer to the encoded
stream. The browser reads only response **bodies** afterwards, so the bucket
needs no header exposure for any of this.

`range()` rejects a non-`206` answer to a genuine range request rather than
accepting a whole-object `200` as the requested slice. Accepting it would make
every offset the index computes wrong, silently. An empty object is rejected
before any read, rather than asking for `bytes=0--1`.

## Units

Each is independently testable, and the two pure ones need no browser.

- **`src/lib/vis/`** — vendored from `datalabelling-frontend/src/lib/vis/`:
  `types.ts`, `pitchGeometry.ts`, `useColorResolver.ts`, `useRenderer2D.ts`, and
  `constants.ts` trimmed to its 2D half so the GLB/HDR URLs, camera and
  cylinder-fallback constants do not ship as dead code. A header comment names
  the origin. This subtree has no npm dependencies at all: it is plain canvas
  2D, so nothing is added to `package.json` and no lazy-loading is needed.

  DALF's `FootballPitchView.vue` is **not** ported. Its 2D/3D toggle,
  camera-follow buttons, model-loading status line and broadcast cutaway flash
  are all 3D-era or presentational flourishes with no QA value here. Its
  zoom/pan handling is worth keeping and moves into the component below.

- **`src/lib/pipelineData/frameWindow.ts`** — bytes to records. Discards a
  partial first line and a partial trailing line, skips malformed lines,
  unwraps `{ match: ... }`, trims each record to the fields the renderer reads.
  Pure.

- **`src/lib/pipelineData/jsonlIndex.ts`** — builds and refines the sparse
  index. Takes a fetcher, so it is tested against a fake without network. Pure.

- **`src/composables/usePipelineReplay.ts`** — the playback source. Owns the
  rAF clock, the window LRU, prefetch, and `play` / `pause` / `seek`. Exposes
  the same shape the video player exposes.

- **`src/components/PipelineOutputSurface.vue`** — canvas, zoom/pan, the frame
  HUD, `@contextmenu`, and the four states below. Replaces the current empty
  state in `EditorView`.

- **`src/services/awsStorageService.ts`** and
  **`netlify/functions/aws-storage.cjs`** — the `kind` change above.

- **`src/views/EditorView.vue`** — the active-source computed, the timeline
  binding, and the symmetric pause.

## States

The tab renders exactly one of:

- **Loading** while the index bootstraps.
- **No data** when the object 404s, or when the returned URL fails the suffix
  check. Wording stays close to today's empty state: most projects are plain
  uploads and will always land here.
- **Error** with a retry for anything else, matching how `EditorView` surfaces
  video load failures today.
- **Ready** — the pitch.

## Testing

Unit:

- `frameWindow`: partial leading line, partial trailing line, **a range ending
  at EOF keeps its final record** (with and without a trailing newline),
  malformed line skipped, `{ match: ... }` envelope, bare record, CRLF line
  endings.
- `jsonlIndex`: interpolation lands in the right window, a miss is corrected and
  the correction is retained, monotonic offsets, single-record file, the
  no-ranges fallback.
- `usePipelineReplay`: play advances time, pause stops it, seek resolves the
  record whose `t` brackets the target, LRU evicts, prefetch fires once.
- `awsStorageService`: `kind=data` requests the data path, default stays
  `video`, a URL failing the suffix check is rejected.
- `EditorView`: the timeline binds to the video source on the video tab and the
  replay source on the pipeline tab; leaving each tab pauses that tab's source.

Manual, on an AWS pipeline project for a **finished** match:

- The pitch renders, players and ball move, possession ring and actions appear.
- Scrub to an arbitrary point; the pitch lands there and the frame number
  matches the HUD.
- Annotate on the pipeline tab, switch to video and back, confirm the annotation
  sits at the same replay time and does not appear on the video tab.
- Confirm the video's position is untouched by anything done on the pipeline
  tab, and vice versa.
- Confirm a plain uploaded project still shows the "no data" state.

## The outstanding input

Everything above is implemented and parameterised on one fact that is not in this
repository or in DALF: **the S3 key of the frame JSONL under
`pipeline-output/{id}/`.**

It is now a Netlify environment variable, `AWS_PIPELINE_DATA_KEY`, holding a key
template with `{id}` where the pipeline id goes. Setting it is the only step
left; no code change and no frontend redeploy is required. Whether the object
supports byte ranges is no longer an input, because the function discovers it
per request.

What is known:

- The video sits at `pipeline-output/{id}/streams/generated.mp4`, keyed by the
  pipeline instance id.
- `/start` returns rich match metadata but no storage reference of any kind. It
  is the game control API, not a storage API.
- DALF never reads stored frame data. Its visualisation is fed live from
  `wss://{pipeId}.{VITE_PIPELINE}:8766`, one frame at a time, buffer capped at
  25 messages.
- The pipeline itself works in exactly this format: `render_jsonl.py`, lifted
  from the pipeline, renders 1280x720 video at 25 fps from a UUID-named
  `.jsonl`.

**This is not certain to be a one-line fill-in, and it should not be read as
one.** The backend confirmed that the JSONL *contains* frame data. That is about
content. Nothing found in any of the three frontends says the file is written to
`pipeline-output/` and kept after a match ends. So the answer lands on one of
two branches:

- **A key exists.** Set `AWS_PIPELINE_DATA_KEY` to its template and the feature
  works. Nothing else is needed.
- **No stored object exists.** Then this becomes a request to the pipeline team:
  persist the frame stream alongside `streams/generated.mp4`. Format,
  downsampling and retention are theirs to decide. Everything built here still
  stands and will read whatever they produce, provided it is newline-delimited
  JSON in the shape described above.

The whole feature is built either way. What is unproven is different from what
is unbuilt: see Verification below.

There is a second, smaller question attached to it. DALF's videos row carries
both `pipe_id` and `game_id`, but the Perspecto link sends only the pipe id
(`Home.vue:1090`, `?outputVideo={pipe_id}`). If the JSONL is keyed by game id
rather than pipeline id, DALF has to pass that too, which is a one-line change
on that side. Asking for the literal key of one file answers both at once.

## Not now, but available

`/start` returns full squads: real player names, shirt numbers, roles, and
separate substitutes, plus the whole action vocabulary (`g_actions`,
`p_actions`). The JSONL carries only `player_number`, so the 2D renderer draws a
bare number in a circle. Joining the two would let the pitch name the player,
which is a different class of useful for QA.

It is left out of this round because it introduces a cross-service dependency:
Perspecto has no notion of DALF today and would need its API base URL and
whatever auth that requires. Worth revisiting once the replay itself is real.

## Limitations of this round

**Drawing annotations stay Video-tab only.** The fabric.js canvas mounts over
the video element. Circling a mis-tracked player is obviously useful for QA, so
this is worth doing, but it is its own piece of work and the replay should land
first. `:allow-drawing` stays gated on `activeSurface === 'video'`.

**Share views still get no tab bar.** Unchanged from the previous round: the
share path loads annotations without a surface filter. Nothing here makes that
better or worse.

**No raw-JSON inspector.** DALF's data-output page has both a collapsible raw
record card and a per-frame player table, and both are plainly useful for QA of
the data itself. Whether to bring one across is an open question raised in
conversation and not yet answered, so it is not specified here.

## Verification: what is proven and what is not

Implemented across seven tasks, each gated by an independent review. At the end
of that: 434 tests passing across 52 files (75 added), zero ESLint errors, the
production build clean, no dependency added to `package.json`, nothing added to
`public/`, and no three.js in the bundle. Those last three were checked against
the merge base rather than asserted.

**That is not evidence the feature works, and it should not be read as such.**

Six defects were found during review that every one of those tests passed
straight through:

1. The browser called `HEAD` on a presigned URL to learn the object size. Signed
   for one method, so it 403s. First call the loader makes, so nothing would
   ever have loaded.
2. `Content-Range` and `Accept-Ranges` are not CORS-safelisted, so the fallback
   plan could not have worked either.
3. `dispose()` during an in-flight read resolved into a torn-down replay, an
   unhandled rejection on any tab switch that raced a fetch.
4. A single counter conflated teardown with seek ordering. Since playback seeks
   every animation frame, it silently disabled prefetching under real latency.
5. A stale `load()` could clobber a newer one's fetcher, and the guard tested
   truthiness rather than identity, so nothing would notice.
6. Both watchers used Vue's default pre-flush timing, so the renderer never
   attached on the ordinary path and the pitch stayed blank while the HUD showed
   a frame number.

Plus three annotation call sites that read the video's frame and fps on the
pipeline tab, two of which **persisted wrong data** onto real rows.

Every one of those lives at a boundary a mock papers over: the network, the
component lifecycle, or DOM patch timing. The suite covers the pure logic well
and covers those boundaries not at all.

### Still unverified, and only checkable with a real key

Nothing below has been observed. All of it requires `AWS_PIPELINE_DATA_KEY` set
to a real value and a finished match to open.

- That the pitch draws at all, with players and ball in plausible positions.
- That the storage proxy's server-side probe gets a usable answer from the real
  Lambda and bucket, including whether that object supports byte ranges.
- That the sparse index lands close enough that seeks resolve in one or two
  requests rather than repeatedly missing.
- That a scrub lands on the frame the HUD claims.
- That returning to the tab is instant, with no refetch.
- That real record sizes are near enough the sample's for the window arithmetic
  to hold.
- Whether shirt colours survive a malformed `ordered_colors` entry. `toRgb` does
  arithmetic on three channels without checking length, which yields `NaN` on a
  short array. Flagged in the first review, accepted deliberately to keep the
  vendored copy diffable, and never exercised against real data.
