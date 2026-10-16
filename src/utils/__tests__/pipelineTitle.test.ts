// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultPipelineTitle,
  pipelineMatchDate,
  pipelineMatchTitle,
  stashPendingPipelineMatch,
  takePendingPipelineMatch,
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

describe('pipelineMatchDate', () => {
  it('is the calendar day of the link date', () => {
    expect(pipelineMatchDate('2026-10-14')).toBe('2026-10-14');
  });

  // Read off the string, like the title: through Date the day could shift.
  it('ignores any time part', () => {
    expect(pipelineMatchDate('2026-10-14T23:30:00-05:00')).toBe('2026-10-14');
  });

  it('is null for a missing or impossible date', () => {
    expect(pipelineMatchDate(null)).toBeNull();
    expect(pipelineMatchDate('tomorrow')).toBeNull();
    expect(pipelineMatchDate('2026-13-40')).toBeNull();
  });
});

describe('pending pipeline match', () => {
  beforeEach(() => sessionStorage.clear());

  it('hands back the stashed title and date once, for the same id', () => {
    stashPendingPipelineMatch('abc', { title: 'A vs B', matchDate: '2026-10-14' });
    expect(takePendingPipelineMatch('abc')).toEqual({ title: 'A vs B', matchDate: '2026-10-14' });
    expect(takePendingPipelineMatch('abc')).toBeNull();
  });

  // A link can date a match without naming it.
  it('keeps a date without a title', () => {
    stashPendingPipelineMatch('abc', { title: null, matchDate: '2026-10-14' });
    expect(takePendingPipelineMatch('abc')).toEqual({ title: null, matchDate: '2026-10-14' });
  });

  // A stash for one pipeline must never name or date another.
  it('ignores a stash for a different id', () => {
    stashPendingPipelineMatch('abc', { title: 'A vs B', matchDate: null });
    expect(takePendingPipelineMatch('xyz')).toBeNull();
  });

  it('returns null for an unreadable stash', () => {
    sessionStorage.setItem('pendingOutputVideoMatch', '{not json');
    expect(takePendingPipelineMatch('abc')).toBeNull();
  });

  it('drops fields of the wrong type', () => {
    sessionStorage.setItem(
      'pendingOutputVideoMatch',
      JSON.stringify({ id: 'abc', title: 7, matchDate: 'yesterday' })
    );
    expect(takePendingPipelineMatch('abc')).toEqual({ title: null, matchDate: null });
  });
});
