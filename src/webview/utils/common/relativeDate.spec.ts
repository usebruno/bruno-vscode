import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeDate } from './index';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-01T12:00:00.000Z');

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

describe('relativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('reports recent times', () => {
    expect(relativeDate(new Date(NOW.getTime() - 5 * 1000))).toBe('Few seconds ago');
    expect(relativeDate(new Date(NOW.getTime() - 2 * 60 * 1000))).toBe('2 minutes ago');
    expect(relativeDate(new Date(NOW.getTime() - 3 * 60 * 60 * 1000))).toBe('3 hours ago');
  });

  test('reports days and weeks', () => {
    expect(relativeDate(daysAgo(3))).toBe('3 days ago');
    expect(relativeDate(daysAgo(21))).toBe('3 weeks ago');
    expect(relativeDate(daysAgo(27))).toBe('3 weeks ago');
  });

  test('does not report "0 month ago" between four weeks and a month', () => {
    // 28 and 29 days used to fall through to the months branch where
    // Math.floor(days / 30) is still 0, producing "0 month ago".
    expect(relativeDate(daysAgo(28))).toBe('4 weeks ago');
    expect(relativeDate(daysAgo(29))).toBe('4 weeks ago');
  });

  test('reports months from 30 days onward', () => {
    expect(relativeDate(daysAgo(30))).toBe('1 month ago');
    expect(relativeDate(daysAgo(70))).toBe('2 months ago');
  });
});
