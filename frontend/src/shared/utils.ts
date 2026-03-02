import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
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

