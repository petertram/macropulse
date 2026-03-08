import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  todayStr,
  currentYearStart,
  lastYearEnd,
  lastYearLastMonth,
  offsetDate,
  isDateCurrent,
  getPercentileRank,
  pearsonCorrelation,
  toMonthKey,
} from '../utils.js';

// ── Date Utilities ────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the current UTC date', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(todayStr()).toBe(expected);
  });
});

describe('currentYearStart', () => {
  it('returns January 1st of the current year', () => {
    const year = new Date().getFullYear();
    expect(currentYearStart()).toBe(`${year}-01-01`);
  });
});

describe('lastYearEnd', () => {
  it('returns December 31st of the previous year', () => {
    const year = new Date().getFullYear() - 1;
    expect(lastYearEnd()).toBe(`${year}-12-31`);
  });
});

describe('lastYearLastMonth', () => {
  it('returns December of the previous year as YYYY-MM', () => {
    const year = new Date().getFullYear() - 1;
    expect(lastYearLastMonth()).toBe(`${year}-12`);
  });
});

describe('offsetDate', () => {
  it('returns the same date for delta 0', () => {
    expect(offsetDate('2026-03-08', 0)).toBe('2026-03-08');
  });

  it('returns the next day for delta +1', () => {
    expect(offsetDate('2026-03-08', 1)).toBe('2026-03-09');
  });

  it('returns the previous day for delta -1', () => {
    expect(offsetDate('2026-03-08', -1)).toBe('2026-03-07');
  });

  it('handles month boundary correctly', () => {
    expect(offsetDate('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('handles year boundary correctly', () => {
    expect(offsetDate('2025-12-31', 1)).toBe('2026-01-01');
  });
});

describe('isDateCurrent', () => {
  it('returns true for today', () => {
    expect(isDateCurrent(todayStr())).toBe(true);
  });

  it('returns true for yesterday', () => {
    const yesterday = offsetDate(todayStr(), -1);
    expect(isDateCurrent(yesterday)).toBe(true);
  });

  it('returns true for 3 days ago (weekend coverage)', () => {
    const threeDaysAgo = offsetDate(todayStr(), -3);
    expect(isDateCurrent(threeDaysAgo)).toBe(true);
  });

  it('returns false for dates older than lookback window', () => {
    const oldDate = offsetDate(todayStr(), -10);
    expect(isDateCurrent(oldDate)).toBe(false);
  });

  it('returns false for future dates', () => {
    const futureDate = offsetDate(todayStr(), 5);
    expect(isDateCurrent(futureDate)).toBe(false);
  });
});

// ── Statistical Utilities ─────────────────────────────────────────────────────

describe('getPercentileRank', () => {
  it('returns 50 for an empty array', () => {
    expect(getPercentileRank([], 5)).toBe(50);
  });

  it('returns 100 when currentVal is the maximum', () => {
    expect(getPercentileRank([1, 2, 3, 4, 5], 5)).toBe(100);
  });

  it('returns 0 when currentVal is below all values', () => {
    expect(getPercentileRank([2, 3, 4, 5], 1)).toBe(0);
  });

  it('returns ~50 for the median value in an ordered set', () => {
    const pct = getPercentileRank([1, 2, 3, 4, 5], 3);
    expect(pct).toBe(60); // 3 of 5 values ≤ 3 → 60%
  });

  it('handles duplicate values correctly', () => {
    const pct = getPercentileRank([2, 2, 2, 4, 4], 2);
    expect(pct).toBe(60); // 3 of 5 ≤ 2 → 60%
  });

  it('handles a single-element array', () => {
    expect(getPercentileRank([7], 7)).toBe(100);
    expect(getPercentileRank([7], 1)).toBe(0);
  });
});

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly positively correlated series', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
    expect(pearsonCorrelation(xs, ys)).toBe(1);
  });

  it('returns -1 for perfectly negatively correlated series', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expect(pearsonCorrelation(xs, ys)).toBe(-1);
  });

  it('returns 0 for constant series (zero variance)', () => {
    const xs = [3, 3, 3, 3, 3, 3];
    const ys = [1, 2, 3, 4, 5, 6];
    expect(pearsonCorrelation(xs, ys)).toBe(0);
  });

  it('returns 0 when fewer than minObs paired observations', () => {
    expect(pearsonCorrelation([1, 2], [3, 4], 5)).toBe(0);
  });

  it('uses the default minObs of 5', () => {
    // 4 values → below default minObs of 5
    expect(pearsonCorrelation([1, 2, 3, 4], [1, 2, 3, 4])).toBe(0);
    // 5 values → meets default minObs
    expect(pearsonCorrelation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBe(1);
  });

  it('handles mismatched array lengths by using the shorter one', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ys = [1, 2, 3, 4, 5]; // shorter
    // Should compute with n=5 pairs
    expect(pearsonCorrelation(xs, ys)).toBe(1);
  });
});

// ── Date Formatting Utilities ────────────────────────────────────────────────

describe('toMonthKey', () => {
  it('formats a date to YYYY-MM', () => {
    const d = new Date('2026-03-08T12:00:00Z');
    expect(toMonthKey(d)).toBe('2026-03');
  });

  it('zero-pads single-digit months', () => {
    const d = new Date('2026-01-15T00:00:00Z');
    expect(toMonthKey(d)).toBe('2026-01');
  });

  it('handles December correctly', () => {
    const d = new Date('2025-12-31T00:00:00Z');
    expect(toMonthKey(d)).toBe('2025-12');
  });
});
