import React, { useMemo } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Flame,
  Thermometer,
  RefreshCw,
  Minus
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
  hasMixedCadenceHistory,
} from '../../shared/utils';

interface InflationTrackerProps {
  fredData: any[];
  rawHistoryData: any[];
  loading: boolean;
}

export function InflationTracker({ fredData, rawHistoryData, loading }: InflationTrackerProps) {
  const [range, setRange] = useHistoryRange();
  const currentBreakeven = fredData.find(d => d.id === 'T10YIE')?.value || 2.45;
  const currentSticky = fredData.find(d => d.id === 'CORESTICKM159SFRBATL')?.value || 4.1;
  const lastUpdate = fredData.find(d => d.id === 'CORESTICKM159SFRBATL')?.date;

  const processedHistory = useMemo(() => {
    if (!rawHistoryData || rawHistoryData.length === 0) return [];

    // Filter for data since 1990 and perform monthly downsampling
    const monthlyMap = new Map<string, any>();
    const lastKnownBreakeven: number | null = null;
    const lastKnownSticky: number | null = null;

    const sortedData = [...rawHistoryData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentBreakevenVal = lastKnownBreakeven;
    let currentStickyVal = lastKnownSticky;

    sortedData.forEach(item => {
      const date = new Date(item.date);
      if (date.getFullYear() < 1990) return;

      if (item.T10YIE !== undefined && item.T10YIE !== null) currentBreakevenVal = item.T10YIE;
      if (item.CORESTICKM159SFRBATL !== undefined && item.CORESTICKM159SFRBATL !== null) currentStickyVal = item.CORESTICKM159SFRBATL;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(monthKey, {
        date: item.date,
        displayDate: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        breakeven: currentBreakevenVal,
        sticky_cpi: currentStickyVal,
      });
    });

    return Array.from(monthlyMap.values());
  }, [rawHistoryData]);
  const filteredHistory = useMemo(() => filterHistoryByRange(processedHistory, range), [processedHistory, range]);
  const historyCoverage = getHistoryCoverageLabel(processedHistory);
  const tickFormatter = getHistoryTickFormatter(range);

  // Regime Logic
  const getRegime = () => {
    if (currentSticky > 10) return { label: 'Hyperinflation', color: 'rose', icon: Flame };
    if (currentSticky > 3 || currentBreakeven > 2.5) return { label: 'Elevated', color: 'amber', icon: Thermometer };
    if (currentSticky > 1.5) return { label: 'Stable', color: 'emerald', icon: Info };
    return { label: 'Deflationary', color: 'blue', icon: Info };
  };

  const regime = getRegime();

  if (loading && processedHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-white/40">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading Inflation Data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">10Y Breakeven Inflation</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentBreakeven.toFixed(2)}%</div>
            <div className="text-xs font-medium text-amber-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> Market-Based
            </div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">Expectation (T10YIE) - Updated {lastUpdate || '---'}</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Sticky Price CPI</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentSticky.toFixed(1)}%</div>
            <div className="text-xs font-medium text-amber-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Core Pressure
            </div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">Atlanta Fed Sticky CPI YoY</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Inflation Regime</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 bg-${regime.color}-500/10 border border-${regime.color}-500/20 text-${regime.color}-400 text-sm font-bold uppercase tracking-widest rounded-lg`}>
              {regime.label}
            </div>
            <div className={`w-2 h-2 rounded-full bg-${regime.color}-500 animate-pulse`}></div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">Policy Environment Context</p>
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
          showMixedCadenceNote={hasMixedCadenceHistory(processedHistory)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-400" />
              10Y Breakeven Inflation Rate
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredHistory}>
                <defs>
                  <linearGradient id="colorBreak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(filteredHistory.length / 10)}
                  tickFormatter={tickFormatter}
                />
                <YAxis
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Area
                  type="monotone"
                  dataKey="breakeven"
                  name="10Y Breakeven"
                  stroke="#f59e0b"
                  fillOpacity={1}
                  fill="url(#colorBreak)"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              Sticky Price CPI Growth
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(filteredHistory.length / 10)}
                  tickFormatter={tickFormatter}
                />
                <YAxis
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Line
                  type="monotone"
                  dataKey="sticky_cpi"
                  name="Sticky CPI YoY"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Info className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Inflation Regime Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              Inflation is currently in a <strong>{regime.label}</strong> regime. {regime.label === 'Elevated' ? 'While headline CPI may show volatility due to energy prices, the "Sticky Price CPI" (which includes services and housing) remains stubbornly high. Market-based inflation expectations (10Y Breakeven) are also beginning to drift upward. This environment typically favors Commodities and Real Assets while posing a threat to long-duration Fixed Income.' : regime.label === 'Stable' ? 'Inflation remains within the targeted range, supporting a balanced asset allocation. Both market expectations and core sticky prices are aligned with long-term stability.' : regime.label === 'Deflationary' ? 'Inflation is below trend, signaling potential economic stagnation or recessionary pressure. This environment typically favors Fixed Income and safe-haven assets.' : 'Hyperinflationary pressures are present, requiring radical hedging and defensive positioning.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
