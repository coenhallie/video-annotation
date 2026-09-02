# Rendering the pipeline's 3D football view in the Pipeline output tab

Date: 2026-08-22
Status: investigation, blocked on one external fact

## What is being asked

DALF (`datalabelling-frontend`) has a page at `/{game_id}/data-output` whose
"Data Visualization" tab draws a virtual 2D/3D representation of the match. The
ask is to put that same visualisation inside Perspecto, in the existing
"Pipeline output" tab, for a video opened through DALF's "Open in Perspecto"
button.

The previous round (`2026-08-21-pipeline-output-tab-design.md`) built the
container: the tab bar, per-surface annotations, and an empty state. It says
explicitly that "fetching and rendering pipeline data is a later change". This
is that change.

## What the DALF page actually is

This matters more than it sounds, because the visualisation there is **live
only**.

- `views/DataOutputView.vue` opens a second `useUnifiedWebSocket`, named
  `PipelineDataStream`, pinned to port `8766`.
- `utils/websocketUtils.js:233` builds the URL as
  `wss://{pipeId}.{VITE_PIPELINE}:{port}`, i.e. a socket on the running
  pipeline instance itself.
- `latestPipelineData` is `pipelineDataWs.messages.value[0]`, the single newest
  frame. `useUnifiedWebSocket` caps its buffer at 25 messages. Nothing is
  persisted and nothing is replayable.
- That single frame is handed to `components/FootballPitchView.vue` as
  `:frame`, with `mode="both"`.

So the DALF page has no history, no scrubber and no video sync. It renders
whatever the pipeline emitted a moment ago. A Perspecto tab sitting next to a
recorded `generated.mp4` needs the opposite: random access into a finished
match, keyed on video time.

### Frame schema

One WebSocket message equals one JSONL line equals one video frame. Confirmed
against `football-visualisation/test_data.jsonl` (201 records):

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

Measured cadence in that sample: records 40 ms apart (25 fps), `frame_count`
incrementing by exactly 1 per record, each record carrying a trailing window of
9 `frame_uuid` entries. `frame_count` starts at 457 and the `timestamp` clock
starts around 1208 s, so **neither is zero-based**. See "Sync" below.

## The renderer

`datalabelling-frontend/src/lib/vis/` is a self-contained, framework-light
module. Nothing in it touches Pinia, i18n, axios or the DALF stores. It only
needs a canvas element and a `Frame` object.

```
useRenderer3D.ts    41 KB   full Three.js lifecycle, camera follow, GLTF players
useRenderer2D.ts     7 KB   plain canvas top-down pitch
playerAppearance.ts 14 KB   shirt painting, number sprites, model cloning
postFx.ts            4 KB   pmndrs/postprocessing: N8AO, bloom, ACES, SMAA
turfMaterial.ts, pitchGeometry.ts, useCameraFollow.ts, useColorResolver.ts,
constants.ts, types.ts, frameInterpolation.ts, textureSettings.ts
```

`components/FootballPitchView.vue` is the wrapper: 2D/3D toggle, camera-mode
buttons, zoom/pan on the 2D canvas, an action cutaway flash, and a frame-data
modal. Its public surface is three props: `frame`, `metadata`, `mode`.

That file itself was already ported once, from the `football-visualisation`
repo (`useRenderer3D.ts:3` says so). A second vendored copy into Perspecto,
with a header comment naming its origin, is consistent with how this code has
been moved before. A shared npm package across three separately deployed
repos is not worth it: DALF is still iterating on the renderer (see its
`2026-06-24-three-js-visual-upgrade` plan), and a package would add a release
step to every one of those iterations.

### Cost of the port

New runtime dependencies, none of which Perspecto has today:

| package | why |
| --- | --- |
| `three` ^0.184 | the renderer |
| `postprocessing` ^6.39 | `postFx.ts` |
| `n8ao` ^1.10 | ambient occlusion pass in `postFx.ts` |

