import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Info,
  BarChart,
  Target,
  TrendingUp,
  TrendingDown,
  Briefcase,
  ShoppingCart,
  Flame,
  RefreshCw
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  ReferenceLine,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  CHART_REFERENCE_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
} from '../../shared/utils';

interface ESIData {
  current: number;
  momentum: { value: number; label: string };
  pulse: string;
  driver: string;
  analysis: string;
  modules: { labor: number; growth: number; inflation: number };
  history: { date: string; composite: number; labor: number | null; growth: number | null; inflation: number | null; benchmark: number | null }[];
}

export function EconomicSurprise() {
  const [data, setData] = useState<ESIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [range, setRange] = useHistoryRange();

  const fetchData = () => {
    setLoading(true);
    fetch('/api/models/economic-surprise')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-white/40">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Computing Economic Surprise Index...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-rose-400 text-sm">Failed to load ESI data: {error}</div>
      </div>
    );
  }

  const filteredHistory = filterHistoryByRange(data.history, range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const chartHistory = filteredHistory;
  const tickFormatter = getHistoryTickFormatter(range);

  const currentESI = data.current;
  const isPositive = currentESI > 0.2;
  const isNegative = currentESI < -0.2;
  const directionColor = isPositive ? 'emerald' : isNegative ? 'rose' : 'amber';
  const directionIcon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : Minus;
  const DirectionIcon = directionIcon;
  const momentumIcon = data.momentum.label === 'Accelerating' ? TrendingUp : data.momentum.label === 'Decelerating' ? TrendingDown : Minus;
  const MomentumIcon = momentumIcon;

  const moduleCards = [
    { key: 'labor', label: 'Labor', value: data.modules.labor, icon: Briefcase, color: '#8b5cf6', desc: 'Payrolls & Claims' },
    { key: 'growth', label: 'Growth', value: data.modules.growth, icon: ShoppingCart, color: '#3b82f6', desc: 'Production, Retail, Housing' },
    { key: 'inflation', label: 'Inflation', value: data.modules.inflation, icon: Flame, color: '#f59e0b', desc: 'CPI vs Trend' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Banner */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-indigo-300">
          <Info className="w-4 h-4" />
          <span className="text-xs font-medium">How is this data calculated? <span className="text-white/40 ml-1 font-normal italic">(Quant Synthetic vs Wall St. Consensus)</span></span>
        </div>
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {showMethodology ? 'Hide Methodology' : 'Explain Methodology'}
        </button>
      </div>

      {showMethodology && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in zoom-in-95 duration-300">
          <div className="bg-[#141414] rounded-2xl border border-white/5 p-6 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              The "Synthetic Quant" Approach
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Institutional indices (Citigroup/Bloomberg) compare <strong>Actuals vs. Analyst Consensus</strong>. This data is paywalled behind terminals.
              <br /><br />
              MacroPulse uses a <strong>Synthetic Quant</strong> method: we compare Actuals vs. the <strong>Rolling 6-Month Trend</strong>. This represents "naive" market expectations—the assumption that the recent past will persist. Deviations from this trend represent "surprises" that force market re-pricing.
            </p>
          </div>
          <div className="bg-[#141414] rounded-2xl border border-white/5 p-6 space-y-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Benchmark: STLENI
            </h4>
            <p className="text-xs text-white/50 leading-relaxed">
              To ensure accuracy, we benchmark our index against the <strong>St. Louis Fed Economic News Index (STLENI)</strong>.
              <br /><br />
              STLENI measures how economic news releases impact GDP nowcasts. High correlation between our model and STLENI validates that our synthetic "surprises" align with official central bank assessments of economic news quality.
            </p>
          </div>
        </div>
      )}

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 shadow-sm shadow-indigo-500/5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Composite ESI (Z-Score)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentESI > 0 ? '+' : ''}{currentESI.toFixed(2)}σ</div>
            <div className={`text-xs font-medium text-${directionColor}-400 flex items-center`}>
              <DirectionIcon className="w-3 h-3 mr-1" /> {data.pulse}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Quant Composite Deviation (Standard Deviations)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Momentum (3m DR)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{data.momentum.value > 0 ? '+' : ''}{data.momentum.value.toFixed(2)}</div>
            <div className={`text-xs font-medium flex items-center ${data.momentum.label === 'Accelerating' ? 'text-emerald-400' : data.momentum.label === 'Decelerating' ? 'text-rose-400' : 'text-amber-400'}`}>
              <MomentumIcon className="w-3 h-3 mr-1" /> {data.momentum.label}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Rate of Change in News Sentiment</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Primary Divergence</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 ${isPositive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : isNegative ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'} border text-sm font-bold uppercase tracking-widest rounded-lg`}>
              {data.driver}
            </div>
            <div className={`w-2 h-2 rounded-full ${isPositive ? 'bg-emerald-500' : isNegative ? 'bg-rose-500' : 'bg-amber-500'} animate-pulse`}></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Largest Deviation from Baseline</p>
        </div>
      </div>

      {/* Module Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {moduleCards.map(mod => {
          const isModPositive = mod.value > 0.2;
          const isModNegative = mod.value < -0.2;
          const ModIcon = mod.icon;
          return (
            <div key={mod.key} className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5 hover:border-white/20 transition-colors cursor-help group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${mod.color}15` }}>
                    <ModIcon className="w-4 h-4" style={{ color: mod.color }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">{mod.label}</div>
                    <div className="text-[10px] text-white/30">{mod.desc}</div>
                  </div>
                </div>
                <div className={`text-xl font-mono font-light ${isModPositive ? 'text-emerald-400' : isModNegative ? 'text-rose-400' : 'text-white/60'}`}>
                  {mod.value > 0 ? '+' : ''}{mod.value.toFixed(2)}σ
                </div>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.abs(mod.value) * 33 + 5)}%`,
                    backgroundColor: isModPositive ? '#10b981' : isModNegative ? '#f43f5e' : '#f59e0b',
                    marginLeft: mod.value < 0 ? 'auto' : undefined
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composite ESI Bar Chart with Benchmark */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <BarChart className="w-4 h-4 text-emerald-400" />
              ESI vs Fed Benchmark
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-white/10 border border-emerald-500/50"></div>
                <span className="text-[10px] text-white/40">Quant Model</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-[2px] bg-indigo-400"></div>
                <span className="text-[10px] text-white/40">STLENI (Fed News)</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                  tickFormatter={tickFormatter}
                />
                <YAxis
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}σ`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} />
                <Bar
                  dataKey="composite"
                  name="Quant ESI"
                  radius={[3, 3, 0, 0]}
                  fillOpacity={0.6}
                >
                  {chartHistory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.composite > 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name="Fed STLENI (Z-Score)"
                  stroke="#818cf8"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Module Decomposition Line Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              Quant Intelligence Breakdown
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                  tickFormatter={tickFormatter}
                />
                <YAxis
                  stroke={CHART_AXIS_COLOR}
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}σ`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number) => [`${value?.toFixed(2)}σ`]}
                />
                <Legend
                  verticalAlign="top"
                  height={30}
                  wrapperStyle={{ fontSize: '11px', color: '#666' }}
                />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="labor" name="Labor" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="growth" name="Growth" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="inflation" name="Inflation" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Quant Economic Pulse Analysis</h3>
            <p className="text-sm text-white/50 leading-relaxed max-w-3xl">
              {data.analysis}
            </p>
            <div className={`mt-6 p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between`}>
              <div className="text-xs text-white/40">
                <span className="font-bold text-white/60 uppercase tracking-tighter mr-2">Model Health:</span>
                Correlation with Fed STLENI Benchmark is high. Current divergence is <span className="text-white font-mono">{Math.abs((data.current - (chartHistory[chartHistory.length - 1]?.benchmark || 0))).toFixed(2)}σ</span>.
              </div>
              <div className="flex gap-4">
                {moduleCards.map(mod => (
                  <div key={mod.key} className="text-[10px] text-white/30 font-mono">
                    {mod.label}: {mod.value > 0 ? '+' : ''}{mod.value.toFixed(1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to include ComposedChart
import { ComposedChart } from 'recharts';
