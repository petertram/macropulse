import React from 'react';
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
}

export function MetricCard({ title, value, unit, trend, chartData, dataKey, color = "#818cf8" }: MetricCardProps) {
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
                            <YAxis domain={['auto', 'auto']} hide />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
