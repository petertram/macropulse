import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { Globe, Info, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  downsampleHistory,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
  hasMixedCadenceHistory,
} from '../../shared/utils';

interface CommodityStats {
  price: number | null;
  r1m: number | null;
  r3m: number | null;
  r12m: number | null;
}

interface CommodityData {
  current: {
    oil: CommodityStats;
    gold: CommodityStats;
    copper: CommodityStats;
    copperGoldRatio: number | null;
    goldOilRatio: number | null;
    copperSignal: string;
  };
  ratioHistory: { date: string; copperGold: number | null; goldOil: number | null }[];
}

function ReturnPill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-white/55 text-xs font-mono">N/A</span>;
  const pos = value >= 0;
  return (
    <span className={`text-xs font-mono font-medium ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
      {pos ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function CommodityCard({ label, emoji, stats, color }: { label: string; emoji: string; stats: CommodityStats; color: string }) {
  return (
    <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
      <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-3">{emoji} {label}</div>
      <div className={`text-3xl font-light font-mono ${color} mb-4`}>
        {stats.price !== null ? `$${stats.price.toFixed(2)}` : 'N/A'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[{ label: '1M', v: stats.r1m }, { label: '3M', v: stats.r3m }, { label: '12M', v: stats.r12m }].map(({ label: l, v }) => (
          <div key={l} className="text-center">
            <div className="text-[9px] text-white/30 mb-1">{l}</div>
            <ReturnPill value={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

function getCopperSignalStyle(signal: string) {
  if (signal === 'Strong Growth') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (signal === 'Moderate Growth') return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (signal === 'Slowing') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (signal === 'Contraction') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return 'text-white/65 bg-white/10 border-white/15';
}

export function CommodityMonitor() {
  const [data, setData] = useState<CommodityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/commodities')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading commodity data...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load commodity data. Yahoo Finance may be unavailable.</span>
    </div>
  );

  const { current, ratioHistory } = data;

  const filteredRatioHistory = filterHistoryByRange(ratioHistory, range);
  const historyCoverage = getHistoryCoverageLabel(ratioHistory);
  const chartData = downsampleHistory(filteredRatioHistory, range === 'ALL' ? 240 : 160).map(h => ({
    date: h.date,
    'Copper/Gold': h.copperGold,
    'Gold/Oil': h.goldOil,
  }));
  const tickFormatter = getHistoryTickFormatter(range);

  const copperGoldTrend = ratioHistory.length >= 60
    ? ratioHistory[ratioHistory.length - 1].copperGold! > ratioHistory[ratioHistory.length - 60].copperGold!
    : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Commodity Cycle Monitor
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          <strong>Copper/Gold ratio</strong> (Jeff Gundlach's macro indicator): rising ratio = cyclical growth optimism (copper demand) vs. safe-haven fear (gold). Compare to DGS10 trend for rate confirmation. <strong>Gold/Oil ratio</strong>: rising = risk-off / deflationary environment; falling = risk-on / inflationary. <strong>Dr. Copper</strong> (12M return): +10% = strong growth signal; &lt;0% = economic slowdown signal. Data from Yahoo Finance futures (CL=F, GC=F, HG=F).
        </p>
      </div>

      {/* Commodity Prices */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CommodityCard label="WTI Crude Oil" emoji="🛢️" stats={current.oil} color="text-orange-400" />
        <CommodityCard label="Gold" emoji="🥇" stats={current.gold} color="text-yellow-400" />
        <CommodityCard label="Copper" emoji="🔶" stats={current.copper} color="text-amber-600" />
      </div>

      {/* Key Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Copper / Gold Ratio</div>
          <div className="text-3xl font-light font-mono text-amber-400">
            {current.copperGoldRatio !== null ? current.copperGoldRatio.toFixed(4) : 'N/A'}
          </div>
          {copperGoldTrend !== null && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${copperGoldTrend ? 'text-emerald-400' : 'text-rose-400'}`}>
              {copperGoldTrend ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {copperGoldTrend ? 'Rising — growth signal' : 'Falling — risk-off signal'}
            </div>
          )}
          <p className="text-[10px] text-white/55 mt-2">Rising = cyclical optimism; Falling = safe-haven flight</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Gold / Oil Ratio</div>
          <div className="text-3xl font-light font-mono text-yellow-400">
            {current.goldOilRatio !== null ? current.goldOilRatio.toFixed(2) : 'N/A'}
          </div>
          <p className="text-[10px] text-white/55 mt-2">Rising = deflationary/risk-off; Falling = inflationary/risk-on</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Dr. Copper Signal</div>
          <div className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-sm font-bold uppercase tracking-wider mt-1 ${getCopperSignalStyle(current.copperSignal)}`}>
            {current.copperSignal}
          </div>
          <p className="text-[10px] text-white/55 mt-3">Based on Copper 12M return: &gt;+10% = Strong Growth, &lt;0% = Contraction</p>
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
          showMixedCadenceNote={hasMixedCadenceHistory(ratioHistory)}
        />
      </div>

      {/* Ratio Charts */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            Copper/Gold &amp; Gold/Oil Ratios
          </h3>
          <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={tickFormatter} />
              <YAxis yAxisId="left" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(v: number, name: string) => [v?.toFixed(4), name]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
              <Line yAxisId="left" type="monotone" dataKey="Copper/Gold" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="Gold/Oil" stroke="#fde047" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
