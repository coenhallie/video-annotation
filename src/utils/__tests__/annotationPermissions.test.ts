import { describe, it, expect } from 'vitest';
import { canCreateAnnotations } from '../annotationPermissions';

const me = 'user-me';
const someoneElse = 'user-other';

describe('canCreateAnnotations, single videos', () => {
  it('lets the owner annotate their own video', () => {
    expect(canCreateAnnotations({ ownerId: me, isPublic: false }, me)).toBe(true);
  });

  // Since 20261016_team_library_and_video_delete.sql the whole library is
  // shared with the team: a teammate's private upload is visible to and
  // annotatable by every signed-in account. The rule used to stop at
  // isPublic || owner || pipeline output, which would now show "View only" on
  // videos the database accepts annotations for.
  it("lets a signed-in teammate annotate someone else's private video", () => {
    expect(canCreateAnnotations({ ownerId: someoneElse, isPublic: false }, me)).toBe(true);
  });

  it('lets a signed-in teammate annotate a pipeline output', () => {
    expect(
      canCreateAnnotations(
        { ownerId: someoneElse, isPublic: false, videoId: 'aws:1b30b3cc' },
        me
      )
    ).toBe(true);
  });

  it('refuses anonymous visitors, even on a public video', () => {
    // Every insert policy requires auth.uid(), so signing in is not optional.
    expect(canCreateAnnotations({ ownerId: someoneElse, isPublic: true }, null)).toBe(false);
  });

  it('refuses while the target has not loaded yet', () => {
    expect(canCreateAnnotations(null, me)).toBe(false);
    expect(canCreateAnnotations(undefined, me)).toBe(false);
  });
});

// Comparisons were not widened: comparison_videos stays visible to its
// creator, or to everyone when shared by link.
describe('canCreateAnnotations, comparisons', () => {
  it('lets the creator annotate their comparison', () => {
    expect(
      canCreateAnnotations({ isComparison: true, ownerId: me, isPublic: false }, me)
    ).toBe(true);
  });

  it('lets a signed-in teammate annotate a comparison shared by link', () => {
    expect(
      canCreateAnnotations({ isComparison: true, ownerId: someoneElse, isPublic: true }, me)
    ).toBe(true);
  });

  it("refuses someone else's private comparison", () => {
    expect(
      canCreateAnnotations({ isComparison: true, ownerId: someoneElse, isPublic: false }, me)
    ).toBe(false);
  });

  it('treats a missing isPublic flag as not shared', () => {
    expect(canCreateAnnotations({ isComparison: true, ownerId: someoneElse }, me)).toBe(false);
  });

  it('refuses anonymous visitors', () => {
    expect(
      canCreateAnnotations({ isComparison: true, ownerId: someoneElse, isPublic: true }, null)
    ).toBe(false);
  });
});
