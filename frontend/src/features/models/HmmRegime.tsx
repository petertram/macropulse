import React, { useState, useEffect } from 'react';
import {
  Info,
  RefreshCw,
  AlertTriangle,
  Cpu,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
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
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HmmIndicator {
  id: string;
  name: string;
  current: number;
  zScore: number;
  muExp: number;
  muCon: number;
  muStr: number;
}

interface HmmHistoryPoint {
  date: string;
  state: number;
  stateName: string;
  expansion: number;
  contraction: number;
  stress: number;
}

interface HmmData {
  currentState: number;
  stateName: string;
  stateColor: 'emerald' | 'amber' | 'rose';
  stateProbabilities: number[];
  stateNames: readonly string[];
  stateColors: readonly string[];
  transitionMatrix: number[][];
  history: HmmHistoryPoint[];
  indicators: HmmIndicator[];
  persistenceProbability: number;
  expectedDuration: number;
  streak: number;
  modelInfo: {
    observations: number;
    states: number;
    features: number;
    iterations: number;
    logLikelihood: number;
  };
  analysis: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const STATE_PALETTE = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400', fill: '#10b981' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   dot: 'bg-amber-400',   fill: '#f59e0b' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400',    dot: 'bg-rose-400',    fill: '#f43f5e' },
} as const;

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#0a0a0a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: 11,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function HmmRegime() {
  const [data, setData] = useState<HmmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/hmm-regime')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-sm">Fitting Baum-Welch HMM…</span>
        <span className="text-[11px] text-white/30">This may take a few seconds for EM convergence</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error ?? 'Failed to load HMM model. Sync FRED data first.'}</span>
      </div>
    );
  }

  const pal = STATE_PALETTE[data.stateColor];

  // Chart data — downsample to last 120 months (10 years) for readability
  const chartHistory = data.history.slice(-120).map(h => ({
    date: fmtDate(h.date),
    expansion:   Math.round(h.expansion   * 100),
    contraction: Math.round(h.contraction * 100),
    stress:      Math.round(h.stress      * 100),
    state: h.state,
  }));

  // Full history for Viterbi path chart
  const viterbiChart = data.history.slice(-120).map(h => ({
    date: fmtDate(h.date),
    state: h.state,
  }));

  // Indicator bar chart data — z-scores coloured by direction
  const indicatorChart = data.indicators.map(ind => ({
    name: ind.name,
    z: ind.zScore,
    current: ind.current,
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

      {/* ── Methodology ─────────────────────────────────────────────────────── */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          A <strong>Gaussian-mixture Hidden Markov Model (HMM)</strong> with K=3 latent states
          (Expansion · Contraction · Stress) and D=6 macro indicators: VIX, HY Credit Spread,
          2s10s Yield Curve, Unemployment Rate, St. Louis Financial Stress Index, and CFNAI.
          Each indicator is z-scored and sign-oriented so that positive values favour expansion.
          Parameters (initial distribution π, transition matrix A, emission means µ and
          variances σ²) are estimated by <strong>Baum-Welch EM</strong> (iterating the
          forward-backward E-step and closed-form M-step until |ΔlogL| &lt; 10⁻⁵ or 100 iterations).
          The <strong>Viterbi algorithm</strong> decodes the maximum-a-posteriori state sequence;
          the <strong>forward-backward algorithm</strong> produces soft posterior probabilities
          P(sₜ = k | x₁…xᵀ) used in the stacked area chart.
          States are post-hoc labelled by composite emission mean (higher = more expansion-like).
        </p>
      </div>

      {/* ── Current Regime Hero ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* State badge */}
        <div className={`bg-[#0f0f0f] rounded-2xl border ${pal.border} p-6`}>
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Current Regime</div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${pal.bg} ${pal.border} mb-3`}>
            <span className={`w-2 h-2 rounded-full ${pal.dot} animate-pulse`} />
            <span className={`text-xl font-bold ${pal.text} tracking-wide`}>{data.stateName}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-3xl font-light text-white font-mono">
              {fmtPct(data.stateProbabilities[data.currentState])}
            </span>
            <span className="text-xs text-white/40">posterior probability</span>
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            {data.streak} consecutive month{data.streak !== 1 ? 's' : ''} in current regime
          </p>
        </div>

        {/* Persistence & Duration */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Regime Dynamics</div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-white/50">Self-transition P({data.stateName}→{data.stateName})</span>
                <span className={`text-xs font-mono font-semibold ${pal.text}`}>
                  {fmtPct(data.persistenceProbability)}
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${pal.dot}`}
                  style={{ width: `${data.persistenceProbability * 100}%` }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-white/5">
              <div className="text-xs text-white/40 mb-1">Expected regime duration</div>
              <div className="text-2xl font-light text-white font-mono">
                {data.expectedDuration.toFixed(1)}
                <span className="text-sm text-white/40 ml-1">months</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-3">
            {data.modelInfo.iterations} EM iterations · logL = {data.modelInfo.logLikelihood.toFixed(0)}
          </p>
        </div>

        {/* Regime probability bars */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-4">State Probabilities</div>
          <div className="space-y-3">
            {data.stateNames.map((name, k) => {
              const color = data.stateColors[k] as keyof typeof STATE_PALETTE;
              const p = data.stateProbabilities[k];
              const pl = STATE_PALETTE[color];
              return (
                <div key={k}>
                  <div className="flex justify-between mb-1">
                    <span className={`text-xs font-medium ${k === data.currentState ? pl.text : 'text-white/50'}`}>
                      {name}
                    </span>
                    <span className={`text-xs font-mono ${k === data.currentState ? pl.text : 'text-white/30'}`}>
                      {fmtPct(p)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${p * 100}%`, backgroundColor: pl.fill }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-white/30 mt-4">
            {data.modelInfo.observations} monthly obs · {data.modelInfo.features} features
          </p>
        </div>
      </div>

      {/* ── Charts Row 1 ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Stacked posterior probabilities */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Regime Posterior Probabilities
          </h3>
          <p className="text-[10px] text-white/30 mb-5">
            Forward-backward soft assignments — last 10 years
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartHistory} stackOffset="expand">
                <defs>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="gCon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="gStr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="date" stroke="#333" fontSize={9} tickLine={false} axisLine={false}
                  interval={Math.floor(chartHistory.length / 8)} />
                <YAxis stroke="#333" fontSize={9} tickLine={false} axisLine={false}
                  tickFormatter={v => `${Math.round(v * 100)}%`} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [`${Math.round(v * 100)}%`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  formatter={(value) => <span style={{ color: '#888' }}>{value}</span>}
                />
                <Area type="monotone" dataKey="stress"      name="Stress"      stackId="1"
                  stroke="#f43f5e" fill="url(#gStr)" dot={false} />
                <Area type="monotone" dataKey="contraction" name="Contraction"  stackId="1"
                  stroke="#f59e0b" fill="url(#gCon)" dot={false} />
                <Area type="monotone" dataKey="expansion"   name="Expansion"    stackId="1"
                  stroke="#10b981" fill="url(#gExp)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Viterbi decoded path */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            Viterbi MAP State Sequence
          </h3>
          <p className="text-[10px] text-white/30 mb-5">
            Maximum-a-posteriori hard regime path — last 10 years
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={viterbiChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis dataKey="date" stroke="#333" fontSize={9} tickLine={false} axisLine={false}
                  interval={Math.floor(viterbiChart.length / 8)} />
                <YAxis
                  stroke="#333" fontSize={9} tickLine={false} axisLine={false}
                  domain={[-0.2, 2.2]} ticks={[0, 1, 2]}
                  tickFormatter={v => ['Exp', 'Con', 'Str'][v] ?? ''}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [['Expansion', 'Contraction', 'Stress'][v] ?? v, 'Regime']}
                />
                <ReferenceLine y={0.5} stroke="#10b981" strokeDasharray="2 4" strokeOpacity={0.3} />
                <ReferenceLine y={1.5} stroke="#f43f5e" strokeDasharray="2 4" strokeOpacity={0.3} />
                <Line
                  type="stepAfter"
                  dataKey="state"
                  name="Regime"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-white/40">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Expansion (0)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Contraction (1)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />Stress (2)</span>
          </div>
        </div>
      </div>

      {/* ── Charts Row 2 ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Transition Matrix */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Transition Matrix A
          </h3>
          <p className="text-[10px] text-white/30 mb-5">
            P(next state | current state) — rows are current, columns are next
          </p>
          <div className="overflow-hidden rounded-xl border border-white/5">
            {/* Header */}
            <div className="grid grid-cols-4 text-[10px] text-white/40 font-medium bg-white/3">
              <div className="p-3 border-b border-r border-white/5">From ↓ / To →</div>
              {data.stateNames.map((name, k) => (
                <div key={k} className={`p-3 border-b border-r border-white/5 text-center font-semibold ${STATE_PALETTE[data.stateColors[k] as keyof typeof STATE_PALETTE].text}`}>
                  {name}
                </div>
              ))}
            </div>
            {/* Rows */}
            {data.transitionMatrix.map((row, j) => {
              const fromColor = data.stateColors[j] as keyof typeof STATE_PALETTE;
              return (
                <div key={j} className="grid grid-cols-4">
                  <div className={`p-3 border-b border-r border-white/5 text-[10px] font-semibold ${STATE_PALETTE[fromColor].text}`}>
                    {data.stateNames[j]}
                  </div>
                  {row.map((v, k) => {
                    const intensity = Math.min(v, 1);
                    const isDiag = j === k;
                    const bgOpacity = isDiag ? intensity * 0.25 : intensity * 0.12;
                    const toColor = data.stateColors[k] as keyof typeof STATE_PALETTE;
                    return (
                      <div
                        key={k}
                        className={`p-3 border-b border-r border-white/5 text-center text-xs font-mono ${isDiag ? STATE_PALETTE[toColor].text : 'text-white/50'}`}
                        style={{ backgroundColor: `${STATE_PALETTE[toColor].fill}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}` }}
                      >
                        {fmtPct(v)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-white/30 mt-3">
            Diagonal = regime persistence probability
          </p>
        </div>

        {/* Indicator Z-Scores */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
            <Minus className="w-4 h-4 text-amber-400" />
            Indicator Z-Scores
          </h3>
          <p className="text-[10px] text-white/30 mb-5">
            Current standardised values — positive = expansion-favourable
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={indicatorChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" horizontal={false} />
                <XAxis type="number" stroke="#333" fontSize={9} tickLine={false} axisLine={false}
                  tickFormatter={v => v.toFixed(1)} domain={['dataMin - 0.2', 'dataMax + 0.2']} />
                <YAxis type="category" dataKey="name" stroke="#333" fontSize={10}
                  tickLine={false} axisLine={false} width={110} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [v.toFixed(2), 'Z-Score']}
                />
                <ReferenceLine x={0} stroke="#444" strokeWidth={1} />
                <Bar dataKey="z" name="Z-Score" radius={[0, 3, 3, 0]}>
                  {indicatorChart.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.z >= 0 ? '#10b981' : '#f43f5e'}
                      fillOpacity={0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {data.indicators.map(ind => (
              <div key={ind.id} className="flex items-center justify-between text-[10px] text-white/40">
                <span>{ind.name}</span>
                <span className={`font-mono ${ind.zScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ind.zScore >= 0 ? '+' : ''}{ind.zScore.toFixed(2)}σ
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── State Emission Profiles ───────────────────────────────────────────── */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-blue-400" />
          Learned Emission Profiles (µ per state in z-score space)
        </h3>
        <p className="text-[10px] text-white/30 mb-5">
          Mean indicator values learned by Baum-Welch EM for each regime
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-2 pr-4 text-white/40 font-medium">Indicator</th>
                {data.stateNames.map((name, k) => (
                  <th key={k} className={`text-center py-2 px-4 font-semibold ${STATE_PALETTE[data.stateColors[k] as keyof typeof STATE_PALETTE].text}`}>
                    {name}
                  </th>
                ))}
                <th className="text-center py-2 px-4 text-white/40 font-medium">Current</th>
              </tr>
            </thead>
            <tbody>
              {data.indicators.map(ind => (
                <tr key={ind.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="py-3 pr-4 text-white/70">{ind.name}</td>
                  {[ind.muExp, ind.muCon, ind.muStr].map((mu, k) => (
                    <td key={k} className="text-center py-3 px-4 font-mono">
                      <span className={mu >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}>
                        {mu >= 0 ? '+' : ''}{mu.toFixed(2)}
                      </span>
                    </td>
                  ))}
                  <td className={`text-center py-3 px-4 font-mono font-semibold ${ind.zScore >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {ind.zScore >= 0 ? '+' : ''}{ind.zScore.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Analysis Card ────────────────────────────────────────────────────── */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl shrink-0">
            <Info className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">HMM Regime Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl whitespace-pre-line">
              {data.analysis.replace(/\*\*(.*?)\*\*/g, '$1')}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="text-[10px] text-white/30 border border-white/5 rounded-md px-2 py-1">
                {data.modelInfo.observations} obs
              </div>
              <div className="text-[10px] text-white/30 border border-white/5 rounded-md px-2 py-1">
                K={data.modelInfo.states} states
              </div>
              <div className="text-[10px] text-white/30 border border-white/5 rounded-md px-2 py-1">
                {data.modelInfo.iterations} EM iterations
              </div>
              <div className="text-[10px] text-white/30 border border-white/5 rounded-md px-2 py-1">
                logL = {data.modelInfo.logLikelihood.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
