import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Activity,
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
  LineChart,
  Line,
  ReferenceLine
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

interface RecessionData {
  composite: number;
  riskLevel: 'Low' | 'Moderate' | 'Elevated';
  trend: 'Rising' | 'Falling' | 'Stable';
  sahm: { current: number; triggered: boolean; threshold: number };
  probit: { current: number; spread: number };
  claims: { icsa3mMA: number | null; icsa52wLow: number | null; icsaSignalPct: number; icsaScore: number } | null;
  history: { date: string; probability: number; sahm: number }[];
  analysis: string;
}

export function RecessionProbability() {
  const [data, setData] = useState<RecessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/recession-probability')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Computing recession probability...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load recession model. Try syncing FRED data.</span>
      </div>
    );
  }

  const riskColor = data.riskLevel === 'Elevated' ? 'text-rose-400' : data.riskLevel === 'Moderate' ? 'text-amber-400' : 'text-emerald-400';
  const riskBg = data.riskLevel === 'Elevated' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : data.riskLevel === 'Moderate' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  const riskDot = data.riskLevel === 'Elevated' ? 'bg-rose-500' : data.riskLevel === 'Moderate' ? 'bg-amber-500' : 'bg-emerald-500';

  const filteredHistory = filterHistoryByRange(data.history, range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const chartData = filteredHistory.map(h => ({
    date: h.date,
    probability: h.probability,
    sahm: h.sahm,
  }));
  const tickFormatter = getHistoryTickFormatter(range);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Recession Probability model synthesizes three leading indicators. The <strong>Sahm Rule</strong> (Claudia Sahm, 2019) signals recession start when the 3-month MA of unemployment rises ≥0.50pp above its 12-month low — it has a perfect real-time track record since 1970. The <strong>Yield Curve Probit</strong> (Estrella-Mishkin 1998, NY Fed) estimates 12-month forward recession probability from the 10Y-3M spread using standard normal CDF. The <strong>Initial Claims Signal</strong> measures weekly jobless claims 3-month MA vs 52-week low — a 15% rise above the low scores 100. Composite = 35% Sahm + 45% Probit + 20% Claims signal.
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Composite Recession Probability</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{data.composite.toFixed(1)}%</div>
            <div className={`text-xs font-medium flex items-center ${riskColor}`}>
              {data.trend === 'Rising' ? <TrendingUp className="w-3 h-3 mr-1" /> : data.trend === 'Falling' ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
              {data.trend}
            </div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">12-Month Forward Outlook</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Sahm Rule Indicator</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{data.sahm.current.toFixed(2)}</div>
            <div className={`text-xs font-medium flex items-center ${data.sahm.triggered ? 'text-rose-400' : 'text-emerald-400'}`}>
              {data.sahm.triggered ? <AlertTriangle className="w-3 h-3 mr-1" /> : null}
              {data.sahm.triggered ? 'Triggered' : 'Clear'}
            </div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">Threshold: 0.50 | 10Y-3M Spread: {data.probit.spread.toFixed(2)}%</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Risk Level</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 border text-sm font-bold uppercase tracking-widest rounded-lg ${riskBg}`}>
              {data.riskLevel}
            </div>
            <div className={`w-2 h-2 rounded-full ${riskDot} animate-pulse`}></div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">Probit: {data.probit.current.toFixed(1)}%</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Initial Claims Signal</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {data.claims ? data.claims.icsaScore.toFixed(0) : 'N/A'}
            </div>
            <div className="text-xs font-medium text-white/60">/ 100</div>
          </div>
          <p className="text-[10px] text-white/55 mt-2">
            {data.claims
              ? `3M MA: ${data.claims.icsa3mMA != null ? Math.round(data.claims.icsa3mMA).toLocaleString() : 'N/A'} | +${data.claims.icsaSignalPct.toFixed(1)}% above 52W low`
              : 'No claims data'}
          </p>
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Recession Probability Trend
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="probability" name="Probability %" stroke="#f43f5e" fillOpacity={1} fill="url(#colorProb)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Sahm Rule Real-Time Indicator
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 'dataMax + 0.1']} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <ReferenceLine y={0.5} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: 'Recession Threshold (0.5)', fill: '#f43f5e', fontSize: 10 }} />
                <Line type="monotone" dataKey="sahm" name="Sahm Indicator" stroke="#f59e0b" strokeWidth={2} dot={false} />
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
            <h3 className="text-lg font-semibold text-white mb-2">Recession Risk Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">{data.analysis}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
