// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultPipelineTitle,
  pipelineMatchTitle,
  stashPendingPipelineTitle,
  takePendingPipelineTitle,
} from '@/utils/pipelineTitle';

describe('defaultPipelineTitle', () => {
  it('is the prefix plus the first 8 characters of the id', () => {
    expect(defaultPipelineTitle('9eddbba3-4e1f-4e02-8072-3679b22de1e0')).toBe(
      'Pipeline Output - 9eddbba3'
    );
  });
});

describe('pipelineMatchTitle', () => {
  it('formats match, competition and date', () => {
    expect(
      pipelineMatchTitle({
        match: 'Manchester City vs PSG',
        competition: 'Champions League',
        date: '2026-10-14',
      })
    ).toBe('Manchester City vs PSG - Champions League - 14/10/2026');
  });

  // DALF's game dates can carry a time. The calendar day is the one written in
  // the string; parsing it through Date would shift it by the local offset.
  it('takes the day from the date string, ignoring any time part', () => {
    expect(
      pipelineMatchTitle({ match: 'A vs B', competition: 'Cup', date: '2026-10-14T23:30:00-05:00' })
    ).toBe('A vs B - Cup - 14/10/2026');
  });

  // DALF fills a missing value with "N/A". A title reading "- N/A -" is worse
  // than one without that part.
  it('drops a competition that is missing or N/A', () => {
    expect(pipelineMatchTitle({ match: 'A vs B', date: '2026-10-14' })).toBe('A vs B - 14/10/2026');
    expect(pipelineMatchTitle({ match: 'A vs B', competition: 'N/A', date: '2026-10-14' })).toBe(
      'A vs B - 14/10/2026'
    );
  });

  it('drops a date that is missing or not a calendar date', () => {
    expect(pipelineMatchTitle({ match: 'A vs B', competition: 'Cup' })).toBe('A vs B - Cup');
    expect(pipelineMatchTitle({ match: 'A vs B', competition: 'Cup', date: 'tomorrow' })).toBe(
      'A vs B - Cup'
    );
    expect(pipelineMatchTitle({ match: 'A vs B', competition: 'Cup', date: '2026-13-40' })).toBe(
      'A vs B - Cup'
    );
  });

  // Without the match there is nothing that identifies the video; the default
  // title, which at least carries the pipeline id, is the better name.
  it('returns null without a match', () => {
    expect(pipelineMatchTitle({ competition: 'Cup', date: '2026-10-14' })).toBeNull();
    expect(pipelineMatchTitle({ match: 'N/A', competition: 'Cup' })).toBeNull();
    expect(pipelineMatchTitle({ match: '   ', competition: 'Cup' })).toBeNull();
  });

  it('trims and collapses whitespace in each part', () => {
    expect(pipelineMatchTitle({ match: '  A   vs\tB ', competition: ' Cup  Final ' })).toBe(
      'A vs B - Cup Final'
    );
  });

  // rename_video refuses anything longer than 200 characters, and the parts
  // come from a URL anyone can write.
  it('never returns more than 200 characters', () => {
    const title = pipelineMatchTitle({ match: 'x'.repeat(500), competition: 'Cup' });
    expect(title).not.toBeNull();
    expect(title!.length).toBeLessThanOrEqual(200);
  });
});

describe('pending pipeline title', () => {
  beforeEach(() => sessionStorage.clear());

  it('hands back the stashed title once, for the same id', () => {
    stashPendingPipelineTitle('abc', 'A vs B');
    expect(takePendingPipelineTitle('abc')).toBe('A vs B');
    expect(takePendingPipelineTitle('abc')).toBeNull();
  });

  // A title stashed for one pipeline must never name another.
  it('ignores a title stashed for a different id', () => {
    stashPendingPipelineTitle('abc', 'A vs B');
    expect(takePendingPipelineTitle('xyz')).toBeNull();
  });

  it('returns null for an unreadable stash', () => {
    sessionStorage.setItem('pendingOutputVideoTitle', '{not json');
    expect(takePendingPipelineTitle('abc')).toBeNull();
  });
});
