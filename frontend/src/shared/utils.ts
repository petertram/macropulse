import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export type HistoryRange = 'ALL' | '10Y' | '5Y' | '3Y' | '1Y';

export const HISTORY_RANGE_OPTIONS: { value: HistoryRange; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: '10Y', label: '10Y' },
    { value: '5Y', label: '5Y' },
    { value: '3Y', label: '3Y' },
    { value: '1Y', label: '1Y' },
];

export const CHART_AXIS_COLOR = 'rgba(255,255,255,0.72)';
export const CHART_AXIS_TICK = { fill: 'rgba(255,255,255,0.78)', fontSize: 10 };
export const CHART_GRID_COLOR = 'rgba(255,255,255,0.08)';
export const CHART_REFERENCE_COLOR = 'rgba(255,255,255,0.28)';

const HISTORY_RANGE_YEARS: Record<Exclude<HistoryRange, 'ALL'>, number> = {
    '10Y': 10,
    '5Y': 5,
    '3Y': 3,
    '1Y': 1,
};

function isHistoryRange(value: string | null): value is HistoryRange {
    return value === 'ALL' || value === '10Y' || value === '5Y' || value === '3Y' || value === '1Y';
}

function parseHistoryDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const normalized = /^\d{4}-\d{2}$/.test(dateStr) ? `${dateStr}-01` : dateStr;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatHistoryDateLabel(dateStr: string, range: HistoryRange): string {
    const parsed = parseHistoryDate(dateStr);
    if (!parsed) return dateStr;

    const options: Intl.DateTimeFormatOptions = range === 'ALL' || range === '10Y'
        ? { year: '2-digit' }
        : { month: 'short', year: '2-digit' };

    return parsed.toLocaleDateString('en-US', options);
}

export function getHistoryTickFormatter(range: HistoryRange) {
    return (value: string | number) => formatHistoryDateLabel(String(value), range);
}

function getSortedDatedEntries<T extends { date: string }>(series: T[]) {
    return [...series]
        .map(item => ({ item, parsedDate: parseHistoryDate(item.date) }))
        .filter((entry): entry is { item: T; parsedDate: Date } => entry.parsedDate !== null)
        .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
}

export function getStoredHistoryRange(storageKey = 'history-range'): HistoryRange {
    if (typeof window === 'undefined') return 'ALL';
    const stored = window.localStorage.getItem(storageKey);
    return isHistoryRange(stored) ? stored : 'ALL';
}

export function setStoredHistoryRange(range: HistoryRange, storageKey = 'history-range') {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, range);
}

export function filterHistoryByRange<T extends { date: string }>(series: T[], range: HistoryRange): T[] {
    const datedEntries = getSortedDatedEntries(series);
    if (range === 'ALL' || datedEntries.length === 0) {
        return datedEntries.map(entry => entry.item);
    }

    const latestDate = datedEntries[datedEntries.length - 1].parsedDate;
    const cutoffDate = new Date(latestDate);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - HISTORY_RANGE_YEARS[range]);

    return datedEntries
        .filter(entry => entry.parsedDate >= cutoffDate)
        .map(entry => entry.item);
}

export function getHistoryCoverageLabel<T extends { date: string }>(series: T[]): string {
    const datedEntries = getSortedDatedEntries(series);
    if (datedEntries.length === 0) return 'Data: N/A';

    const firstDate = datedEntries[0].parsedDate;
    const lastDate = datedEntries[datedEntries.length - 1].parsedDate;
    const currentYear = new Date().getFullYear();
    const endLabel = lastDate.getFullYear() >= currentYear ? 'present' : `${lastDate.getFullYear()}`;

    return `Data: ${firstDate.getFullYear()}-${endLabel}`;
}

export function hasMixedCadenceHistory<T extends { date: string }>(series: T[]): boolean {
    const datedEntries = getSortedDatedEntries(series);
    if (datedEntries.length < 3) return false;

    let hasDailyLikeGap = false;
    let hasMonthlyLikeGap = false;

    for (let i = 1; i < datedEntries.length; i++) {
        const gapDays = (datedEntries[i].parsedDate.getTime() - datedEntries[i - 1].parsedDate.getTime()) / 86400000;
        if (gapDays <= 7) hasDailyLikeGap = true;
        if (gapDays >= 20) hasMonthlyLikeGap = true;
        if (hasDailyLikeGap && hasMonthlyLikeGap) return true;
    }

    return false;
}

export function downsampleHistory<T>(series: T[], maxPoints: number): T[] {
    if (maxPoints <= 0 || series.length <= maxPoints) return series;
    const step = Math.ceil(series.length / maxPoints);
    return series.filter((_, index) => index % step === 0 || index === series.length - 1);
}

export const calculateScore = (val: number | null, minRisk: number, maxRisk: number, weight: number) => {
    if (val === null || val === undefined || isNaN(val)) return 0;
    let pct = (val - minRisk) / (maxRisk - minRisk);
    pct = Math.max(0, Math.min(1, pct));
    return Math.round(pct * weight);
};

export const getPearsonCorrelation = (x: number[], y: number[]) => {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    let n = 0;
    for (let i = 0; i < x.length; i++) {
        if (x[i] !== null && y[i] !== null && !isNaN(x[i]) && !isNaN(y[i])) {
            sumX += x[i];
            sumY += y[i];
            sumXY += x[i] * y[i];
            sumX2 += x[i] * x[i];
            sumY2 += y[i] * y[i];
            n++;
        }
    }
    if (n === 0) return 0;
    const step1 = (n * sumXY) - (sumX * sumY);
    const step2 = (n * sumX2) - (sumX * sumX);
    const step3 = (n * sumY2) - (sumY * sumY);
    const step4 = Math.sqrt(step2 * step3);
    if (step4 === 0) return 0;
    return step1 / step4;
};

