import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Area, Line } from 'recharts';
import { calculateScore, cn } from '../../../../shared/utils';
import { scorecardConfig } from '../constants';
import { HistoryDataPoint } from '../../../../shared/types';

interface BacktestTabProps {
    historyData: HistoryDataPoint[];
    forwardPeriod: number;
    setForwardPeriod: (v: number) => void;
}

export function BacktestTab({ historyData, forwardPeriod, setForwardPeriod }: BacktestTabProps) {
    const [backtestData, setBacktestData] = useState<any[]>([]);

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
                            <p className="text-indigo-400 font-bold uppercase tracking-wider mb-1">Flight-to-Safety Score</p>
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

    const maxAbsDiff = useMemo(() => {
        if (!backtestData || backtestData.length === 0) return 20;
        const validDiffs = backtestData
            .map(d => Math.abs(d.return_diff || 0))
            .filter(v => !isNaN(v) && isFinite(v));

        if (validDiffs.length === 0) return 20;

        const max = Math.max(...validDiffs);
        const padded = max * 1.1;
        return Math.max(10, Math.ceil(padded / 10) * 10);
    }, [backtestData]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
                            Backtest Logic & Signals
                        </h2>
                        <p className="text-sm text-white/50 mt-1">Tactical asset allocation shift from 60/40 to bond-heavy overweight</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="h-[400px]">
                        <h3 className="text-sm font-medium text-white/50 mb-6 uppercase tracking-widest">Historical Score vs. Asset Performance</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={backtestData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                                <defs>
                                    <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                                    </linearGradient>
                                    <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                                <XAxis
                                    dataKey="raw_date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }}
                                    dy={5}
                                    tickFormatter={(str) => new Date(str).getFullYear().toString()}
                                    minTickGap={60}
                                />
                                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }} dx={-10} domain={[0, 100]} />
                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }} dx={10} domain={[-maxAbsDiff, maxAbsDiff]} tickCount={5} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    verticalAlign="top"
                                    align="right"
                                    wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', paddingBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    iconType="circle"
                                    iconSize={8}
                                />
                                <ReferenceLine y={70} yAxisId="left" stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Entry (70)', fill: '#f43f5e', fontSize: 10, fontFamily: 'monospace' }} />
                                <ReferenceLine y={40} yAxisId="left" stroke="#10b981" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Exit (40)', fill: '#10b981', fontSize: 10, fontFamily: 'monospace' }} />
                                <ReferenceLine y={0} yAxisId="right" stroke="#ffffff20" />
                                <Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="return_diff_pos"
                                    name="Return Diff (10Y - SPX)"
                                    legendType="none"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorPos)"
                                    dot={false}
                                    baseValue={0}
                                    connectNulls
                                />
                                <Area
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="return_diff_neg"
                                    name="Return Diff (10Y - SPX)"
                                    legendType="none"
                                    stroke="#f43f5e"
                                    fillOpacity={1}
                                    fill="url(#colorNeg)"
                                    dot={false}
                                    baseValue={0}
                                    connectNulls
                                />
                                <Line yAxisId="left" type="monotone" dataKey="score" name="F2S Score" stroke="#818cf8" strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={{ r: 6, fill: '#ffffff' }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
