import React, { useState, useMemo } from 'react';
import { DashboardTab } from './components/DashboardTab';
import { ForwardReturnsTab } from './components/ForwardReturnsTab';
import { CorrelationMatrixTab } from './components/CorrelationMatrixTab';
import { BacktestTab } from './components/BacktestTab';
import { AppendixTab } from './components/AppendixTab';
import { cn } from '../../../shared/utils';
import { HistoryDataPoint } from '../../../shared/types';

interface Flight2SafetyProps {
    fredData: any[];
    rawHistoryData: any[];
    loading: boolean;
    lastSynced: string | null;
}

export function Flight2Safety({ fredData, rawHistoryData, loading, lastSynced }: Flight2SafetyProps) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [forwardPeriod, setForwardPeriod] = useState<number>(3);

    const historyData = useMemo(() => {
        if (!rawHistoryData || rawHistoryData.length === 0) return [];

        // ── Step 1: Group by Month & Fill Forward ──
        const monthlyMap = new Map<string, any>();
        const lastKnown: Record<string, any> = {};
        const indicatorKeys = [
            'BAMLH0A0HYM2', 'T10Y2Y', 'STLFSI4', 'CFNAI',
            'VIXCLS', 'VXVCLS', 'DFII10', 'SP500', 'DGS10'
        ];

        rawHistoryData.forEach(item => {
            if (!item.date) return;

            // Update last known values for any non-null fields
            indicatorKeys.forEach(key => {
                if (item[key] !== null && item[key] !== undefined) {
                    lastKnown[key] = item[key];
                }
            });

            // Create a copy with filled-forward and backfilled values
            const filledItem = { ...item };

            // 1. Term Structure Proxy (VIX/VXV start ~2007)
            if (filledItem['VIXCLS'] === null || filledItem['VIXCLS'] === undefined) {
                filledItem['VIXCLS'] = lastKnown['VIXCLS'] ?? null;
            }
            if (filledItem['VXVCLS'] === null || filledItem['VXVCLS'] === undefined) {
                filledItem['VXVCLS'] = lastKnown['VXVCLS'] ?? 0.9 * (filledItem['VIXCLS'] || 15); // Rough fallback or 0.9 if no VIX
            }

            // 2. Real Yield Proxy (TIPS started ~2003)
            // If missing, use nominal 10Y - 2.5% (approx long-term inflation)
            if (filledItem['DFII10'] === null || filledItem['DFII10'] === undefined) {
                const nominal = filledItem['DGS10'] ?? lastKnown['DGS10'];
                filledItem['DFII10'] = nominal !== null ? nominal - 2.5 : null;
            }

            // 3. HY Spread Proxy (OAS started ~1996)
            if (filledItem['BAMLH0A0HYM2'] === null || filledItem['BAMLH0A0HYM2'] === undefined) {
                filledItem['BAMLH0A0HYM2'] = lastKnown['BAMLH0A0HYM2'] ?? 5.0; // Neutral historical approx
            }

            // 4. Financial Stress Proxy (STLFSI started ~1993)
            if (filledItem['STLFSI4'] === null || filledItem['STLFSI4'] === undefined) {
                filledItem['STLFSI4'] = lastKnown['STLFSI4'] ?? 0.0; // Neutral baseline
            }

            // 5. Standard fill-forward for others
            indicatorKeys.forEach(key => {
                if (filledItem[key] === null || filledItem[key] === undefined) {
                    filledItem[key] = lastKnown[key] ?? null;
                }
            });

            const date = new Date(item.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            // Always take the latest available day in the month as the bucket value
            monthlyMap.set(monthKey, filledItem);
        });

        // Convert map to sorted array
        const monthlyData = Array.from(monthlyMap.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // ── Step 2: Process Monthly Data for Charts ──
        const processed = [];
        for (let i = 0; i < monthlyData.length; i++) {
            const current = monthlyData[i];
            const future = (i + forwardPeriod < monthlyData.length) ? monthlyData[i + forwardPeriod] : null;

            let spx_fwd = null;
            let us10y_fwd = null;
            let return_diff = null;

            if (current && future && current.SP500 && future.SP500 && current.DGS10 && future.DGS10) {
                const spx_ret = ((future.SP500 - current.SP500) / current.SP500) * 100;
                // Since data is monthly, yield is simple: 1yr yield / 12 * months
                const yield_return = (current.DGS10 || 0) * (forwardPeriod / 12);
                // Rough duration approximation for bond price return
                const price_return = -8 * ((future.DGS10 || 0) - (current.DGS10 || 0));
                const bond_ret = yield_return + price_return;

                spx_fwd = parseFloat(spx_ret.toFixed(2));
                us10y_fwd = parseFloat(bond_ret.toFixed(2));
                return_diff = parseFloat((bond_ret - spx_ret).toFixed(2));
            }

            if (current) {
                processed.push({
                    date: current.date ? new Date(current.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'N/A',
                    raw_date: current.date,
                    return_diff: return_diff,
                    hy_spread: current.BAMLH0A0HYM2,
                    yield_curve: current.T10Y2Y,
                    fin_stress: current.STLFSI4,
                    macro_activity: current.CFNAI,
                    vix_term: (current.VIXCLS && current.VXVCLS) ? parseFloat((current.VIXCLS / current.VXVCLS).toFixed(2)) : null,
                    real_yield: current.DFII10,
                    spx_fwd: spx_fwd,
                    us10y_fwd: us10y_fwd,
                    raw_inputs: current,
                    // Add named keys for chart compatibility
                    hy_spread_val: current.BAMLH0A0HYM2,
                    yield_curve_val: current.T10Y2Y,
                    fin_stress_val: current.STLFSI4,
                    macro_activity_val: current.CFNAI,
                    vix_term_val: (current.VIXCLS && current.VXVCLS) ? (current.VIXCLS / current.VXVCLS) : null,
                    real_yield_val: current.DFII10
                });
            }
        }
        return processed as HistoryDataPoint[];
    }, [rawHistoryData, forwardPeriod]);

    return (
        <>
            <div className="flex space-x-1 bg-[#0f0f0f] p-1 rounded-lg border border-white/10 w-fit mb-8 overflow-x-auto">
                {['dashboard', 'forward', 'correlation', 'backtest', 'appendix'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 capitalize whitespace-nowrap",
                            activeTab === tab
                                ? "bg-[#1f1f1f] text-white shadow-sm border border-white/5"
                                : "text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent"
                        )}
                    >
                        {tab === 'forward' ? 'Forward Returns' : tab === 'correlation' ? 'Correlation Matrix' : tab}
                    </button>
                ))}
            </div>

            <div id={`export-container-${activeTab}`}>
                {activeTab === 'dashboard' && <DashboardTab fredData={fredData} loading={loading} historyData={historyData} lastSynced={lastSynced} />}
                {activeTab === 'forward' && <ForwardReturnsTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'correlation' && <CorrelationMatrixTab historyData={historyData} />}
                {activeTab === 'backtest' && <BacktestTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'appendix' && <AppendixTab />}
            </div>
        </>
    );
}
