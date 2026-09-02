// @vitest-environment jsdom
//
// EditorView is far too large to mount in a unit test, so this covers the
// `activeSidebarPanel` derivation directly rather than the view itself. The
// expression here is a mirror of EditorView.vue's: the panel that actually
// renders is derived from `showHistoryTab` and `sidebarTab`, not read from
// `sidebarTab` alone.
//
// The bug this guards against: when `showHistoryTab` goes false while the
// user is on the History tab (e.g. they sign out with it open), a bare
// `sidebarTab` read leaves the tab bar and the History panel unmounted
// (both are `v-if="showHistoryTab"`) while the annotations panel's
// `v-show="sidebarTab === 'annotations'"` is still false - nothing renders.
// Deriving `activeSidebarPanel` from both refs means that combination can
// never be reached, even for one frame, without a watcher or reset.
import { describe, it, expect } from 'vitest';
import { ref, computed } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SidebarTab } from '@/types/component-interfaces';

describe('EditorView sidebar panel derivation', () => {
  it('falls back to annotations the instant history becomes unavailable, without touching the stored preference', () => {
    const showHistoryTab = ref(true);
    const sidebarTab = ref<SidebarTab>('history');

    // Mirrors EditorView.vue's `activeSidebarPanel` computed.
    const activeSidebarPanel = computed<SidebarTab>(() =>
      showHistoryTab.value ? sidebarTab.value : 'annotations'
    );

    expect(activeSidebarPanel.value).toBe('history');

    // e.g. the user signs out while the History tab is open.
    showHistoryTab.value = false;

    // Must fall back immediately - a computed re-evaluates synchronously,
    // so there is no frame where this reads 'history' with nothing shown.
    expect(activeSidebarPanel.value).toBe('annotations');

    // The user's choice is preserved, not clobbered, so signing back in (or
    // otherwise regaining access) restores the tab they were on.
    expect(sidebarTab.value).toBe('history');
    showHistoryTab.value = true;
    expect(activeSidebarPanel.value).toBe('history');
  });
});

// The computed above mirrors the intended behaviour but is decoupled from
// EditorView.vue's actual template - it would keep passing even if the real
// wrappers regressed to reading `sidebarTab` directly. This checks the
// template source itself, so it fails on exactly that regression: replacing
// `activeSidebarPanel` with a bare `sidebarTab` in either wrapper's
// `v-show`, or in `ActivityTimeline`'s `:active`.
describe('EditorView sidebar panel template bindings', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/views/EditorView.vue'),
    'utf-8'
  );

  // `\s+` between attributes rather than a single space: these assertions are
  // about the bindings, not about whether the formatter has wrapped the tag
  // across lines.
  it('drives the annotations wrapper from activeSidebarPanel', () => {
    const match = source.match(
      /<div\s+v-show="([^"]+)"\s+class="flex-1 overflow-hidden"\s*>\s*<AnnotationPanel/
    );
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("activeSidebarPanel === 'annotations'");
  });

  it("drives the history wrapper and ActivityTimeline's active prop from activeSidebarPanel", () => {
    const match = source.match(
      /<div\s+v-if="showHistoryTab"\s+v-show="([^"]+)"\s+class="flex-1 overflow-hidden"\s*>\s*<ActivityTimeline[\s\S]*?:active="([^"]+)"/
    );
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("activeSidebarPanel === 'history'");
    expect(match?.[2]).toBe("activeSidebarPanel === 'history'");
  });
});
