import { describe, it, expect } from 'vitest';
import {
  doesRequestMatchSearchText,
  doesCollectionHaveItemsMatchingSearchText
} from './search';

describe('doesRequestMatchSearchText', () => {
  it('matches by name case-insensitively', () => {
    expect(doesRequestMatchSearchText({ name: 'Get Users' }, 'users')).toBe(true);
    expect(doesRequestMatchSearchText({ name: 'Get Users' }, 'posts')).toBe(false);
  });

  it('returns false when the name is missing', () => {
    expect(doesRequestMatchSearchText({}, 'users')).toBe(false);
    expect(doesRequestMatchSearchText({ name: null }, 'users')).toBe(false);
    expect(doesRequestMatchSearchText(undefined, 'users')).toBe(false);
  });

  it('handles non-string names without throwing (old collections)', () => {
    expect(doesRequestMatchSearchText({ name: 200 }, '200')).toBe(true);
    expect(doesRequestMatchSearchText({ name: 200 }, '404')).toBe(false);
  });
});

describe('doesCollectionHaveItemsMatchingSearchText', () => {
  it('does not throw when a request has a numeric name', () => {
    const collection = {
      items: [
        { type: 'http-request', request: {}, name: 200 },
        { type: 'http-request', request: {}, name: 'Get Users' }
      ]
    };
    expect(() => doesCollectionHaveItemsMatchingSearchText(collection, 'users')).not.toThrow();
    expect(doesCollectionHaveItemsMatchingSearchText(collection, 'users')).toBeTruthy();
  });
});
