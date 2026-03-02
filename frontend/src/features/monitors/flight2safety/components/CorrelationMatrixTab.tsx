import React from 'react';
import { Activity, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import { getPearsonCorrelation } from '../../../../shared/utils';
import { scorecardConfig } from '../constants';
import { HistoryDataPoint } from '../../../../shared/types';

interface CorrelationMatrixTabProps {
    historyData: HistoryDataPoint[];
}

export function CorrelationMatrixTab({ historyData }: CorrelationMatrixTabProps) {
    const variables = [
        { id: 'return_diff', label: 'SPX-10Y Diff (1Y Fwd)' },
        ...scorecardConfig.map(c => ({ id: c.id, label: c.name }))
    ];

    const matrix = variables.map(v1 => {
        return variables.map(v2 => {
            const x = historyData.map(d => d[v1.id]);
            const y = historyData.map(d => d[v2.id]);
            return getPearsonCorrelation(x, y);
        });
    });

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-[#141414]">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-400" />
                        Factor Correlation Matrix
                    </h2>
                    <p className="text-sm text-white/50 mt-1">Pearson correlation coefficients between scorecard factors and 1Y forward return differences.</p>
                </div>
                <div className="p-6 overflow-x-auto">
                    <div className="min-w-[800px]">
                        <div className="grid grid-cols-8 gap-1 mb-1">
                            <div className="col-span-1"></div>
                            {variables.map(v => (
                                <div key={v.id} className="text-[10px] font-mono text-white/50 text-center truncate px-1" title={v.label}>
                                    {v.label}
                                </div>
                            ))}
                        </div>
                        {variables.map((v1, i) => (
                            <div key={v1.id} className="grid grid-cols-8 gap-1 mb-1">
                                <div className="col-span-1 text-[10px] font-mono text-white/50 flex items-center justify-end pr-4 text-right truncate" title={v1.label}>
                                    {v1.label}
                                </div>
                                {variables.map((v2, j) => {
                                    const corr = matrix[i][j];
                                    const isSelf = i === j;
                                    const absCorr = Math.abs(corr);
                                    const bgColor = corr > 0
                                        ? `rgba(16, 185, 129, ${absCorr * 0.8})`
                                        : `rgba(244, 63, 94, ${absCorr * 0.8})`;

                                    return (
                                        <div
                                            key={`${v1.id}-${v2.id}`}
                                            className="h-10 rounded flex items-center justify-center text-xs font-mono"
                                            style={{ backgroundColor: isSelf ? 'rgba(255,255,255,0.1)' : bgColor, color: absCorr > 0.5 || isSelf ? '#fff' : 'rgba(255,255,255,0.5)' }}
                                        >
                                            {corr.toFixed(2)}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* AI Analysis Card */}
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                <div className="flex items-start gap-4 relative">
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shrink-0">
                        <Sparkles className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="space-y-4 w-full">
                        <div>
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                AI Correlation Analysis & Flight2Safety Implications
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">LIVE</span>
                            </h3>
                            <p className="text-xs text-white/40 mt-1">Automated synthesis of stock-bond correlation shifts and their impact on the Flight2Safety model.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-blue-400" /> Historical Regime Shifts
                                </h4>
                                <p className="text-sm text-white/60 leading-relaxed">
                                    For the two decades preceding 2022, the stock-bond correlation was reliably negative (averaging -0.3). During demand-driven shocks (like the GFC or Dot-Com bust), bonds rallied as equities fell, providing the foundational logic for the 60/40 portfolio. However, during supply-driven inflation shocks (e.g., 2022), the correlation flips positive, causing simultaneous drawdowns.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Implications for Flight2Safety Model
                                </h4>
                                <p className="text-sm text-white/60 leading-relaxed">
                                    The Flight2Safety (Bond Equity Allocation Timing Scorecard) model traditionally assumes bonds act as a safe haven when equity risk premiums compress. When correlation is positive (&gt;0), the Flight2Safety model's "Risk-Off" signal becomes less effective if it simply rotates into long-duration bonds. The model must dynamically adjust its fixed-income duration targets based on the prevailing inflation regime.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                            <h4 className="text-sm font-medium text-indigo-300 mb-2">Actionable Takeaway for Flight2Safety Allocation</h4>
                            <p className="text-sm text-white/70 leading-relaxed">
                                As the rolling correlation begins to normalize back toward zero (currently 0.2 down from 0.6), the Flight2Safety model is re-weighting its traditional "Flight to Quality" signals.
                                <br /><br />
                                <strong>Flight2Safety Adjustment:</strong> While recession probabilities are rising, the Flight2Safety model is currently favoring <strong>cash equivalents and short-duration Treasuries (T-Bills)</strong> over long-duration bonds until the correlation firmly re-enters negative territory, ensuring true diversification during the next equity drawdown.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
