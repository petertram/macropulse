import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface CreditCycleData {
  hySpread: number | null;
  igSpread: number | null;
  lendingStandards: number | null;
  creditGrowthYoY: number | null;
  cyclePhase: string;
  spreadChangePct: number | null;
  history: { date: string; hy_spread: number | null; ig_spread: number | null; lending_standards: number | null }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getPhaseStyle(phase: string): string {
  if (phase.includes('Stress') || phase.includes('Crisis')) return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  if (phase.includes('Late') || phase.includes('Contraction')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  if (phase.includes('Expansion')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
}

function getPhaseDot(phase: string): string {
  if (phase.includes('Stress') || phase.includes('Crisis')) return 'bg-rose-500';
  if (phase.includes('Late') || phase.includes('Contraction')) return 'bg-amber-500';
  if (phase.includes('Expansion')) return 'bg-emerald-500';
  return 'bg-blue-500';
}

export function CreditCycle() {
  const [data, setData] = useState<CreditCycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/credit-cycle')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading credit cycle data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load credit cycle. Try syncing FRED data.</span>
      </div>
    );
  }

  const chartData = data.history.map(h => ({
    date: formatDate(h.date),
    hy_spread: h.hy_spread,
    ig_spread: h.ig_spread,
    lending_standards: h.lending_standards,
  }));

  const hySpread = data.hySpread;
  const spreadChange = data.spreadChangePct;
  const hyColor = spreadChange !== null ? (spreadChange > 0 ? 'text-rose-400' : 'text-emerald-400') : 'text-white/50';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Credit Cycle model tracks three pillars: <strong>High-Yield OAS</strong> (BAMLH0A0HYM2) measures risk appetite in speculative-grade credit; <strong>IG Spread</strong> (Baa-10Y, BAA10YM) captures investment-grade conditions; and <strong>SLOOS Lending Standards</strong> (DRTSCILM) — the Federal Reserve's Senior Loan Officer Survey on C&I loans — is the leading indicator of bank credit availability. When spreads widen and standards tighten simultaneously, credit contraction is historically imminent. Credit cycle phase is classified using a three-factor rule.
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">HY OA Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {hySpread !== null ? `${hySpread.toFixed(2)}%` : 'N/A'}
            </div>
            {spreadChange !== null && (
              <div className={`text-xs font-medium flex items-center ${hyColor}`}>
                {spreadChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(spreadChange).toFixed(1)}%
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">FRED: BAMLH0A0HYM2 | {hySpread !== null && hySpread < 300 ? 'Tight — Risk-On' : hySpread !== null && hySpread > 500 ? 'Wide — Stress' : 'Elevated'}</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">IG Credit Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {data.igSpread !== null ? `${data.igSpread.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">FRED: BAA10YM (Baa-10Y proxy)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Bank Lending Standards</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {data.lendingStandards !== null ? `${data.lendingStandards.toFixed(1)}%` : 'N/A'}
            </div>
            {data.lendingStandards !== null && (
              <div className={`text-xs font-medium flex items-center ${data.lendingStandards > 10 ? 'text-rose-400' : data.lendingStandards < 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {data.lendingStandards > 10 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {data.lendingStandards > 10 ? 'Tightening' : data.lendingStandards < 0 ? 'Easing' : 'Neutral'}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Net % Tightening (SLOOS C&I)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Cycle Phase</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 border text-xs font-bold uppercase tracking-widest rounded-lg ${getPhaseStyle(data.cyclePhase)}`}>
              {data.cyclePhase}
            </div>
            <div className={`w-2 h-2 rounded-full animate-pulse ${getPhaseDot(data.cyclePhase)}`}></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            Credit YoY: {data.creditGrowthYoY !== null ? `${data.creditGrowthYoY >= 0 ? '+' : ''}${data.creditGrowthYoY}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            HY & IG Spreads (5 Years)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Line type="monotone" dataKey="hy_spread" name="HY Spread" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="ig_spread" name="IG Spread (Baa-10Y)" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Bank Lending Standards (SLOOS)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="lending_standards" name="Net % Tightening" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-white/40 mt-3 px-1">Positive = tightening standards (credit headwind). Negative = easing (credit tailwind). Source: Federal Reserve SLOOS C&I Loans.</p>
        </div>
      </div>

      {/* Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Info className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Credit Cycle Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The Credit Cycle is currently in the <strong>{data.cyclePhase}</strong> phase.
              {' '}HY spreads at <strong>{hySpread !== null ? `${hySpread.toFixed(2)}%` : 'N/A'}</strong> reflect{' '}
              {hySpread !== null && hySpread < 300 ? 'tight credit conditions — markets pricing in benign default risk.' : hySpread !== null && hySpread > 500 ? 'significant stress — elevated default risk and potential liquidity pressure.' : 'moderately elevated default expectations.'}
              {' '}Bank lending standards at <strong>{data.lendingStandards !== null ? `${data.lendingStandards.toFixed(1)}%` : 'N/A'}</strong> net tightening indicate{' '}
              {data.lendingStandards !== null && data.lendingStandards > 20 ? 'a significant reduction in credit availability — historically a leading indicator of corporate distress.' : data.lendingStandards !== null && data.lendingStandards < 0 ? 'loosening credit conditions — supportive for leveraged borrowers and risk appetite.' : 'neutral lending conditions.'}
              {' '}Business credit growth YoY: <strong>{data.creditGrowthYoY !== null ? `${data.creditGrowthYoY >= 0 ? '+' : ''}${data.creditGrowthYoY}%` : 'N/A'}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