Roughly 600 to 700 KB gzipped. Perspecto's current dependency list is seven
packages, so this is the single largest thing ever added to it. It must be
behind a dynamic import so the editor's main chunk is untouched for every
project that is not a pipeline video.

Static assets, currently ~10 MB in DALF's `public/models/`:

```
player-transformed.glb    2.4 MB
stadium-transformed.glb   665 KB
sky_2k.hdr                5.2 MB   <- the big one
ball.jpg                  5.7 KB
textures/Body.*.png       175 KB
```

Perspecto's `public/` holds two files today. `sky_2k.hdr` alone is twenty times
the size of everything currently in it. Worth considering a 1K HDR for
Perspecto (DALF kept `potsdamer_platz_1k.hdr`, 1.5 MB, in the same folder) and
checking whether the visual difference is visible at the sizes this tab renders
at. Assets are fetched lazily by the renderer, not bundled, so they cost
nothing until the tab is opened.

Also `esbuild.drop: ['console', 'debugger']` in `vite.config.js` strips the
renderer's status logging in every build including dev. `setStatusCallback` is
the supported channel and it survives.

## What Perspecto already has

- `EditorSurfaceTabs.vue` with `video` / `pipeline`, gated by
  `isPipelineSurfaceVisible` (single mode, non-shared, has a video object).
- `EditorView.vue:1645` renders the "Nothing here yet" empty state. That is the
  mount point.
- The player stays mounted behind the tab (`v-show`, not `v-if`), so
  `currentTime`, `duration`, `fps`, `currentFrame` and the shared
  `VideoTimeline` are all live while the pipeline tab is showing.
- `AwsStorageService.getVideoUrlForProject(outputVideoId)` calls
  `/.netlify/functions/aws-storage?outputVideoId=...`, which checks Supabase
  visibility, then builds `pipeline-output/{id}/streams/generated.mp4`
  server-side and asks the Pipeline Controller lambda for a presigned URL.
  The path is built from a regex-validated id and never taken from the caller,
  deliberately.

## The blocking unknown: is the data stored at all

Everything found so far says the per-frame data is live-only, and nothing found
so far says it is persisted anywhere Perspecto can reach.

1. DALF reads frames from a WebSocket on the live instance, never from storage.
2. A grep for `jsonl|replay|recorded` across all of DALF's `src` returns only
   type-definition comments.
3. `netlify/functions/fetch-pipeline-files/fetch-pipeline-files.mjs` is the
   function backing the very "videos" list the user clicks. For each instance it
   probes exactly one object: `pipeline-output/{id}/streams/generated.mp4`. If a
   sibling data object existed, this is where it would show up. It does not.
4. `football-visualisation` gets its JSONL from a **local file drop**
   (`useFileLoader.loadFile(file: File)` plus `DropZone.vue`), not from a URL.

Against that, one strong signal that a JSONL exists **pipeline-side**:
`football-visualisation/render_jsonl.py` is a file lifted out of the pipeline
("Docstring for pipeline.render_jsonl"), it renders video frames from a JSONL at
25 fps and 1280x720, and its hard-coded test path is
`a572d4e5-ebc9-425c-a7c7-5cfe13fa0c7f.jsonl`, a UUID-named file. So the pipeline
holds this data in exactly the shape needed. The open question is only whether
it is written to `pipeline-output/{id}/` and kept.

### The probe that settles it

Both API keys in the repo are rejected by the controller. `GET /api/v1/instances`
and `GET /api/v1/storage/.../no-redirect` both answer `403
{"name":"UnauthorizedError","message":"Unauthorized: missing token, API key, or
valid session"}` with the production key from `.env`
(`629ca3bf-...`, the same value `AWS_STORAGE_API_KEY` is commented out as). So
this cannot be answered from here.

With a working key, in order:

