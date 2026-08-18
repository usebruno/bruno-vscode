import { describe, test, expect } from 'vitest';
import {
  getRuntimeVariables,
  setRuntimeVariables,
  mergeRuntimeVariables,
  clearRuntimeVariables
} from './runtime-variables';

describe('runtime-variables store', () => {
  test('returns empty object for unknown collection', () => {
    expect(getRuntimeVariables('unknown-coll')).toEqual({});
  });

  test('setRuntimeVariables replaces the stored map', () => {
    const uid = 'coll-set-1';
    setRuntimeVariables(uid, { a: '1', b: '2' });
    expect(getRuntimeVariables(uid)).toEqual({ a: '1', b: '2' });

    // A second set fully replaces — keys not in the new payload are dropped.
    setRuntimeVariables(uid, { b: '3', c: '4' });
    expect(getRuntimeVariables(uid)).toEqual({ b: '3', c: '4' });
  });

  test('mergeRuntimeVariables shallow-merges new keys', () => {
    const uid = 'coll-merge-1';
    setRuntimeVariables(uid, { a: '1', b: '2' });

    const merged = mergeRuntimeVariables(uid, { b: '99', c: '3' });
    expect(merged).toEqual({ a: '1', b: '99', c: '3' });
    expect(getRuntimeVariables(uid)).toEqual({ a: '1', b: '99', c: '3' });
  });

  test('clearRuntimeVariables removes the collection entry', () => {
    const uid = 'coll-clear-1';
    setRuntimeVariables(uid, { a: '1' });
    clearRuntimeVariables(uid);
    expect(getRuntimeVariables(uid)).toEqual({});
  });

  test('isolates values between collections', () => {
    setRuntimeVariables('coll-A', { shared: 'from-A' });
    setRuntimeVariables('coll-B', { shared: 'from-B' });

    expect(getRuntimeVariables('coll-A')).toEqual({ shared: 'from-A' });
    expect(getRuntimeVariables('coll-B')).toEqual({ shared: 'from-B' });
  });

  test('setRuntimeVariables copies the input so external mutation does not leak in', () => {
    const uid = 'coll-copy-1';
    const source = { token: 'abc' };
    setRuntimeVariables(uid, source);
    source.token = 'MUTATED';

    expect(getRuntimeVariables(uid)).toEqual({ token: 'abc' });
  });
});
