import { describe, it, expect } from 'vitest';
import {
  CATEGORY_ORDER,
  assignLabelShortcuts,
  categoryKeyForLabel,
  groupLabelsByCategory,
  labelShortName,
} from '../labelCategories';
import type { Label } from '@/types/labels';

const makeLabel = (name: string, id = name): Label => ({
  id,
  name,
  color: '#000000',
  isDefault: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('categoryKeyForLabel', () => {
  it('maps each known prefix to its category key', () => {
    expect(categoryKeyForLabel(makeLabel('EVT MISSED'))).toBe('EVT');
    expect(categoryKeyForLabel(makeLabel('PITCH LINES MISMATCH'))).toBe('PITCH');
    expect(categoryKeyForLabel(makeLabel('TEAM ASSIGN WRONG'))).toBe('TEAM');
    expect(categoryKeyForLabel(makeLabel('NPL MISSED'))).toBe('NPL');
    expect(categoryKeyForLabel(makeLabel('PLR ID SWITCH'))).toBe('PLR');
    expect(categoryKeyForLabel(makeLabel('BALL TRAJ IMPLAUSIBLE'))).toBe('BALL');
  });

  it('returns null for an unrecognised prefix', () => {
    expect(categoryKeyForLabel(makeLabel('PLY MISSED'))).toBeNull();
    expect(categoryKeyForLabel(makeLabel('My custom label'))).toBeNull();
    expect(categoryKeyForLabel(makeLabel(''))).toBeNull();
  });

  it('is case insensitive on the prefix and tolerates extra whitespace', () => {
    expect(categoryKeyForLabel(makeLabel('  evt  missed  '))).toBe('EVT');
  });

  it('does not match a prefix that is only part of a longer token', () => {
    expect(categoryKeyForLabel(makeLabel('EVTX MISSED'))).toBeNull();
  });
});

describe('labelShortName', () => {
  it('strips the category prefix', () => {
    expect(labelShortName(makeLabel('BALL TRAJ IMPLAUSIBLE'))).toBe(
      'TRAJ IMPLAUSIBLE'
    );
  });

  it('returns the full name when there is no known prefix', () => {
    expect(labelShortName(makeLabel('My custom label'))).toBe('My custom label');
  });

  it('returns the full name when the prefix is the whole name', () => {
    expect(labelShortName(makeLabel('BALL'))).toBe('BALL');
  });
});

describe('groupLabelsByCategory', () => {
  it('groups labels and returns categories in CATEGORY_ORDER', () => {
    const groups = groupLabelsByCategory([
      makeLabel('BALL MISSED'),
      makeLabel('EVT MISSED'),
      makeLabel('PLR MISSED'),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['EVT', 'PLR', 'BALL']);
    expect(CATEGORY_ORDER.indexOf('EVT')).toBeLessThan(
      CATEGORY_ORDER.indexOf('BALL')
    );
  });

  it('gives every category a distinct single-character glyph', () => {
    const groups = groupLabelsByCategory([
      makeLabel('EVT MISSED'),
      makeLabel('PITCH LINES MISMATCH'),
      makeLabel('TEAM ASSIGN WRONG'),
      makeLabel('NPL MISSED'),
      makeLabel('PLR MISSED'),
      makeLabel('BALL MISSED'),
    ]);
    const letters = groups.map((g) => g.letter);
    expect(letters).toEqual(['E', 'P', 'T', 'N', 'L', 'B']);
    // PITCH and PLR both start with P, so the glyphs must not collide.
    expect(new Set(letters).size).toBe(letters.length);
    expect(letters.every((l) => l.length === 1)).toBe(true);
  });

  it('omits categories with no labels', () => {
    const groups = groupLabelsByCategory([makeLabel('EVT MISSED')]);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group).toBeDefined();
    expect(group?.key).toBe('EVT');
    expect(group?.name).toBe('Events');
  });

  it('excludes labels with an unrecognised prefix', () => {
    const groups = groupLabelsByCategory([
      makeLabel('EVT MISSED'),
      makeLabel('PLY MISSED'),
      makeLabel('Custom thing'),
    ]);
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group).toBeDefined();
    expect(group?.labels.map((l) => l.name)).toEqual(['EVT MISSED']);
  });

  it('preserves the incoming order of labels within a category', () => {
    const groups = groupLabelsByCategory([
      makeLabel('PLR TELEPORT'),
      makeLabel('PLR MISSED'),
    ]);
    const group = groups[0];
    expect(group).toBeDefined();
    expect(group?.labels.map((l) => l.name)).toEqual([
      'PLR TELEPORT',
      'PLR MISSED',
    ]);
  });

  it('returns an empty array when nothing is categorisable', () => {
    expect(groupLabelsByCategory([makeLabel('Custom thing')])).toEqual([]);
    expect(groupLabelsByCategory([])).toEqual([]);
  });
});

describe('assignLabelShortcuts', () => {
  const lettersFor = (names: string[]) => {
    const labels = names.map((n) => makeLabel(n));
    const map = assignLabelShortcuts(labels);
    return labels.map((l) => map[l.id]);
  };

  it('gives each label the initial of its first word when they do not collide', () => {
    expect(lettersFor(['PLR MISSED', 'PLR DUPLICATE', 'PLR TELEPORT'])).toEqual([
      'M',
      'D',
      'T',
    ]);
  });

  it('gives a contested initial to neither label, so the pair stays memorable', () => {
    // BALL: both WRONG labels open with W, so W goes unused and they fall
    // through to the initial of their second word.
    expect(
      lettersFor([
        'BALL HIGH MISCLASS',
        'BALL MISSED',
        'BALL TRAJ IMPLAUSIBLE',
        'BALL WRONG OWNER',
        'BALL WRONG POS',
      ])
    ).toEqual(['H', 'M', 'T', 'O', 'P']);
  });

  it('resolves a three-way collision without reusing a letter', () => {
    const letters = lettersFor(['EVT TIME ERROR', 'EVT TYPE WRONG', 'EVT TRACK LOST']);
    expect(new Set(letters).size).toBe(3);
    expect(letters).not.toContain('T');
  });

  it('always assigns a distinct letter to every label', () => {
    const letters = lettersFor([
      'PLR AS NPL',
      'PLR DUPLICATE',
      'PLR ID SWITCH',
      'PLR KEEPER WRONG POS',
      'PLR MISSED',
      'PLR TELEPORT',
      'PLR WRONG POS',
    ]);
    expect(letters).toHaveLength(7);
    expect(letters.every((l) => typeof l === 'string' && l.length === 1)).toBe(true);
    expect(new Set(letters).size).toBe(7);
  });

  it('falls back to a free letter when a name offers no untaken candidate', () => {
    // Three identically named labels can only supply the letter A between them.
    const labels = ['a', 'b', 'c'].map((id) => makeLabel('BALL AA', id));
    const map = assignLabelShortcuts(labels);
    const letters = labels.map((l) => map[l.id]);
    expect(letters.every((l) => typeof l === 'string' && l.length === 1)).toBe(true);
    expect(new Set(letters).size).toBe(3);
  });

  it('is deterministic for the same input', () => {
    const names = ['BALL WRONG OWNER', 'BALL WRONG POS', 'BALL MISSED'];
    expect(lettersFor(names)).toEqual(lettersFor(names));
  });

  it('returns an empty map for no labels', () => {
    expect(assignLabelShortcuts([])).toEqual({});
  });
});
