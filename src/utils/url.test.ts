import { describe, expect, it } from 'vitest';
import { parseParamsFromUrl } from './url';

describe('parseParamsFromUrl', () => {
  it('lists query params, then path params, all enabled', () => {
    expect(parseParamsFromUrl('https://api.test/users/:id/posts?page=2&sort=desc')).toEqual([
      { name: 'page', value: '2', enabled: true, type: 'query' },
      { name: 'sort', value: 'desc', enabled: true, type: 'query' },
      { name: 'id', value: '', enabled: true, type: 'path' }
    ]);
  });

  it('keeps query values as written, as the URL bar does', () => {
    expect(parseParamsFromUrl('https://api.test/search?q=a%20b&flag')).toEqual([
      { name: 'q', value: 'a%20b', enabled: true, type: 'query' },
      { name: 'flag', value: '', enabled: true, type: 'query' }
    ]);
  });

  it('does not split on a "?" inside a {{variable}}', () => {
    expect(parseParamsFromUrl('{{base?url}}/users?page=1')).toEqual([
      { name: 'page', value: '1', enabled: true, type: 'query' }
    ]);
  });

  it('returns nothing for a URL without params', () => {
    expect(parseParamsFromUrl('https://api.test/users')).toEqual([]);
  });
});
