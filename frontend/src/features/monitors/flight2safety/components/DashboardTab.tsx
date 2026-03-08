import React, { useMemo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Area, AreaChart, Line, ReferenceLine, ResponsiveContainer, YAxis } from 'recharts';
import { MetricCard } from '../../../../shared/components/MetricCard';
import { calculateScore, cn } from '../../../../shared/utils';
import { scorecardConfig } from '../constants';
import { HistoryDataPoint } from '../../../../shared/types';

interface DashboardTabProps {
    fredData: any[];
    loading: boolean;
    historyData: HistoryDataPoint[];
    lastSynced: string | null;
}

export function DashboardTab({ fredData, loading, historyData, lastSynced }: DashboardTabProps) {
    // Calculate live scorecard data
    const liveScorecard = scorecardConfig.map(config => {
        const vals = config.series.map(id => {
            const item = fredData.find(d => d.id === id);
            return item && item.value !== '.' && item.value !== null ? parseFloat(item.value) : null;
        });

        const canCalc = vals.every(v => v !== null && !isNaN(v as number));
        const liveValue = canCalc ? config.calc(vals as number[]) : null;
        const currentScore = canCalc ? calculateScore(liveValue, config.minRisk, config.maxRisk, config.weight) : 0;

        let status = 'safe';
        const pct = currentScore / config.weight;
        if (pct >= 0.75) status = 'danger';
        else if (pct >= 0.4) status = 'warning';

        return {
            ...config,
            liveValue,
            currentScore,
            status
        };
    });

    const totalScore = liveScorecard.reduce((acc, curr) => acc + curr.currentScore, 0);
    const riskLevel = totalScore >= 70 ? 'CRITICAL RISK' : totalScore >= 60 ? 'ELEVATED RISK' : 'NORMAL';
    const riskColor = totalScore >= 70 ? 'text-rose-500' : totalScore >= 60 ? 'text-amber-500' : 'text-emerald-500';
    const scoreHistory = useMemo(() => {
        return historyData
            .map(point => {
                const score = scorecardConfig.reduce((acc, config) => {
                    const rawValue = point[config.id];
                    const value = rawValue !== null && rawValue !== undefined && !Number.isNaN(Number(rawValue))
                        ? Number(rawValue)
                        : null;

                    return acc + calculateScore(value, config.minRisk, config.maxRisk, config.weight);
                }, 0);

                return {
                    date: point.raw_date,
                    label: point.date,
                    score,
                };
            })
            .filter(point => point.date);
    }, [historyData]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Scorecard */}
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden relative">
                <div className="relative z-10 p-6 border-b border-white/10 flex justify-between items-center bg-[#141414] overflow-hidden min-h-[112px]">
                    {scoreHistory.length > 1 && (
                        <>
                            <div className="absolute inset-x-0 top-2 bottom-0 opacity-38 pointer-events-none">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={scoreHistory}>
                                        <defs>
                                            <linearGradient id="flightScoreHeaderFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.14} />
                                                <stop offset="50%" stopColor="#6366f1" stopOpacity={0.1} />
                                                <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis domain={[0, 100]} hide />
                                        <ReferenceLine y={60} stroke="rgba(245,158,11,0.14)" strokeDasharray="4 4" />
                                        <ReferenceLine y={70} stroke="rgba(244,63,94,0.14)" strokeDasharray="4 4" />
                                        <Area
                                            type="monotone"
                                            dataKey="score"
                                            stroke="none"
                                            fill="url(#flightScoreHeaderFill)"
                                            isAnimationActive={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="score"
                                            stroke="#a5b4fc"
                                            strokeWidth={2.2}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-b from-[#141414]/54 via-[#141414]/10 to-[#141414]/62 pointer-events-none" />
                        </>
                    )}

                    <div className="relative z-10 rounded-xl bg-black/18 backdrop-blur-[1.5px] px-3 py-2">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <ShieldAlert className={cn("w-5 h-5", riskColor)} />
                            Flight to Safety
                        </h2>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-sm text-white/72">Live weighted scoring system (0-100) powered by FRED</p>
                            {lastSynced && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/35 border border-white/12 text-[10px] text-white/58 font-mono backdrop-blur-sm">
                                    <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                    DATA AS OF: {new Date(lastSynced).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative z-10 text-right rounded-xl bg-black/18 backdrop-blur-[1.5px] px-3 py-2">
                        <div className="text-4xl font-light tracking-tight text-white font-mono">
                            {loading ? '--' : totalScore}<span className="text-xl text-white/45">/100</span>
                        </div>
                        <div className={cn("text-[10px] font-bold uppercase tracking-widest mt-1", riskColor)}>
                            {loading ? 'CALCULATING...' : riskLevel}
                        </div>
                    </div>
                </div>
                <div className="relative z-10 p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {liveScorecard.map((item, idx) => (
                        <div key={idx} className="space-y-2">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-white/80">{item.name}</span>
                                <span className="font-mono text-white/50">{item.currentScore} / {item.weight}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-white/40 font-mono mb-2 uppercase tracking-wider">
                                <span>Live: {item.liveValue !== null ? item.liveValue.toFixed(2) + item.unit : 'Loading...'}</span>
                                <span>Range: {item.minRisk}{item.unit} → {item.maxRisk}{item.unit}</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-1000",
                                        item.status === 'danger' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                                            item.status === 'warning' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                                'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                    )}
                                    style={{ width: `${(item.currentScore / item.weight) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Factors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scorecardConfig.map(config => {
                    const liveScorecardItem = liveScorecard.find(item => item.id === config.id);
                    const liveValue = liveScorecardItem?.liveValue !== null && liveScorecardItem?.liveValue !== undefined
                        ? liveScorecardItem.liveValue.toFixed(2)
                        : 'N/A';

                    return (
                        <MetricCard
                            key={config.id}
                            title={config.name}
                            value={liveValue}
                            unit={config.unit}
                            trend="neutral"
                            chartData={historyData}
                            dataKey={config.id}
                            color="#818cf8"
                            yDomainMode="auto"
                        />
                    );
                })}
            </div>
        </div>
    );
}
