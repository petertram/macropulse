import React, { useState, useMemo, useCallback } from 'react';
import { TrendingUp, ZoomIn, ZoomOut } from 'lucide-react';
import {
    ResponsiveContainer,
    ComposedChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    ReferenceLine,
    Area,
    Line,
    ReferenceArea,
} from 'recharts';
import { cn } from '../../../../shared/utils';
import { scorecardConfig } from '../constants';
import { HistoryDataPoint } from '../../../../shared/types';

// ── Period Selector ──────────────────────────────────────────

interface PeriodSelectorProps {
    forwardPeriod: number;
    setForwardPeriod: (v: number) => void;
}

export function PeriodSelector({ forwardPeriod, setForwardPeriod }: PeriodSelectorProps) {
    const periods = [
        { label: '1M', value: 1 },
        { label: '3M', value: 3 },
        { label: '6M', value: 6 },
        { label: '9M', value: 9 },
        { label: '1Y', value: 12 },
    ];

    return (
        <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-lg border border-white/10">
            {periods.map(p => (
                <button
                    key={p.value}
                    onClick={() => setForwardPeriod(p.value)}
                    className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                        forwardPeriod === p.value
                            ? "bg-white/10 text-white shadow-sm border border-white/10"
                            : "text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent"
                    )}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

// ── Custom Tooltip ───────────────────────────────────────────

function ChartTooltip({ active, payload, factorConfig }: any) {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const dateStr = data.raw_date
        ? new Date(data.raw_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : data.date || '';

    const factorValue = data[factorConfig.id];
    const returnDiff = data.return_diff;

    return (
        <div className="bg-[#111111]/95 backdrop-blur-xl border border-white/10 px-4 py-3 rounded-xl shadow-2xl min-w-[200px]">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono mb-2">{dateStr}</p>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-white/30" />
                        <span className="text-xs text-white/60">{factorConfig.name}</span>
                    </div>
                    <span className="text-xs font-mono text-white font-medium">
                        {factorValue !== null && factorValue !== undefined ? Number(factorValue).toFixed(2) : '—'}{factorConfig.unit}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-xs text-white/60">Fwd Return Δ</span>
                    </div>
                    <span className={cn(
                        "text-xs font-mono font-medium",
                        returnDiff > 0 ? "text-emerald-400" : returnDiff < 0 ? "text-rose-400" : "text-white/50"
                    )}>
                        {returnDiff !== null && returnDiff !== undefined ? `${returnDiff > 0 ? '+' : ''}${Number(returnDiff).toFixed(1)}%` : '—'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Custom Legend ─────────────────────────────────────────────

function ChartLegend({ factorName }: { factorName: string }) {
    return (
        <div className="flex items-center gap-5 mb-2">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] rounded-full bg-white/45" />
                <span className="text-[10px] text-white/60 tracking-wide">{factorName}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <div className="w-1 h-[2px] bg-white/10" />
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                </div>
                <span className="text-[10px] text-white/50 tracking-wide">Bond-Equity Diff</span>
            </div>
        </div>
    );
}

// ── Status Badge ─────────────────────────────────────────────

function FactorStatus({ config, historyData }: { config: any; historyData: any[] }) {
    const latestData = historyData.length > 0 ? historyData[historyData.length - 1] : null;
    const latestValue = latestData ? latestData[config.id] : null;

    if (latestValue === null || latestValue === undefined) return null;

    // Determine risk level
    const range = config.maxRisk - config.minRisk;
    const pct = range !== 0 ? (latestValue - config.minRisk) / range : 0;
    const clampedPct = Math.max(0, Math.min(1, pct));

    let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    let statusLabel = 'Low Risk';
    if (clampedPct >= 0.75) {
        statusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
        statusLabel = 'High Risk';
    } else if (clampedPct >= 0.4) {
        statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        statusLabel = 'Moderate';
    }

    return (
        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border", statusColor)}>
            <span className="font-mono">{Number(latestValue).toFixed(2)}{config.unit}</span>
            <span className="opacity-60">·</span>
            <span>{statusLabel}</span>
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────

function getNiceTicks(min: number, max: number, tickCount = 5): { min: number, max: number, ticks: number[], precision: number } {
    if (min === max) {
        return { min: min - 1, max: max + 1, ticks: [min - 1, min, max + 1], precision: 0 };
    }

    const rangeNice = niceNum(max - min, false);
    const tickSpacing = niceNum(rangeNice / (tickCount - 1), false);

    const niceMin = Math.floor(min / tickSpacing) * tickSpacing;

    // Force exactly N ticks
    const ticks = Array.from({ length: tickCount }).map((_, i) => {
        const val = niceMin + (i * tickSpacing);
        // Fix floating point math errors (e.g. 0.300000004 -> 0.3)
        return parseFloat(val.toPrecision(12));
    });

    // Calculate required precision
    const getPrecision = (n: number) => {
        if (!isFinite(n)) return 0;
        const s = n.toString();
        const dot = s.indexOf('.');
        if (dot === -1) return 0;
        return s.length - dot - 1;
    };
    const precision = Math.max(...ticks.map(getPrecision));

    return {
        min: ticks[0],
        max: ticks[ticks.length - 1],
        ticks,
        precision
    };
}

function niceNum(range: number, round: boolean): number {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction: number;

    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 2.25) niceFraction = 2;
        else if (fraction < 3.5) niceFraction = 2.5;
        else if (fraction < 7.5) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 2.5) niceFraction = 2.5;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }

    return niceFraction * Math.pow(10, exponent);
}

interface ForwardReturnsTabProps {
    historyData: HistoryDataPoint[];
    forwardPeriod: number;
    setForwardPeriod: (v: number) => void;
}

export function ForwardReturnsTab({ historyData, forwardPeriod, setForwardPeriod }: ForwardReturnsTabProps) {
    const [zoomState, setZoomState] = useState<'zoomed-in' | 'zoomed-out'>('zoomed-in');
    const periodLabel = forwardPeriod === 12 ? '1Y' : `${forwardPeriod}M`;

    // ── Return diff symmetric domain
    const maxAbsDiff = useMemo(() => {
        if (!historyData || historyData.length === 0) return 20;
        const validDiffs = historyData
            .map(d => Math.abs(d.return_diff || 0))
            .filter(v => !isNaN(v) && isFinite(v));
        if (validDiffs.length === 0) return 20;
        const max = Math.max(...validDiffs);
        return Math.max(10, Math.ceil(max * 1.1 / 10) * 10);
    }, [historyData]);

    // ── Thin out data for cleaner rendering (sample every Nth point based on data density)
    const processedHistory = useMemo(() => {
        const sampleRate = historyData.length > 500 ? 3 : historyData.length > 200 ? 2 : 1;
        return historyData
            .filter((_, i) => i % sampleRate === 0 || i === historyData.length - 1)
            .map(item => {
                const diff = item.return_diff ?? 0;
                return {
                    ...item,
                    return_diff: diff,
                    return_diff_pos: diff > 0 ? diff : 0,
                    return_diff_neg: diff < 0 ? diff : 0,
                };
            });
    }, [historyData]);

    // ── Calculate gradient split offset strictly based on the data's bounding box
    const diffOffset = useMemo(() => {
        const diffs = processedHistory
            .map(d => d.return_diff)
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (diffs.length === 0) return 0.5;
        const max = Math.max(...diffs);
        const min = Math.min(...diffs);

        if (max <= 0) return 0;
        if (min >= 0) return 1;
        return max / (max - min);
    }, [processedHistory]);

    // ── Factor axis domain
    const factorDomains = useMemo(() => {
        const domains: Record<string, number[]> = {};
        scorecardConfig.forEach(config => {
            const values = processedHistory.map(d => d[config.id]).filter(v => v !== null && v !== undefined && !isNaN(v));
            const mid = (config.minRisk + config.maxRisk) / 2;

            if (values.length === 0) {
                const delta = Math.abs(config.maxRisk - config.minRisk) || 2;
                domains[config.id] = [mid - delta, mid + delta];
                return;
            }

            if (zoomState === 'zoomed-in') {
                const delta = Math.abs(config.maxRisk - mid) * 1.5;
                domains[config.id] = [mid - delta, mid + delta];
            } else {
                const dataMin = Math.min(...values);
                const dataMax = Math.max(...values);
                const delta = Math.max(Math.abs(dataMin - mid), Math.abs(dataMax - mid), Math.abs(config.maxRisk - mid)) * 1.3 || 2;
                domains[config.id] = [mid - delta, mid + delta];
            }
        });
        return domains;
    }, [processedHistory, zoomState]);

    // ── Factor exactly 5 evenly spaced, NICE ticks
    const { factorTicks, factorDomainsNice, factorPrecisions } = useMemo(() => {
        const ticks: Record<string, number[]> = {};
        const newDomains: Record<string, number[]> = {};
        const precisions: Record<string, number> = {};

        for (const [id, [min, max]] of Object.entries(factorDomains)) {
            const nice = getNiceTicks(min, max, 5);
            ticks[id] = nice.ticks;
            newDomains[id] = [nice.min, nice.max];
            precisions[id] = nice.precision;
        }
        return { factorTicks: ticks, factorDomainsNice: newDomains, factorPrecisions: precisions };
    }, [factorDomains]);

    // ── Return diff exactly 5 evenly spaced, NICE ticks
    const { returnDiffTicks, returnDiffDomainNice, returnDiffPrecision } = useMemo(() => {
        const max = maxAbsDiff;
        // Force the center tick to be zero for return diff
        const nice = getNiceTicks(0, max, 3);
        const step = nice.ticks[1] - nice.ticks[0];

        // Build 5 ticks centered on zero
        const ticks = [-2 * step, -step, 0, step, 2 * step];

        const getPrecision = (n: number) => {
            const s = n.toString();
            const dot = s.indexOf('.');
            return dot === -1 ? 0 : s.length - dot - 1;
        };
        const precision = Math.max(...ticks.map(getPrecision));

        return {
            returnDiffTicks: ticks,
            returnDiffDomainNice: [ticks[0], ticks[4]],
            returnDiffPrecision: precision
        };
    }, [maxAbsDiff]);

    // ── Format ticks nicely
    const formatTick = useCallback((val: number) => {
        if (Math.abs(val) >= 100) return Math.round(val).toString();
        if (Math.abs(val) >= 10) return val.toFixed(1);
        return val.toFixed(2);
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                {/* ── Header ── */}
                <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-sky-400" />
                            {periodLabel} Forward Returns vs. Risk Factors
                        </h2>
                        <p className="text-sm text-white/40 mt-1">
                            Each chart overlays a risk factor with the {periodLabel} forward bond-equity return differential.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <PeriodSelector forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />
                        <div className="flex bg-[#1a1a1a] border border-white/10 rounded-lg p-1 gap-1">
                            <button
                                onClick={() => setZoomState('zoomed-in')}
                                className={cn(
                                    "p-1.5 rounded-md transition-all",
                                    zoomState === 'zoomed-in'
                                        ? "bg-white/10 text-white"
                                        : "text-white/30 hover:text-white/60 hover:bg-white/5"
                                )}
                                title="Zoom In — Focus on risk range"
                            >
                                <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setZoomState('zoomed-out')}
                                className={cn(
                                    "p-1.5 rounded-md transition-all",
                                    zoomState === 'zoomed-out'
                                        ? "bg-white/10 text-white"
                                        : "text-white/30 hover:text-white/60 hover:bg-white/5"
                                )}
                                title="Zoom Out — Full data range"
                            >
                                <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Charts Grid ── */}
                <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {scorecardConfig.map((config) => {
                        const domain = factorDomains[config.id] || [0, 10];
                        const isReversed = config.minRisk > config.maxRisk;

                        // Risk zone band (the range between minRisk and maxRisk)
                        const riskLow = Math.min(config.minRisk, config.maxRisk);
                        const riskHigh = Math.max(config.minRisk, config.maxRisk);

                        return (
                            <div
                                key={config.id}
                                className="bg-[#0c0c0c] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col"
                            >
                                {/* Card Header */}
                                <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-white/90 tracking-tight">{config.name}</h3>
                                        <p className="text-[10px] text-white/30 mt-0.5">{config.desc}</p>
                                    </div>
                                    <FactorStatus config={config} historyData={processedHistory} />
                                </div>

                                {/* Custom Legend */}
                                <div className="px-5">
                                    <ChartLegend factorName={config.name} />
                                </div>

                                {/* Chart */}
                                <div className="h-[300px] px-2 pb-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={processedHistory} margin={{ top: 10, right: 45, bottom: 20, left: 5 }}>
                                            <defs>
                                                <linearGradient id={`fillPos-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.90} />
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.20} />
                                                </linearGradient>
                                                <linearGradient id={`fillNeg-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.20} />
                                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.90} />
                                                </linearGradient>
                                                <linearGradient id={`strokeSplit-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" />
                                                    <stop offset={`${diffOffset * 100}%`} stopColor="#10b981" />
                                                    <stop offset={`${diffOffset * 100}%`} stopColor="#f43f5e" />
                                                    <stop offset="100%" stopColor="#f43f5e" />
                                                </linearGradient>
                                            </defs>

                                            {/* Very subtle grid — horizontal only */}
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                vertical={false}
                                                stroke="rgba(255,255,255,0.03)"
                                            />

                                            {/* Risk zone background band */}
                                            <ReferenceArea
                                                yAxisId="left"
                                                y1={riskLow}
                                                y2={riskHigh}
                                                fill="rgba(244,63,94,0.04)"
                                                stroke="none"
                                            />

                                            {/* X Axis — years */}
                                            <XAxis
                                                dataKey="raw_date"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)', fontFamily: 'ui-monospace, monospace' }}
                                                dy={10}
                                                tickFormatter={(str) => str ? new Date(str).getFullYear().toString() : ''}
                                                minTickGap={80}
                                            />

                                            {/* Left Y — Factor value */}
                                            <YAxis
                                                yAxisId="left"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.6)', fontFamily: 'ui-monospace, monospace' }}
                                                dx={-5}
                                                domain={factorDomainsNice[config.id]}
                                                ticks={factorTicks[config.id]}
                                                tickFormatter={(v: number) => v.toFixed(factorPrecisions[config.id])}
                                                allowDataOverflow
                                                reversed={isReversed}
                                            />

                                            {/* Right Y — Return Diff */}
                                            <YAxis
                                                yAxisId="right"
                                                orientation="right"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.6)', fontFamily: 'ui-monospace, monospace' }}
                                                dx={5}
                                                domain={returnDiffDomainNice}
                                                ticks={returnDiffTicks}
                                                tickFormatter={(v: number) => `${v.toFixed(returnDiffPrecision)}%`}
                                                allowDataOverflow
                                            />

                                            {/* Tooltip */}
                                            <Tooltip
                                                content={<ChartTooltip factorConfig={config} />}
                                                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                                            />

                                            {/* Zero line for return diff */}
                                            <ReferenceLine
                                                y={0}
                                                yAxisId="right"
                                                stroke="rgba(255,255,255,0.08)"
                                                strokeWidth={1}
                                            />

                                            {/* Risk boundary lines */}
                                            <ReferenceLine
                                                y={config.maxRisk}
                                                yAxisId="left"
                                                stroke="rgba(244,63,94,0.15)"
                                                strokeDasharray="6 4"
                                                strokeWidth={1}
                                            />

                                            {/* Positive fill (green, no stroke) */}
                                            <Area
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="return_diff_pos"
                                                stroke="none"
                                                fillOpacity={1}
                                                fill={`url(#fillPos-${config.id})`}
                                                baseValue={0}
                                                connectNulls
                                                isAnimationActive={false}
                                            />

                                            {/* Negative fill (red, no stroke) */}
                                            <Area
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="return_diff_neg"
                                                stroke="none"
                                                fillOpacity={1}
                                                fill={`url(#fillNeg-${config.id})`}
                                                baseValue={0}
                                                connectNulls
                                                isAnimationActive={false}
                                            />

                                            {/* Single stroke line for return diff */}
                                            <Line
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="return_diff"
                                                name="Bond-Equity Diff"
                                                stroke={`url(#strokeSplit-${config.id})`}
                                                strokeWidth={1}
                                                dot={false}
                                                activeDot={false}
                                                connectNulls
                                                isAnimationActive={false}
                                            />

                                            {/* Factor line — demoted to subtle context */}
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey={config.id}
                                                stroke="rgba(255,255,255,0.45)"
                                                strokeWidth={1}
                                                dot={false}
                                                activeDot={{
                                                    r: 3,
                                                    fill: 'rgba(255,255,255,0.5)',
                                                    stroke: '#0c0c0c',
                                                    strokeWidth: 2,
                                                }}
                                                connectNulls
                                                isAnimationActive={false}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Card Footer — weight & risk range */}
                                <div className="px-5 pb-4 flex items-center justify-between border-t border-white/[0.04] pt-3">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] text-white/25 font-mono">
                                            WEIGHT <span className="text-white/50">{config.weight}%</span>
                                        </span>
                                        <span className="text-[10px] text-white/25 font-mono">
                                            RANGE <span className="text-white/50">{config.minRisk} → {config.maxRisk}{config.unit}</span>
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-white/25 font-mono">
                                        {processedHistory.length} data points
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