```sh
CTRL=https://bpoxx6xphrxies37ptof5fwexy0vwkbd.lambda-url.eu-west-2.on.aws

# 1. a real pipe id
curl -s -H "x-api-key: $KEY" "$CTRL/api/v1/instances"

# 2. does the storage API list a prefix at all. `streams/` is the one prefix
#    proven to exist and hold an object, so it is the best listing candidate.
curl -s -H "x-api-key: $KEY" "$CTRL/api/v1/storage/pipeline-output%2f$ID%2fstreams%2f"
curl -s -H "x-api-key: $KEY" "$CTRL/api/v1/storage/pipeline-output%2f$ID%2f"
curl -s -H "x-api-key: $KEY" "$CTRL/api/v1/storage/pipeline-output%2f$ID"

# 3. if it does not list, probe names
for p in "$ID.jsonl" "data.jsonl" "data%2fdata.jsonl" "streams%2fdata.jsonl" \
         "output.jsonl" "frames.jsonl"; do
  curl -s -o /dev/null -w "$p %{http_code}\n" -H "x-api-key: $KEY" \
    "$CTRL/api/v1/storage/pipeline-output%2f$ID%2f$p/no-redirect"
done

# 4. for whatever exists, the two numbers that decide the whole fetch design
curl -sI "<presigned url>"     # content-length, accept-ranges, content-encoding
```

## Second open question: what is in `generated.mp4`

`render_jsonl.py` does not just prove a JSONL exists. It renders **video frames
from that JSONL**, at 1280x720 and 25 fps, with a `save_video_path`. Those are
exactly `FRAME_W`/`FRAME_H` from `constants.ts` and exactly the record cadence.
So one of the pipeline's outputs is a flat video of the 2D pitch.

Meanwhile DALF's live player plays `vg-output.flv` off the pipeline host, and
Perspecto plays `pipeline-output/{id}/streams/generated.mp4`. Which of those two
things `generated.mp4` is has not been established, and it is not a detail:

- **If `generated.mp4` is the broadcast camera feed**, this document stands as
  written. The Video tab shows the match, the Pipeline tab shows the model of it.
- **If `generated.mp4` is `render_jsonl.py`'s output**, two things follow. The
  JSONL was reachable at render time, so an object next to it is very likely and
  the probe will find it. And the feature is not "add a second view" but
  "replace a flat pre-rendered pitch with an interactive 3D one", which is a
  different conversation about which tab it belongs in.

This is answered by opening any existing AWS pipeline project in Perspecto and
looking at the Video tab for one second. It could not be answered from this
session: the storage key is rejected, and reading the `videos` table for a
thumbnail was blocked locally.

## Branch A: a data object exists

Then this is a frontend round, and the shape is:

**Fetch.** Extend `netlify/functions/aws-storage.cjs` with a second
server-built path. It already validates the id with `OUTPUT_VIDEO_ID` and
constructs `filepath` itself; add a `kind=data` parameter that selects a second
hard-coded suffix and nothing else. Do not let the caller name a path. The
Supabase visibility check is unchanged and applies to both.

**Size is the real problem, not the renderer.** `football-visualisation/data.jsonl`
is 876 MB for one match. That matches the arithmetic: 90 min x 60 x 25 fps =
135,000 records at ~5.2 KB each. `useFileLoader` reads the whole file into
`store.frames`, which is fine for a local drop and impossible over the network.

Options, in the order they should be considered:

1. **The object is already chunked or segmented** (per period, per minute).
   Then fetch on demand around the playhead and this is easy. Step 2 of the
   probe answers this.
2. **Byte-range requests plus an index.** Records are newline-delimited and
   variable length, so seeking to "minute 34" needs a byte offset per record or
   per second. Nothing generates such an index today, so this is backend work.
3. **A server-side slice endpoint.** A function that takes `(id, fromSec,
   toSec)` and returns only that window. Netlify's function limits (10 s, ~6 MB
   response) make it a poor place to parse a 876 MB object, so this belongs on
   the controller lambda, which is again backend work.
