import React, { useState, useEffect } from 'react';
import {
  LineChart as LineChartIcon,
  Info,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Activity,
  RefreshCw
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
} from '../../shared/utils';

interface EconomicCyclesData {
  historicalData: { year: string; equities: number | null; bonds: number | null }[];
  correlationData: { year: string; correlation: number | null }[];
  recessionPeriods: { start: string; end: string; label: string }[];
}

function formatYearKey(key: string): string {
  // key is YYYY-MM, return YYYY for display
  return key.substring(0, 4);
}

export function EconomicCycles() {
  const [data, setData] = useState<EconomicCyclesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/economic-cycles')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading economic cycles data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load economic cycles. Try syncing FRED data.</span>
      </div>
    );
  }

  // Thin out to annual (last month of each year) for chart readability
  const annualData: { year: string; equities: number | null; bonds: number | null }[] = [];
  const seenYears = new Set<string>();
  for (let i = data.historicalData.length - 1; i >= 0; i--) {
    const yr = formatYearKey(data.historicalData[i].year);
    if (!seenYears.has(yr)) {
      seenYears.add(yr);
      annualData.unshift({ year: yr, equities: data.historicalData[i].equities, bonds: data.historicalData[i].bonds });
    }
  }

  // Annual correlation (last observation per year)
  const annualCorr: { year: string; correlation: number | null }[] = [];
  const seenCorrYears = new Set<string>();
  for (let i = data.correlationData.length - 1; i >= 0; i--) {
    const yr = formatYearKey(data.correlationData[i].year);
    if (!seenCorrYears.has(yr)) {
      seenCorrYears.add(yr);
      annualCorr.unshift({ year: yr, correlation: data.correlationData[i].correlation });
    }
  }

  const filteredAnnualData = filterHistoryByRange(
    annualData.map(point => ({ ...point, date: `${point.year}-12-31` })),
    range
  );

  const filteredAnnualCorr = filterHistoryByRange(
    annualCorr.map(point => ({ ...point, date: `${point.year}-12-31` })),
    range
  );
  const historyCoverage = getHistoryCoverageLabel(
    annualData.map(point => ({ date: `${point.year}-12-31` }))
  );
  const tickFormatter = getHistoryTickFormatter(range);

  // Map NBER dates to year strings for ReferenceArea
  const recessionAreas = data.recessionPeriods.map(r => ({
    start: `${r.start.substring(0, 4)}-12-31`,
    end: `${r.end.substring(0, 4)}-12-31`,
    label: r.label,
  }));

  // Latest correlation for analysis
  const latestCorr = filteredAnnualCorr.length > 0 ? filteredAnnualCorr[filteredAnnualCorr.length - 1].correlation : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400" /> Methodology</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The <strong>Economic Cycles</strong> model tracks the relative performance of Equities (S&P 500) versus Bonds (10-Year US Treasury price proxy) across different macroeconomic regimes, both indexed to 100 at 1990. The bond price is approximated using DGS10 with an 8-year duration: Bond<sub>t</sub> = Bond<sub>t-1</sub> × (1 − ΔY × 0.08). Blue shaded areas are NBER-official recession periods. The rolling 3-year Pearson correlation between monthly equity and bond returns reveals the inflation-regime shift — negative correlations indicate the classic diversification benefit; positive correlations indicate an inflation-regime where bonds lose their hedge role.
        </p>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Main Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-emerald-400" />
              Historical Asset Performance
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredAnnualData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px' }} labelStyle={{ color: '#888', marginBottom: '4px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                {recessionAreas.map((period, idx) => (
                  <ReferenceArea key={idx} x1={period.start} x2={period.end} fill="#3b82f6" fillOpacity={0.15} />
                ))}

                <Line type="monotone" dataKey="equities" name="Equities (S&P 500)" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: '#10b981', stroke: '#000', strokeWidth: 2 }} connectNulls />
                <Line type="monotone" dataKey="bonds" name="Bonds (10Y Duration Proxy)" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#000', strokeWidth: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-white/40">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500/20 border border-blue-500/50 rounded-sm"></div>
              <span>NBER Recession Periods</span>
            </div>
          </div>
        </div>

        {/* Correlation Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Stock-Bond 3-Year Rolling Correlation
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredAnnualCorr} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCorrelation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px', color: '#f59e0b' }} labelStyle={{ color: '#888', marginBottom: '4px', fontSize: '12px' }} formatter={(value: number) => [value.toFixed(2), 'Correlation']} />
                <ReferenceArea y1={0} y2={1} fill="#ef4444" fillOpacity={0.05} />
                <ReferenceArea y1={-1} y2={0} fill="#10b981" fillOpacity={0.05} />
                <Area type="monotone" dataKey="correlation" stroke="#f59e0b" fillOpacity={1} fill="url(#colorCorrelation)" strokeWidth={2} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-white/40 px-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Negative (Diversification — bonds hedge equities)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Positive (Inflation Regime — no hedge)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="flex items-start gap-4 relative">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shrink-0">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="space-y-4 w-full">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                Stock-Bond Correlation Analysis
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">LIVE</span>
              </h3>
              <p className="text-xs text-white/40 mt-1">
                Current 3Y rolling correlation: <strong className={latestCorr !== null ? (latestCorr > 0.2 ? 'text-rose-400' : latestCorr < -0.2 ? 'text-emerald-400' : 'text-amber-400') : 'text-white/40'}>
                  {latestCorr !== null ? latestCorr.toFixed(2) : 'N/A'}
                </strong>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" /> Historical Regime Shifts
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  For the two decades preceding 2022, the stock-bond correlation was reliably negative (averaging -0.3). During demand-driven shocks (GFC, Dot-Com), bonds rallied as equities fell — the foundation of the 60/40 portfolio. During supply-driven inflation shocks (e.g., 2022), the correlation flips positive, causing simultaneous drawdowns across both asset classes.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Flight to Safety Implications
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  When the stock-bond correlation is positive (&gt;0.2), traditional "Risk-Off" rotations into long-duration bonds fail to provide portfolio protection. The Flight to Safety model dynamically adjusts: in positive-correlation regimes, it shifts to short-duration Treasuries, gold, and cash rather than long bonds.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
              <h4 className="text-sm font-medium text-indigo-300 mb-2">Current Regime Implication</h4>
              <p className="text-sm text-white/70 leading-relaxed">
                {latestCorr !== null && latestCorr > 0.2
                  ? `Correlation is positive (${latestCorr.toFixed(2)}), indicating an ongoing inflationary or transitional regime. Bond duration provides limited equity hedge. Favor short-duration Treasuries, gold, or cash equivalents for Risk-Off allocations.`
                  : latestCorr !== null && latestCorr < -0.2
                  ? `Correlation is negative (${latestCorr.toFixed(2)}), indicating the classic diversification regime. Long-duration bonds provide effective portfolio ballast during equity drawdowns. The traditional 60/40 framework is operative.`
                  : `Correlation is near neutral (${latestCorr !== null ? latestCorr.toFixed(2) : 'N/A'}), indicating a transitional period. Monitor for a sustained break into positive or negative territory as a signal of the prevailing macro regime.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
