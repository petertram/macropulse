import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';

interface MetricCardProps {
    title: string;
    value: string;
    unit: string;
    trend: 'up' | 'down' | 'neutral';
    chartData?: any[];
    dataKey?: string;
    color?: string;
    yDomainMode?: 'auto' | 'trimmed' | 'trimmed-tight' | 'trimmed-clipped' | 'stddev-zoom';
}

function getQuantile(sortedValues: number[], quantile: number) {
    if (sortedValues.length === 0) return null;
    const index = (sortedValues.length - 1) * quantile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    const weight = index - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function MetricCard({
    title,
    value,
    unit,
    trend,
    chartData,
    dataKey,
    color = "#818cf8",
    yDomainMode = 'auto',
}: MetricCardProps) {
    const yDomain = useMemo(() => {
        if (!chartData || !dataKey || yDomainMode === 'auto') return ['auto', 'auto'] as const;

        const values = chartData
            .map(point => Number(point?.[dataKey]))
            .filter(value => Number.isFinite(value));

        if (values.length < 8) return ['auto', 'auto'] as const;

        const sorted = [...values].sort((a, b) => a - b);
        if (yDomainMode === 'stddev-zoom') {
            const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
            const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);
            const band = stdDev || Math.abs(mean || 1) * 0.1 || 1;
            return [mean - band, mean + band] as const;
        }

        const isTight = yDomainMode === 'trimmed-tight';
        const isClipped = yDomainMode === 'trimmed-clipped';
        const lowerQuantile = isClipped ? 0.3 : isTight ? 0.2 : 0.1;
        const upperQuantile = isClipped ? 0.7 : isTight ? 0.8 : 0.9;
        const paddingRatio = isClipped ? 0.08 : isTight ? 0.12 : 0.18;
        const lower = getQuantile(sorted, lowerQuantile);
        const upper = getQuantile(sorted, upperQuantile);
        const latest = values[values.length - 1];

        if (lower === null || upper === null) return ['auto', 'auto'] as const;

        const paddedMin = isClipped ? lower : Math.min(lower, latest);
        const paddedMax = isClipped ? upper : Math.max(upper, latest);
        const span = paddedMax - paddedMin;

        if (span <= 0) {
            const baseline = Math.abs(paddedMax || 1) * 0.1 || 1;
            return [paddedMin - baseline, paddedMax + baseline] as const;
        }

        const padding = span * paddingRatio;
        return [paddedMin - padding, paddedMax + padding] as const;
    }, [chartData, dataKey, yDomainMode]);

    return (
        <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-5 flex flex-col justify-between hover:bg-[#141414] transition-colors relative overflow-hidden group min-h-[140px]">
            <div className="relative z-10">
                <div className="text-white/50 text-xs font-medium uppercase tracking-wider mb-4">{title}</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-mono text-white tracking-tight">{value}</span>
                    <span className="text-white/40 text-sm font-mono">{unit}</span>
                </div>
                <div className="mt-4 flex items-center gap-1.5">
                    {trend === 'up' && <TrendingUp className="w-3 h-3 text-rose-400" />}
                    {trend === 'down' && <TrendingDown className="w-3 h-3 text-emerald-400" />}
                    {trend === 'neutral' && <div className="w-3 h-0.5 bg-white/30 rounded-full" />}
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Latest Observation</span>
                </div>
            </div>
            {chartData && dataKey && (
                <div className="absolute bottom-0 left-0 right-0 h-24 opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                            <YAxis domain={yDomain} hide allowDataOverflow={yDomainMode === 'trimmed-clipped' || yDomainMode === 'stddev-zoom'} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
