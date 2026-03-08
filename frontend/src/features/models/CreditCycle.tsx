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
  AlertTriangle,
  Zap
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
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

interface CreditCycleData {
  hySpread: number | null;
  igOAS: number | null;
  lendingStandards: number | null;
  creditGrowthYoY: number | null;
  creditImpulse: number | null;
  consumerCreditImpulse: number | null;
  hyPercentile: number | null;
  sloosPercentile: number | null;
  cyclePhase: string;
  spreadChangePct: number | null;
  history: { date: string; hy_spread: number | null; ig_spread: number | null; lending_standards: number | null }[];
  impulseHistory: { date: string; creditImpulse: number | null; consumerImpulse: number | null }[];
}

function getPhaseStyle(phase: string): string {
  if (phase.includes('Stress') || phase.includes('Late')) return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  if (phase.includes('Tightening') || phase.includes('Turning')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  if (phase.includes('Expansion')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
}

function getPhaseDot(phase: string): string {
  if (phase.includes('Stress') || phase.includes('Late')) return 'bg-rose-500';
  if (phase.includes('Tightening') || phase.includes('Turning')) return 'bg-amber-500';
  if (phase.includes('Expansion')) return 'bg-emerald-500';
  return 'bg-blue-500';
}

function PercentileBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const color = value >= 70 ? 'text-rose-400 bg-rose-500/10' : value <= 30 ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/40 bg-white/5';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {value}th pct
    </span>
  );
}

export function CreditCycle() {
  const [data, setData] = useState<CreditCycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

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

  const filteredHistory = filterHistoryByRange(data.history, range);
  const filteredImpulseHistory = filterHistoryByRange(data.impulseHistory ?? [], range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const impulseCoverage = getHistoryCoverageLabel(data.impulseHistory ?? []);
  const chartData = filteredHistory.map(h => ({
    date: h.date,
    hy_spread: h.hy_spread,
    ig_spread: h.ig_spread,
    lending_standards: h.lending_standards,
  }));

  const impulseChartData = filteredImpulseHistory.map(h => ({
    date: h.date,
    creditImpulse: h.creditImpulse,
    consumerImpulse: h.consumerImpulse,
  }));
  const tickFormatter = getHistoryTickFormatter(range);

  const hySpread = data.hySpread;
  const spreadChange = data.spreadChangePct;
  const hyColor = spreadChange !== null ? (spreadChange > 0 ? 'text-rose-400' : 'text-emerald-400') : 'text-white/50';
  const impulse = data.creditImpulse;
  const impulseColor = impulse !== null ? (impulse > 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-white/50';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Credit Cycle model tracks four pillars: <strong>HY OAS</strong> (BAMLH0A0HYM2) measures risk appetite in speculative-grade credit; <strong>IG OAS</strong> (BAMLC0A0CM, ICE BofA) captures investment-grade conditions; <strong>SLOOS Lending Standards</strong> (DRTSCILM) is the Fed's Senior Loan Officer Survey on C&I loans; and <strong>Credit Impulse</strong> — the second derivative of credit growth (acceleration/deceleration), which leads GDP by 6–12 months. Cycle phase is determined by 5-year percentile ranks of HY spreads and lending standards, not static thresholds.
        </p>
      </div>

      {/* Header Stats — Row 1 */}
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
          <div className="flex items-center gap-2 mt-2">
            <p className="text-[10px] text-white/30">FRED: BAMLH0A0HYM2</p>
            <PercentileBadge value={data.hyPercentile ?? null} />
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">IG OAS (ICE BofA)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {data.igOAS !== null ? `${data.igOAS.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">FRED: BAMLC0A0CM | Investment-grade OAS</p>
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
          <div className="flex items-center gap-2 mt-2">
            <p className="text-[10px] text-white/30">Net % Tightening (SLOOS C&I)</p>
            <PercentileBadge value={data.sloosPercentile ?? null} />
          </div>
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

      {/* Credit Impulse Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-violet-400" />
            <div className="text-xs font-medium text-white/40 uppercase tracking-wider">Business Credit Impulse</div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${impulseColor}`}>
              {impulse !== null ? `${impulse > 0 ? '+' : ''}${impulse.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            2nd derivative of credit growth — leads GDP by 6–12 months.{' '}
            {impulse !== null ? (impulse > 0 ? 'Positive: credit accelerating (growth tailwind).' : 'Negative: credit decelerating (growth headwind).') : ''}
          </p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-sky-400" />
            <div className="text-xs font-medium text-white/40 uppercase tracking-wider">Consumer Credit Impulse</div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${data.consumerCreditImpulse !== null ? (data.consumerCreditImpulse > 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-white/50'}`}>
              {data.consumerCreditImpulse !== null ? `${data.consumerCreditImpulse > 0 ? '+' : ''}${data.consumerCreditImpulse.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            Acceleration of TOTALSL credit growth (annualised). Leads household spending and consumer confidence.
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
              <Activity className="w-4 h-4 text-blue-400" />
              HY & IG Spreads
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Line type="monotone" dataKey="hy_spread" name="HY OAS" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="ig_spread" name="IG OAS" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Bank Lending Standards (SLOOS)
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="lending_standards" name="Net % Tightening" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-white/40 mt-3 px-1">Positive = tightening (headwind). Negative = easing (tailwind). Source: Federal Reserve SLOOS C&I Loans.</p>
        </div>
      </div>

      {/* Credit Impulse Chart */}
      {impulseChartData.length > 0 && (
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-400" />
              Credit Impulse History
            </h3>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{impulseCoverage}</span>
          </div>
          <p className="text-[10px] text-white/40 mb-4">Annualised monthly acceleration of business (violet) and consumer (sky) credit growth. Positive bars = credit accelerating (growth tailwind 6–12M ahead). Negative = headwind.</p>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={impulseChartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ fontSize: '12px' }} />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '12px' }} />
                <Bar dataKey="creditImpulse" name="Business Credit Impulse" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="consumerImpulse" name="Consumer Credit Impulse" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
              {' '}HY OAS at <strong>{hySpread !== null ? `${hySpread.toFixed(2)}bps` : 'N/A'}</strong>
              {data.hyPercentile !== null ? ` (${data.hyPercentile}th percentile of last 5 years)` : ''} reflects{' '}
              {hySpread !== null && hySpread < 300 ? 'tight credit conditions — markets pricing in benign default risk.' : hySpread !== null && hySpread > 500 ? 'significant stress — elevated default risk.' : 'moderately elevated default expectations.'}
              {' '}The business credit impulse of <strong>{impulse !== null ? `${impulse > 0 ? '+' : ''}${impulse.toFixed(2)}%` : 'N/A'}</strong> is a leading signal:{' '}
              {impulse !== null ? (impulse > 0 ? 'credit is accelerating, suggesting economic tailwinds 6–12 months out.' : 'credit is decelerating, a headwind for growth 6–12 months ahead.') : ''}
              {' '}Bank lending standards: <strong>{data.lendingStandards !== null ? `${data.lendingStandards.toFixed(1)}%` : 'N/A'}</strong> net tightening
              {data.sloosPercentile !== null ? ` (${data.sloosPercentile}th percentile)` : ''}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