4. **Downsample and trim at write time.** Most of each record's bulk is the
   9-entry `frame_uuid` window and the per-player probability fields, none of
   which the renderer reads. Positions, numbers, possession, colours and actions
   at 5 fps with interpolation between them (the renderer already has
   `frameInterpolation.ts` and lerps player positions each RAF) would be roughly
   two orders of magnitude smaller. This is the version worth asking the
   pipeline team for.

Anything that says "stream the whole object into memory like the local drop
does" will run the tab out of memory. That has to be stated before implementation
starts.

**Render.** Vendor `src/lib/vis/*` and a trimmed `FootballPitchView.vue` into
Perspecto, load both through `defineAsyncComponent(() => import(...))` so the
Three.js chunk is only fetched when the pipeline tab is first opened, and mount
it where the empty state is now. Keep the empty state for the case where no data
object exists for that project, which will be most projects.

**Sync.** The `timeupdate` event fires about 4 times a second, far too coarse
for a 25 fps view. Drive an own RAF loop that reads `videoEl.currentTime`
directly (`UnifiedVideoPlayer` exposes `singlePlayerRef.videoRef`), map time to
a record index, and call `renderer.setFrame`. Only push when the index actually
changes. The 3D renderer already runs its own RAF for animation mixing and
camera lerp, so this is a data push, not a second render loop.

The mapping itself rests on an assumption that has not been verified:

```
recordIndex = round(videoCurrentTime * fps) + startOffset
```

`frame_count` starts at 457 in the one sample available, and the `frame_uuid`
timestamps are a monotonic clock starting near 1208 s. Neither is zero-based, so
`startOffset` is real and must be read from the data, not assumed to be zero.
Whether `generated.mp4` begins at the first emitted record, and whether the
pipeline ever drops records mid-match (leaving `frame_count` gaps that break a
positional index), both need checking against one real (video, data) pair before
the sync is written.

Index on `frame_count`, not on array position, and do it from the start. A
positional index desyncs silently on a single dropped record: nothing errors,
nothing looks wrong on the first minute, and the players simply drift further
out of position the longer the match runs. There is no on-screen signal that
would tell anyone the view is lying. A `frame_count` lookup either finds the
record or does not.

## Branch B: no data object exists

Then no frontend design delivers this feature. The pipeline has to start
persisting frames, and the format, the downsampling and the retention are
decisions for whoever owns it. The honest deliverable in that case is this
document plus a concrete ask: write `pipeline-output/{id}/` a trimmed,
downsampled, zero-based-indexed data file at the same time it writes
`streams/generated.mp4`.

## Limitations this round has to revisit

The previous design doc listed three things as acceptable only while the tab was
empty, and said so explicitly:

- **Drawing annotations are Video-tab only**, because there was no element to
  mount the drawing canvas on. There now is one, and `:allow-drawing` is
  hard-gated to `activeSurface === 'video'` at `EditorView.vue:1749`.
- **`openQuickPick` is bound to `@contextmenu` on the player container**, which
  the pipeline tab's empty state replaced. With real content, right-click on the
  pitch should reach the same quick pick.
- **Playing while on the pipeline tab gives audio with no picture.** With a
  synced pitch view this becomes correct behaviour rather than a wart, provided
  the pitch actually follows the playhead.

Whether to take all three in this round or only the third is a scope call.

## Side finding, unrelated to this feature

The `AWS_STORAGE_API_KEY` line in `.env` is commented out and carries the value
`629ca3bf-...`. That value is rejected with 403 by both controller endpoints
tried here. That is all that was verified: `aws-storage.cjs` reads
`process.env.AWS_STORAGE_API_KEY` from Netlify's dashboard, not from `.env`, so
nothing here says what the deployed function sends. Two 403s also cannot
separate "revoked" from "scoped to something other than these two endpoints".
Worth confirming the Netlify value independently, but this is a thing to check,
not a diagnosed outage.
