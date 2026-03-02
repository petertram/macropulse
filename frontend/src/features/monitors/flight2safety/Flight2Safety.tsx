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
}

export function Flight2Safety({ fredData, rawHistoryData, loading }: Flight2SafetyProps) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [forwardPeriod, setForwardPeriod] = useState<number>(3);

    const historyData = useMemo(() => {
        if (!rawHistoryData || rawHistoryData.length === 0) return [];

        const processed = [];
        for (let i = 0; i < rawHistoryData.length - forwardPeriod; i++) {
            const current = rawHistoryData[i];
            const future = rawHistoryData[i + forwardPeriod];

            if (current && future && current.SP500 && future.SP500 && current.DGS10 && future.DGS10) {
                const spx_fwd = ((future.SP500 - current.SP500) / current.SP500) * 100;
                const yield_return = (current.DGS10 || 0) * (forwardPeriod / 12);
                const price_return = -8 * ((future.DGS10 || 0) - (current.DGS10 || 0));
                const us10y_fwd = yield_return + price_return;
                const return_diff = us10y_fwd - spx_fwd;

                if (!isNaN(return_diff) && isFinite(return_diff)) {
                    processed.push({
                        date: current.date ? new Date(current.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'N/A',
                        raw_date: current.date,
                        return_diff: parseFloat(return_diff.toFixed(2)),
                        hy_spread: current.BAMLH0A0HYM2,
                        yield_curve: current.T10Y2Y,
                        fin_stress: current.STLFSI4,
                        macro_activity: current.CFNAI,
                        vix_term: (current.VIXCLS && current.VXVCLS) ? parseFloat((current.VIXCLS / current.VXVCLS).toFixed(2)) : null,
                        real_yield: current.DFII10,
                        spx_fwd: parseFloat(spx_fwd.toFixed(2)),
                        us10y_fwd: parseFloat(us10y_fwd.toFixed(2)),
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
                {activeTab === 'dashboard' && <DashboardTab fredData={fredData} loading={loading} historyData={historyData} />}
                {activeTab === 'forward' && <ForwardReturnsTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'correlation' && <CorrelationMatrixTab historyData={historyData} />}
                {activeTab === 'backtest' && <BacktestTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'appendix' && <AppendixTab />}
            </div>
        </>
    );
}
