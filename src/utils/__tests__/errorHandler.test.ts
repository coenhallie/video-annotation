import { describe, it, expect } from 'vitest';
import { errorMessage } from '@/utils/errorHandler';

describe('errorMessage', () => {
  it('reads an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  // Supabase/PostgREST errors are plain objects; String() on them is
  // "[object Object]", which is what users were shown.
  it('reads the message of a plain-object error', () => {
    expect(errorMessage({ message: 'permission denied', code: '42501' })).toBe(
      'permission denied'
    );
  });

  it('passes a string through', () => {
    expect(errorMessage('nope')).toBe('nope');
  });

  it('never returns "[object Object]"', () => {
    expect(errorMessage({ code: 'X' })).toBe('Unknown error');
  });
});
