import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { Gauge, Info, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
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

interface FCIComponent {
  name: string;
  series: string;
  weight: number;
  value: number | null;
  zScore: number | null;
  contribution: number | null;
}

interface FCIData {
  score: number | null;
  percentile: number | null;
  impulse: number | null;
  regime: string;
  components: FCIComponent[];
  history: { date: string; fci: number | null }[];
}

function getRegimeStyle(regime: string) {
  if (regime === 'Loose') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (regime === 'Very Tight') return { color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
  if (regime === 'Tight') return { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

export function FCI() {
  const [data, setData] = useState<FCIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/fci')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Computing Financial Conditions Index...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load FCI. Try syncing FRED data.</span>
    </div>
  );

  const regimeStyle = getRegimeStyle(data.regime);
  const scoreColor = (data.score ?? 0) >= 0.5 ? 'text-emerald-400' : (data.score ?? 0) <= -1.5 ? 'text-rose-400' : (data.score ?? 0) <= -0.5 ? 'text-amber-400' : 'text-slate-400';
  const impulsePositive = (data.impulse ?? 0) >= 0;

  const filteredHistory = filterHistoryByRange(data.history, range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const historyChart = filteredHistory.map(h => ({ date: h.date, fci: h.fci }));
  const waterfallData = data.components.map(c => ({
    name: c.name,
    contribution: c.contribution != null ? parseFloat(c.contribution.toFixed(3)) : 0,
  }));
  const tickFormatter = getHistoryTickFormatter(range);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Financial Conditions Index
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The FCI aggregates six asset-class channels into a single Z-score composite using rolling 36-month windows.
          Components: <strong>Short Rate</strong> (FEDFUNDS, 20%), <strong>Real Long Rate</strong> (TIPS 10Y, 20%), <strong>HY Spread</strong> (20%), <strong>IG Spread</strong> (ICE BofA, 15%), <strong>Dollar Index</strong> (15%), <strong>Equity</strong> (SP500 YoY, inverted, 10%).
          Positive FCI = loose conditions (growth supportive); Negative = tight (growth headwind).
          The <strong>3M Impulse</strong> measures the change in FCI over 3 months — negative impulse = tightening trend.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">FCI Score</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-4xl font-light font-mono ${scoreColor}`}>
              {data.score != null ? `${data.score >= 0 ? '+' : ''}${data.score.toFixed(2)}` : 'N/A'}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className={`px-2 py-0.5 border rounded text-xs font-bold uppercase tracking-wider ${regimeStyle.bg} ${regimeStyle.color}`}>
              {data.regime}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Positive = loose · Negative = tight</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">5Y Percentile</div>
          <div className="text-4xl font-light font-mono text-white">
            {data.percentile != null ? `${data.percentile.toFixed(0)}th` : 'N/A'}
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${data.percentile ?? 0}%` }} />
          </div>
          <p className="text-[10px] text-white/30 mt-2">Relative to last 5 years of conditions</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">3M Impulse</div>
          <div className={`flex items-baseline gap-2`}>
            <div className={`text-4xl font-light font-mono ${impulsePositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.impulse != null ? `${data.impulse >= 0 ? '+' : ''}${data.impulse.toFixed(2)}` : 'N/A'}
            </div>
            {data.impulse != null && (
              <div className={`text-xs font-medium ${impulsePositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {impulsePositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            {impulsePositive ? 'Loosening trend — conditions improving' : 'Tightening trend — growth headwind building'}
          </p>
        </div>
      </div>

      {/* Component Waterfall */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-400" />
          Component Contributions to FCI
        </h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
              <XAxis type="number" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false}
                tickFormatter={v => v.toFixed(2)} domain={['dataMin - 0.05', 'dataMax + 0.05']} />
              <YAxis type="category" dataKey="name" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} width={130} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(3)}`, 'Contribution']}
              />
              <ReferenceLine x={0} stroke={CHART_REFERENCE_COLOR} />
              <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.contribution >= 0 ? '#10b981' : '#f43f5e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-white/40 mt-2">
          Positive bars = loosening contribution · Negative bars = tightening contribution · Sum = FCI Score
        </p>
      </div>

      {/* Component Details Table */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">Component Details</h3>
        </div>
        <div className="divide-y divide-white/5">
          {data.components.map((c, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{c.name}</div>
                <div className="text-[10px] text-white/40">{c.series} · {(c.weight * 100).toFixed(0)}% weight</div>
              </div>
              <div className="flex items-center gap-6 text-right shrink-0">
                <div>
                  <div className="text-[10px] text-white/30">Value</div>
                  <div className="text-sm font-mono text-white/70">{c.value != null ? c.value.toFixed(2) : 'N/A'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-white/30">Z-Score</div>
                  <div className={`text-sm font-mono ${(c.zScore ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {c.zScore != null ? `${c.zScore >= 0 ? '+' : ''}${c.zScore.toFixed(2)}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-white/30">Contribution</div>
                  <div className={`text-sm font-mono ${(c.contribution ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {c.contribution != null ? `${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(3)}` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      {/* History Chart */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            FCI History
          </h3>
          <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyChart}>
              <defs>
                <linearGradient id="fciGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
              <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} />
              <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v?.toFixed(2)}`, 'FCI']} />
              <ReferenceLine y={0.5} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Loose (0.5)', fill: '#10b98166', fontSize: 9 }} />
              <ReferenceLine y={-0.5} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Tight (-0.5)', fill: '#f59e0b66', fontSize: 9 }} />
              <ReferenceLine y={-1.5} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Very Tight (-1.5)', fill: '#f43f5e66', fontSize: 9 }} />
              <Area type="monotone" dataKey="fci" name="FCI" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#fciGradient)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
