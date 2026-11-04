import { describe, test, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

const { applyScriptVars, getScriptModifiedKeys } = await import('./environments');

const v = (name: string, value: unknown, enabled = true, extra: Record<string, unknown> = {}) => ({
  uid: name,
  name,
  value,
  enabled,
  ...extra
});

describe('applyScriptVars — direct apply (no baseline)', () => {
  test('updates existing enabled var, adds new var (map is the full enabled set)', () => {
    const result = applyScriptVars([v('a', '1'), v('b', '2')], { a: '10', b: '2', c: '30' }, null);
    expect(result.find((x) => x.name === 'a')?.value).toBe('10');
    expect(result.find((x) => x.name === 'b')?.value).toBe('2');
    expect(result.find((x) => x.name === 'c')?.value).toBe('30');
  });

  test('removes an enabled var absent from the script map (deletion)', () => {
    const result = applyScriptVars([v('a', '1'), v('b', '2')], { a: '1' }, null);
    expect(result.map((x) => x.name)).toEqual(['a']);
  });

  test('preserves a disabled var even when absent from the script map', () => {
    const result = applyScriptVars([v('a', '1'), v('secret', 's', false)], { a: '1' }, null);
    expect(result.map((x) => x.name).sort()).toEqual(['a', 'secret']);
  });

  test('honors skipKeys (never adds or removes based on them)', () => {
    const result = applyScriptVars([v('a', '1')], { a: '1', __name__: 'env' }, null, { skipKeys: ['__name__'] });
    expect(result.map((x) => x.name)).toEqual(['a']);
  });

  test('applies newVarDefaults to inserted variables', () => {
    const result = applyScriptVars([], { a: '1' }, null, { newVarDefaults: { type: 'text', secret: false } });
    expect(result[0]).toMatchObject({ name: 'a', value: '1', enabled: true, type: 'text', secret: false });
  });

  test('does not mutate the input array or entries', () => {
    const input = [v('a', '1')];
    const snapshot = JSON.parse(JSON.stringify(input));
    applyScriptVars(input, { a: '999' }, null);
    expect(input).toEqual(snapshot);
  });
});

describe('applyScriptVars — baseline mode (draft preservation)', () => {
  const baseline = { a: '1', b: '2' };

  test('applies only values changed vs baseline (no-op re-run preserves draft edits)', () => {
    // Draft renamed a's value to 'draft'; script re-runs writing the unchanged baseline value for a.
    const draft = [v('a', 'draft'), v('b', '2')];
    const result = applyScriptVars(draft, { a: '1', b: '2' }, baseline);
    // 'a' unchanged vs baseline -> draft edit preserved; 'b' unchanged -> preserved.
    expect(result.find((x) => x.name === 'a')?.value).toBe('draft');
    expect(result.find((x) => x.name === 'b')?.value).toBe('2');
  });

  test('applies a value the script actually changed', () => {
    const result = applyScriptVars([v('a', '1'), v('b', '2')], { a: '1', b: '99' }, baseline);
    expect(result.find((x) => x.name === 'b')?.value).toBe('99');
  });

  test('adds a var new relative to baseline', () => {
    const result = applyScriptVars([v('a', '1'), v('b', '2')], { a: '1', b: '2', c: '3' }, baseline);
    expect(result.find((x) => x.name === 'c')?.value).toBe('3');
  });

  test('removes an enabled baseline var deleted by the script', () => {
    const result = applyScriptVars([v('a', '1'), v('b', '2')], { a: '1' }, baseline);
    expect(result.map((x) => x.name)).toEqual(['a']);
  });

  test('keeps a draft-added var the script never saw (not in baseline, not in script map)', () => {
    const draft = [v('a', '1'), v('b', '2'), v('draftOnly', 'x')];
    const result = applyScriptVars(draft, { a: '1', b: '2' }, baseline);
    expect(result.find((x) => x.name === 'draftOnly')?.value).toBe('x');
  });

  test('preserves disabled vars', () => {
    const result = applyScriptVars([v('a', '1'), v('off', 'o', false)], { a: '1' }, baseline);
    expect(result.find((x) => x.name === 'off')).toBeTruthy();
  });

  test('applying a draft-derived script map onto SAVED vars does not flush an unsaved draft edit', () => {
    // Reproduces the collection-var persistence contract: the script sees draft values, so the
    // baseline is the draft snapshot; only what the script changed (b) is written to the saved vars,
    // and the unsaved draft edit to `a` is NOT flushed to the saved file.
    const savedVars = [v('a', 'saved_a'), v('b', 'saved_b')];
    const draftBaseline = { a: 'draft_a', b: 'saved_b' };
    const scriptMap = { a: 'draft_a', b: 'script_b' }; // script only touched b; a carries the draft value
    const result = applyScriptVars(savedVars, scriptMap, draftBaseline);
    expect(result.find((x) => x.name === 'a')?.value).toBe('saved_a');
    expect(result.find((x) => x.name === 'b')?.value).toBe('script_b');
  });
});

describe('getScriptModifiedKeys', () => {
  test('returns changed and new keys, excludes unchanged baseline values', () => {
    const keys = getScriptModifiedKeys({ a: '1', b: '99', c: '3' }, { a: '1', b: '2' });
    expect([...keys].sort()).toEqual(['b', 'c']);
  });

  test('treats structurally-equal objects as unchanged', () => {
    const keys = getScriptModifiedKeys({ o: { x: 1 } }, { o: { x: 1 } });
    expect(keys.size).toBe(0);
  });

  test('without baseline returns all keys except skipKeys', () => {
    const keys = getScriptModifiedKeys({ a: '1', __name__: 'e' }, null, { skipKeys: ['__name__'] });
    expect([...keys]).toEqual(['a']);
  });
});
