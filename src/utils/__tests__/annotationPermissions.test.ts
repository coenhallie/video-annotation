import { describe, it, expect } from 'vitest';
import { canCreateAnnotations } from '../annotationPermissions';

const me = 'user-me';
const someoneElse = 'user-other';

describe('canCreateAnnotations', () => {
  it('lets the owner annotate their own video', () => {
    expect(canCreateAnnotations({ ownerId: me, isPublic: false }, me)).toBe(
      true
    );
  });

  it('lets a non-owner annotate any video they can see', () => {
    // The case that used to 403: the dashboard lists other people's shared
    // videos, and annotating them is now open.
    expect(
      canCreateAnnotations({ ownerId: someoneElse, isPublic: true }, me)
    ).toBe(true);
  });

  it('refuses a private video belonging to someone else', () => {
    expect(
      canCreateAnnotations({ ownerId: someoneElse, isPublic: false }, me)
    ).toBe(false);
  });

  it('refuses anonymous visitors on a public video', () => {
    // Every insert policy requires auth.uid(), so signing in is not optional.
    expect(
      canCreateAnnotations({ ownerId: someoneElse, isPublic: true }, null)
    ).toBe(false);
  });

  it('refuses while the target has not loaded yet', () => {
    expect(canCreateAnnotations(null, me)).toBe(false);
    expect(canCreateAnnotations(undefined, me)).toBe(false);
  });

  it('treats a missing isPublic flag as not public', () => {
    expect(canCreateAnnotations({ ownerId: someoneElse }, me)).toBe(false);
  });

  // Since 20260903_rename_video.sql every signed-in account can see and
  // annotate pipeline outputs, public or not. The rule here used to stop at
  // isPublic || owner, so a teammate opening one saw "View only" while the
  // database would have taken their annotation.
  it('lets a signed-in non-owner annotate a private pipeline output', () => {
    expect(
      canCreateAnnotations(
        { ownerId: someoneElse, isPublic: false, videoId: 'aws:1b30b3cc' },
        me
      )
    ).toBe(true);
  });

  it('still refuses anonymous visitors on a pipeline output', () => {
    expect(
      canCreateAnnotations(
        { ownerId: someoneElse, isPublic: false, videoId: 'aws:1b30b3cc' },
        null
      )
    ).toBe(false);
  });

  it('does not mistake an ordinary upload id for a pipeline output', () => {
    expect(
      canCreateAnnotations(
        { ownerId: someoneElse, isPublic: false, videoId: 'upload_1770221101010' },
        me
      )
    ).toBe(false);
  });
});
