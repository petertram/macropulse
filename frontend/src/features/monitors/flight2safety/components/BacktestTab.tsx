import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, ZoomIn, ZoomOut } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Area, Line, ReferenceArea } from 'recharts';
import { calculateScore, cn } from '../../../../shared/utils';
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

// ── Helpers ──────────────────────────────────────────────────

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
        return parseFloat(val.toPrecision(12));
    });

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

function ChartLegend({ factorName }: { factorName: string }) {
    return (
        <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-[2px] rounded-full bg-white/45" />
                <span className="text-[10px] text-white/60 tracking-wide font-mono uppercase">{factorName}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <div className="w-1 h-[2px] bg-white/10" />
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                </div>
                <span className="text-[10px] text-white/50 tracking-wide font-mono uppercase">Bond-Equity Diff</span>
            </div>
        </div>
    );
}


interface BacktestTabProps {
    historyData: HistoryDataPoint[];
    forwardPeriod: number;
    setForwardPeriod: (v: number) => void;
}

export function BacktestTab({ historyData, forwardPeriod, setForwardPeriod }: BacktestTabProps) {
    const [backtestData, setBacktestData] = useState<any[]>([]);
    const [zoomState, setZoomState] = useState<'zoomed-in' | 'zoomed-out'>('zoomed-out');
    const periodLabel = forwardPeriod === 12 ? '1Y' : `${forwardPeriod}M`;

    useEffect(() => {
        if (!historyData || historyData.length === 0) return;

        const processedData = historyData.map(item => {
            // Calculate total score for this data point
            const totalScore = scorecardConfig.reduce((acc, config) => {
                let val = null;
                if (config.id === 'hy_spread') val = item.hy_spread;
                else if (config.id === 'yield_curve') val = item.yield_curve;
                else if (config.id === 'fin_stress') val = item.fin_stress;
                else if (config.id === 'macro_activity') val = item.macro_activity;
                else if (config.id === 'vix_term') val = item.vix_term;
                else if (config.id === 'real_yield') val = item.real_yield;

                return acc + calculateScore(val, config.minRisk, config.maxRisk, config.weight);
            }, 0);

            const diff = item.return_diff || 0;

            return {
                ...item,
                score: totalScore,
                return_diff_pos: diff > 0 ? diff : 0,
                return_diff_neg: diff < 0 ? diff : 0
            };
        });

        setBacktestData(processedData);
    }, [historyData]);

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const dateStr = new Date(data.raw_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            return (
                <div className="bg-[#0f0f0f] border border-white/20 p-4 rounded-xl shadow-2xl font-mono text-xs min-w-[220px]">
                    <p className="text-white font-bold mb-3 border-b border-white/10 pb-2">{dateStr}</p>

                    <div className="space-y-3">
                        <div>
                            <p className="text-indigo-400 font-bold uppercase tracking-wider mb-1">Flight to Safety Score</p>
                            <p className="text-white text-lg font-bold">{data.score}<span className="text-[10px] text-white/40 ml-1 font-normal">/100</span></p>
                        </div>

                        <div className="h-px bg-white/10" />

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-white/40 uppercase text-[9px] mb-1">US 10Y Fwd</p>
                                <p className="text-white font-medium">{data.us10y_fwd}%</p>
                            </div>
                            <div>
                                <p className="text-white/40 uppercase text-[9px] mb-1">S&P 500 Fwd</p>
                                <p className="text-white font-medium">{data.spx_fwd}%</p>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-white/10">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-white/40 uppercase text-[9px] mb-1">Return Difference</p>
                                    <p className={cn("text-base font-bold", data.return_diff > 0 ? "text-emerald-400" : "text-rose-400")}>
                                        {data.return_diff > 0 ? '+' : ''}{data.return_diff}%
                                    </p>
                                </div>
                                <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", data.return_diff > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                                    {data.return_diff > 0 ? 'Bonds Out' : 'Equities Out'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    // ── Calculate gradient split offset strictly based on the data's bounding box
    const diffOffset = useMemo(() => {
        const diffs = backtestData
            .map(d => d.return_diff)
            .filter(v => v !== null && v !== undefined && !isNaN(v));

        if (diffs.length === 0) return 0.5;
        const max = Math.max(...diffs);
        const min = Math.min(...diffs);

        if (max <= 0) return 0;
        if (min >= 0) return 1;
        return max / (max - min);
    }, [backtestData]);

    // ── Score exactly 5 evenly spaced, NICE ticks
    const { scoreTicks, scoreDomainNice, scorePrecision } = useMemo(() => {
        const domain = zoomState === 'zoomed-in' ? [30, 80] : [0, 100];
        const nice = getNiceTicks(domain[0], domain[1], 5);
        return {
            scoreTicks: nice.ticks,
            scoreDomainNice: [nice.min, nice.max],
            scorePrecision: nice.precision
        };
    }, [zoomState]);

    // ── Return diff exactly 5 evenly spaced, NICE ticks
    const { returnDiffTicks, returnDiffDomainNice, returnDiffPrecision } = useMemo(() => {
        if (!backtestData || backtestData.length === 0) {
            return { returnDiffTicks: [-20, -10, 0, 10, 20], returnDiffDomainNice: [-20, 20], returnDiffPrecision: 0 };
        }

        const validDiffs = backtestData
            .map(d => Math.abs(d.return_diff || 0))
            .filter(v => !isNaN(v) && isFinite(v));

        const maxAbs = validDiffs.length > 0 ? Math.max(...validDiffs) : 20;

        // Force the center tick to be zero for return diff
        const nice = getNiceTicks(0, maxAbs, 3);
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
    }, [backtestData]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
                            {periodLabel} Backtest Logic & Signals
                        </h2>
                        <p className="text-sm text-white/40 mt-1">Tactical asset allocation shift from 60/40 to bond-heavy overweight</p>
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
                                title="Zoom In — Focus on signal range"
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
                                title="Zoom Out — Full range"
                            >
                                <ZoomOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="h-[400px]">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <h3 className="text-sm font-medium text-white/50 uppercase tracking-widest">Historical Score vs. Asset Performance</h3>
                            <ChartLegend factorName="Flight to Safety Score" />
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={backtestData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                                <defs>
                                    <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.90} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.20} />
                                    </linearGradient>
                                    <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.20} />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.90} />
                                    </linearGradient>
                                    <linearGradient id="strokeSplit" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset={`${diffOffset * 100}%`} stopColor="#10b981" />
                                        <stop offset={`${diffOffset * 100}%`} stopColor="#f43f5e" />
                                        <stop offset="100%" stopColor="#f43f5e" />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis
                                    dataKey="raw_date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)', fontFamily: 'ui-monospace, monospace' }}
                                    dy={10}
                                    tickFormatter={(str) => new Date(str).getFullYear().toString()}
                                    minTickGap={60}
                                />
                                <YAxis
                                    yAxisId="left"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.6)', fontFamily: 'ui-monospace, monospace' }}
                                    dx={-5}
                                    domain={scoreDomainNice}
                                    ticks={scoreTicks}
                                    tickFormatter={(v: number) => v.toFixed(scorePrecision)}
                                />
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
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <ReferenceLine y={70} yAxisId="left" stroke="#10b981" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Exit (70)', fill: '#10b981', fontSize: 10, fontFamily: 'monospace' }} />
                                <ReferenceLine y={60} yAxisId="left" stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Entry (60)', fill: '#f43f5e', fontSize: 10, fontFamily: 'monospace' }} />
                                <ReferenceLine y={0} yAxisId="right" stroke="#ffffff20" />
                                <Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="return_diff_pos"
                                    stroke="none"
                                    fillOpacity={1}
                                    fill="url(#colorPos)"
                                    baseValue={0}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                <Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="return_diff_neg"
                                    stroke="none"
                                    fillOpacity={1}
                                    fill="url(#colorNeg)"
                                    baseValue={0}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="return_diff"
                                    stroke="url(#strokeSplit)"
                                    strokeWidth={1}
                                    dot={false}
                                    activeDot={false}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="score"
                                    name="Flight to Safety Score"
                                    stroke="rgba(255,255,255,0.45)"
                                    strokeWidth={1}
                                    dot={false}
                                    activeDot={{ r: 6, fill: '#ffffff' }}
                                    isAnimationActive={false}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
