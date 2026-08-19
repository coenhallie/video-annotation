---
name: verify
description: How to build, launch, and drive this app to verify changes at runtime
---

# Verifying changes in video-annotation (Perspecto)

## Launch

- Dev server: `npm run dev -- --port 5174 --strictPort --host 127.0.0.1` (Vite, up in ~1s).
  A stale `node` process often squats on 5173 and accepts connections without responding — don't reuse it, pick another port.
- Auth: `.env` has `VITE_DEV_AUTH_BYPASS=true` with real dev credentials, so the app auto-signs-in on load (~2-3s). No login flow needed.

## Drive (headless browser)

- No Playwright in the repo. `npm i playwright-core` in a scratch dir and launch with `chromium.launch({ headless: true, channel: 'chrome' })` — uses system Chrome, no browser download.
- Use `waitUntil: 'domcontentloaded'`, never `networkidle` (Vite HMR + Supabase realtime websockets never go idle).
- Dashboard rows are divs, not links. Single click on a video row opens the details panel; click its **Open** button (`getByRole('button', { name: /open/i })`) to reach the editor at `/video/:id`.
- Editor layout: video `<section>` on the left, `w-96` annotation sidebar `<aside>` on the right. Sidebar and panel root are overflow-clipping (`overflow-hidden` / `overflow-x-hidden`) — anything absolutely positioned in the panel that pokes past the aside gets clipped, useful to hit-test with `document.elementFromPoint`.
- Known good test video: "demoshort2" (id 95b16bb2-96af-4495-99d3-3c9bd3abd346).

## This drives live production data

The dev auth bypass signs in as the real account, so every write the browser makes
lands in the real Supabase project. Annotations are hard-deleted - no `deleted_at`,
no audit table - so a wrong click is unrecoverable outside a backup restore.

- Prefer read-only verification. When a check genuinely needs a write, create your
  own row first, then act only on that row.
- Never `.first()` / `.last()` an unfiltered list. Sorting is by timestamp, so a
  test annotation created at frame 0 lands at the *top*, and `.last()` is still a
  real one. This has already destroyed an annotation once.
- Target by unique text you typed yourself (`zz-test-<something>`), assert the
  locator matches exactly one row, and re-read the list right before any
  destructive click.
- Restore whatever you changed, and say in the report what was written - editing
  and reverting still moves `updated_at` and replaces label association rows.

## Gotchas

- Filter button in the annotation panel: `button[title="Filter annotations"]`.
- Labels may show "No labels available" in the filter dropdown — label data issue, unrelated to UI layout.
