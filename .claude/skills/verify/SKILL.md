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

## Gotchas

- Filter button in the annotation panel: `button[title="Filter annotations"]`.
- Labels may show "No labels available" in the filter dropdown — label data issue, unrelated to UI layout.
