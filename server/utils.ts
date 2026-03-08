// Pure utility functions for MacroPulse server — extracted from index.ts for testability

import { DATA_CURRENCY_LOOKBACK_DAYS } from './constants.js';

/** Returns today as YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns January 1st of the current year as YYYY-MM-DD */
export function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** Returns December 31st of the previous year as YYYY-MM-DD */
export function lastYearEnd(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

/** Returns the last month of the previous year as YYYY-MM */
export function lastYearLastMonth(): string {
  return `${new Date().getFullYear() - 1}-12`;
}

/**
 * Returns a date string offset by `daysDelta` from `baseDate`.
 * @param baseDate - ISO date string (YYYY-MM-DD) or Date object
 * @param daysDelta - Negative for past days, positive for future days
 */
export function offsetDate(baseDate: Date | string, daysDelta: number): string {
  const d = new Date(typeof baseDate === 'string' ? baseDate + 'T00:00:00Z' : baseDate);
  d.setUTCDate(d.getUTCDate() + daysDelta);
  return d.toISOString().split('T')[0];
}

/**
 * Checks whether a given date string (YYYY-MM-DD) is recent enough to be
 * considered "current" data. FRED has no weekend data, so we look back
 * DATA_CURRENCY_LOOKBACK_DAYS days.
 */
export function isDateCurrent(dateStr: string): boolean {
  const today = todayStr();
  const candidates: string[] = [];
  for (let i = 0; i <= DATA_CURRENCY_LOOKBACK_DAYS; i++) {
    candidates.push(offsetDate(today, -i));
  }
  return candidates.includes(dateStr);
}

/**
 * Computes the percentile rank of `currentVal` within `values`.
 * Returns a value in [0, 100].
 */
export function getPercentileRank(values: number[], currentVal: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.filter(v => v <= currentVal).length;
  return (rank / sorted.length) * 100;
}

/**
 * Computes the Pearson correlation coefficient between xs and ys.
 * Returns 0 if there are fewer than minObs paired observations or zero variance.
 */
export function pearsonCorrelation(xs: number[], ys: number[], minObs = 5): number {
  const n = Math.min(xs.length, ys.length);
  if (n < minObs) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const num = xs.slice(0, n).reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.slice(0, n).reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.slice(0, n).reduce((s, y) => s + (y - my) ** 2, 0)
  );
  if (den === 0) return 0;
  return Math.round((num / den) * 100) / 100;
}

/**
 * Formats a Date to YYYY-MM string.
 */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
