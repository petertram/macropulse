import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Target, Info, TrendingUp, TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react';

interface FedPolicyPoint {
  date: string;
  fedFunds: number | null;
  taylorRate: number | null;
  gap: number | null;
  realRate: number | null;
  inflationYoY: number | null;
}

interface FedPolicyData {
  current: {
    fedFunds: number | null;
    taylorRate: number | null;
    gap: number | null;
    realRate: number | null;
    inflationYoY: number | null;
    upperBound: number | null;
    lowerBound: number | null;
    policyStance: string;
  };
  history: FedPolicyPoint[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getStanceColor(stance: string): string {
  if (stance.includes('Extremely Restrictive')) return 'text-rose-400';
  if (stance.includes('Restrictive')) return 'text-amber-400';
  if (stance.includes('Extremely Accommodative')) return 'text-emerald-400';
  if (stance.includes('Accommodative')) return 'text-blue-400';
  return 'text-white/60';
}

function getStanceBg(stance: string): string {
  if (stance.includes('Extremely Restrictive')) return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  if (stance.includes('Restrictive')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  if (stance.includes('Extremely Accommodative')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  if (stance.includes('Accommodative')) return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
  return 'bg-white/5 border-white/10 text-white/60';
}

// Policy stance gauge position (0 = extremely accommodative, 100 = extremely restrictive)
function stanceToPosition(gap: number | null): number {
  if (gap === null) return 50;
  // Gap: -3 or less = 0, +3 or more = 100, linear
  return Math.round(Math.max(0, Math.min(100, (gap + 3) / 6 * 100)));
}

export function FedPolicyTracker() {
  const [data, setData] = useState<FedPolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/fed-policy')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Computing Fed policy model...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load Fed policy model. Try syncing FRED data.</span>
      </div>
    );
  }

  const { current } = data;
  const chartData = data.history.slice(-120).map(h => ({
    date: formatDate(h.date),
    'Fed Funds': h.fedFunds,
    'Taylor Rule': h.taylorRate,
    'Real Rate': h.realRate,
    'Gap': h.gap,
  }));

  const gaugePos = stanceToPosition(current.gap);
  const stanceColor = getStanceColor(current.policyStance);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Taylor Rule (1993)
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Stanford economist John Taylor's 1993 formulation provides a mechanical benchmark for the optimal Federal Funds Rate:
          <span className="font-mono text-white/80 ml-1">r* = 2.5 + π + 0.5×(π − 2.0) + 0.5×(CFNAI × 2.0)</span>
          where π = CPI YoY%, 2.5% = assumed neutral real rate, and CFNAI × 2 proxies the output gap.
          The <strong>Policy Gap</strong> = Fed Funds − Taylor Rate. A positive gap = restrictive (Fed above rule); negative = accommodative (Fed below rule).
          The <strong>Real Fed Funds Rate</strong> = Fed Funds − CPI YoY% measures the true tightness of monetary conditions.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Fed Funds Rate</div>
          <div className="text-3xl font-light text-white font-mono">
            {current.fedFunds !== null ? `${current.fedFunds.toFixed(2)}%` : 'N/A'}
          </div>
          {current.upperBound !== null && current.lowerBound !== null && (
            <p className="text-[10px] text-white/30 mt-2">Target: {current.lowerBound.toFixed(2)}–{current.upperBound.toFixed(2)}%</p>
          )}
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Taylor Rule Rate</div>
          <div className="text-3xl font-light text-white font-mono">
            {current.taylorRate !== null ? `${current.taylorRate.toFixed(2)}%` : 'N/A'}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Inflation: {current.inflationYoY !== null ? `${current.inflationYoY.toFixed(1)}%` : 'N/A'} YoY</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Policy Gap</div>
          <div className={`text-3xl font-light font-mono ${current.gap !== null && current.gap > 0 ? 'text-rose-400' : current.gap !== null && current.gap < 0 ? 'text-emerald-400' : 'text-white'}`}>
            {current.gap !== null ? `${current.gap >= 0 ? '+' : ''}${current.gap.toFixed(2)}%` : 'N/A'}
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            {current.gap !== null && current.gap > 0 ? 'Fed above rule (restrictive)' : current.gap !== null && current.gap < 0 ? 'Fed below rule (accommodative)' : ''}
          </p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Real Fed Funds</div>
          <div className={`text-3xl font-light font-mono ${current.realRate !== null && current.realRate > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
            {current.realRate !== null ? `${current.realRate >= 0 ? '+' : ''}${current.realRate.toFixed(2)}%` : 'N/A'}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Fed Funds − CPI YoY</p>
        </div>
      </div>

      {/* Policy Stance Gauge */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400" />
            Policy Stance Gauge
          </h3>
          <div className={`px-3 py-1 border rounded-lg text-sm font-bold uppercase tracking-widest ${getStanceBg(current.policyStance)}`}>
            {current.policyStance}
          </div>
        </div>
        <div className="relative py-4">
          {/* Track */}
          <div className="w-full h-3 rounded-full relative overflow-hidden" style={{
            background: 'linear-gradient(to right, #10b981, #3b82f6, #f59e0b, #ef4444)'
          }}>
            {/* Indicator */}
            <div
              className="absolute top-1/2 w-4 h-4 bg-white rounded-full border-2 border-[#0f0f0f] shadow-lg -translate-y-1/2 -translate-x-1/2 transition-all duration-500"
              style={{ left: `${gaugePos}%` }}
            />
          </div>
          <div className="flex justify-between mt-3 text-[10px] text-white/40">
            <span>Extremely Accommodative</span>
            <span>Neutral</span>
            <span>Extremely Restrictive</span>
          </div>
        </div>
        <p className="text-xs text-white/40 mt-2">
          Gap of <strong className={stanceColor}>{current.gap !== null ? `${current.gap >= 0 ? '+' : ''}${current.gap.toFixed(2)}pp` : 'N/A'}</strong> between actual Fed Funds rate and Taylor Rule prescription. Persistently positive gaps historically precede over-tightening; negative gaps precede inflationary episodes.
        </p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            Fed Funds vs Taylor Rule (10 Years)
          </h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v?.toFixed(2)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
                <Line type="monotone" dataKey="Fed Funds" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="Taylor Rule" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-400" />
            Real Fed Funds Rate & Policy Gap (10 Years)
          </h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v?.toFixed(2)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="Real Rate" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="Gap" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
