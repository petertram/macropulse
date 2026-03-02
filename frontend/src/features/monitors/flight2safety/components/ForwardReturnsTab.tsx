import React, { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Area, Line } from 'recharts';
import { cn } from '../../../../shared/utils';
import { scorecardConfig } from '../constants';
import { HistoryDataPoint } from '../../../../shared/types';

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
        <div className="flex items-center gap-2 bg-[#1f1f1f] p-1 rounded-lg border border-white/10 w-fit">
            {periods.map(p => (
                <button
                    key={p.value}
                    onClick={() => setForwardPeriod(p.value)}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-all",
                        forwardPeriod === p.value
                            ? "bg-indigo-500 text-white shadow-md"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

interface ForwardReturnsTabProps {
    historyData: HistoryDataPoint[];
    forwardPeriod: number;
    setForwardPeriod: (v: number) => void;
}

export function ForwardReturnsTab({ historyData, forwardPeriod, setForwardPeriod }: ForwardReturnsTabProps) {
    const [zoomState, setZoomState] = useState<'zoomed-in' | 'zoomed-out'>('zoomed-in');
    const periodLabel = forwardPeriod === 12 ? '1Y' : `${forwardPeriod}M`;

    const maxAbsDiff = useMemo(() => {
        if (!historyData || historyData.length === 0) return 20;
        const validDiffs = historyData
            .map(d => Math.abs(d.return_diff || 0))
            .filter(v => !isNaN(v) && isFinite(v));

        if (validDiffs.length === 0) return 20;
        const max = Math.max(...validDiffs);
        const padded = max * 1.1;
        return Math.max(10, Math.ceil(padded / 10) * 10);
    }, [historyData]);

    const processedHistory = useMemo(() => {
        return historyData.map(item => {
            const diff = item.return_diff || 0;
            return {
                ...item,
                return_diff_pos: diff > 0 ? diff : 0,
                return_diff_neg: diff < 0 ? diff : 0
            };
        });
    }, [historyData]);

    const factorDomains = useMemo(() => {
        const domains: Record<string, number[]> = {};
        scorecardConfig.forEach(config => {
            const values = processedHistory.map(d => d[config.id]).filter(v => v !== null && v !== undefined && !isNaN(v));
            if (values.length === 0) {
                domains[config.id] = [0, 2.5, 5, 7.5, 10];
                return;
            }
            const mid = (config.minRisk + config.maxRisk) / 2;
            if (zoomState === 'zoomed-in') {
                const delta = Math.abs(config.maxRisk - mid);
                domains[config.id] = [mid - delta, mid - delta / 2, mid, mid + delta / 2, mid + delta];
            } else {
                const dataMin = Math.min(...values);
                const dataMax = Math.max(...values);
                let delta = Math.max(Math.abs(dataMin - mid), Math.abs(dataMax - mid), Math.abs(config.maxRisk - mid)) * 1.1 || 1;
                const exponent = Math.floor(Math.log10(delta));
                const fraction = delta / Math.pow(10, exponent);
                let niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 4 ? 4 : fraction <= 5 ? 5 : 10;
                delta = niceFraction * Math.pow(10, exponent);
                domains[config.id] = [mid - delta, mid - delta / 2, mid, mid + delta / 2, mid + delta];
            }
        });
        return domains;
    }, [processedHistory, zoomState]);

    const FactorTooltip = ({ active, payload, factorConfig }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const dateStr = new Date(data.raw_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            const inputs = factorConfig.series.map((s: string) => ({ id: s, val: data.raw_inputs ? data.raw_inputs[s] : null }));
            return (
                <div className="bg-[#0f0f0f] border border-white/20 p-4 rounded-xl shadow-2xl font-mono text-xs min-w-[240px]">
                    <p className="text-white font-bold mb-3 border-b border-white/10 pb-2">{dateStr}</p>
                    <div className="space-y-3">
                        <div>
                            <p className="text-indigo-400 font-bold uppercase tracking-wider mb-1">{factorConfig.name}</p>
                            <p className="text-white text-lg font-bold">{data[factorConfig.id] !== null ? data[factorConfig.id] : 'N/A'}<span className="text-[10px] text-white/40 ml-1 font-normal">{factorConfig.unit}</span></p>
                            <div className="mt-1.5 p-2 bg-white/5 rounded border border-white/5">
                                <p className="text-[9px] text-white/40 uppercase mb-1">Calculation Method</p>
                                <p className="text-[10px] text-white/70 leading-tight">{factorConfig.desc}</p>
                            </div>
                        </div>
                        <div className="h-px bg-white/10" />
                        <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-white/40 uppercase text-[9px] mb-1">US 10Y Fwd</p><p className="text-white font-medium">{data.us10y_fwd}%</p></div>
                            <div><p className="text-white/40 uppercase text-[9px] mb-1">S&P 500 Fwd</p><p className="text-white font-medium">{data.spx_fwd}%</p></div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><TrendingUp className="w-5 h-5 text-indigo-400" />{periodLabel} Forward Return Difference vs. Factors</h2>
                        <p className="text-sm text-white/50 mt-1">Historical {periodLabel} forward performance difference (US10Y - SPX) compared to each scorecard factor.</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <PeriodSelector forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />
                        <div className="flex bg-[#0f0f0f] border border-white/10 rounded-md p-1">
                            <button onClick={() => setZoomState('zoomed-in')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", zoomState === 'zoomed-in' ? "bg-indigo-500 text-white shadow-md" : "text-white/50 hover:text-white hover:bg-white/5")}>Zoomed In</button>
                            <button onClick={() => setZoomState('zoomed-out')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", zoomState === 'zoomed-out' ? "bg-indigo-500 text-white shadow-md" : "text-white/50 hover:text-white hover:bg-white/5")}>Zoomed Out</button>
                        </div>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {scorecardConfig.map((config) => (
                        <div key={config.id} className="bg-[#141414] border border-white/5 rounded-xl p-6 h-[400px] flex flex-col">
                            <div className="flex justify-between items-start mb-6">
                                <div><h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">{config.name}</h3><p className="text-[10px] text-white/40 font-mono mt-0.5">Correlation vs. Returns</p></div>
                                <div className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-white/60 border border-white/10">Weight: {config.weight}%</div>
                            </div>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={processedHistory} margin={{ top: 5, right: 0, bottom: 25, left: 0 }}>
                                        <defs>
                                            <linearGradient id={`colorPos-${config.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0.05} /></linearGradient>
                                            <linearGradient id={`colorNeg-${config.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.05} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0.4} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                                        <XAxis dataKey="raw_date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#ffffff30', fontFamily: 'monospace' }} dy={10} tickFormatter={(str) => str ? new Date(str).getFullYear().toString() : ''} minTickGap={60} />
                                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#818cf8', fontFamily: 'monospace' }} dx={-10} ticks={factorDomains[config.id]} domain={[factorDomains[config.id][0], factorDomains[config.id][4]]} tickFormatter={(val) => Math.abs(val) >= 10 ? Math.round(val).toString() : String(Number(val.toFixed(2)))} allowDataOverflow={true} reversed={config.minRisk > config.maxRisk} />
                                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#ffffff30', fontFamily: 'monospace' }} dx={10} domain={[-maxAbsDiff, maxAbsDiff]} tickCount={5} allowDataOverflow={true} />
                                        <Tooltip content={<FactorTooltip factorConfig={config} />} />
                                        <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', paddingBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }} iconType="circle" iconSize={8} />
                                        <ReferenceLine y={0} yAxisId="right" stroke="#ffffff15" strokeWidth={1} />
                                        <Area yAxisId="right" type="monotone" dataKey="return_diff_pos" name="Return Diff (10Y - SPX)" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill={`url(#colorPos-${config.id})`} baseValue={0} connectNulls />
                                        <Area yAxisId="right" type="monotone" dataKey="return_diff_neg" name="Return Diff (10Y - SPX)" legendType="none" stroke="#f43f5e" strokeWidth={1.5} fillOpacity={1} fill={`url(#colorNeg-${config.id})`} baseValue={0} connectNulls />
                                        <Line yAxisId="left" type="monotone" dataKey={config.id} name={config.name} stroke="#818cf8" strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={{ r: 4, fill: '#fff' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
