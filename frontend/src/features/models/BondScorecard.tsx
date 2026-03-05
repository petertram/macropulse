import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Landmark, Info, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface BondComponent {
  name: string;
  value: number | string | null;
  score: -1 | 0 | 1;
  description: string;
}

interface BondData {
  score: number;
  components: BondComponent[];
  current: {
    dgs10: number | null;
    realYield: number | null;
    breakeven: number | null;
    termPremium: number | null;
    curveDynamic: string;
  };
  history: { date: string; dgs10: number | null; realYield: number | null; breakeven: number | null }[];
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function ScoreChip({ score }: { score: -1 | 0 | 1 }) {
  const styles = {
    1: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    0: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    [-1]: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };
  const labels = { 1: '+1 Favorable', 0: '0 Neutral', [-1]: '-1 Unfavorable' };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${styles[score]}`}>
      {labels[score]}
    </span>
  );
}

export function BondScorecard() {
  const [data, setData] = useState<BondData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/bond-scorecard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Computing bond scorecard...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load bond scorecard. Try syncing FRED data.</span>
    </div>
  );

  const totalScore = data.score;
  const scoreColor = totalScore >= 3 ? 'text-emerald-400' : totalScore >= 1 ? 'text-green-400' : totalScore <= -3 ? 'text-rose-400' : totalScore <= -1 ? 'text-orange-400' : 'text-slate-400';
  const scoreLabel = totalScore >= 3 ? 'Bond-Friendly' : totalScore >= 1 ? 'Mildly Favorable' : totalScore <= -3 ? 'Bond-Hostile' : totalScore <= -1 ? 'Mildly Unfavorable' : 'Neutral';
  const scoreBg = totalScore >= 1 ? 'bg-emerald-500/10 border-emerald-500/20' : totalScore <= -1 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-500/10 border-slate-500/20';

  const chartData = data.history.map(h => ({
    date: formatDate(h.date),
    '10Y Yield': h.dgs10,
    'Real Yield (TIPS)': h.realYield,
    'Breakeven Inflation': h.breakeven,
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Bond Environment Scorecard
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Five components are scored −1 (bond-unfriendly) / 0 (neutral) / +1 (bond-friendly). <strong>Term Premium</strong> = 10Y − 3M spread (steep = favorable entry); <strong>Real Yield</strong> (TIPS 10Y, DFII10) above 2% = attractive; <strong>Breakeven Inflation</strong> (T10YIE) below 1.5% = deflationary tailwind; <strong>Curve Dynamic</strong> = Bull regimes score +1; <strong>Duration Risk</strong> = rising 10Y yields score −1. Total ranges −5 (very hostile) to +5 (very friendly).
        </p>
      </div>

      {/* Score Banner */}
      <div className={`rounded-2xl border p-6 flex items-center justify-between ${scoreBg}`}>
        <div>
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">Bond Environment Score</div>
          <div className={`text-5xl font-light font-mono ${scoreColor}`}>
            {totalScore >= 0 ? '+' : ''}{totalScore}
          </div>
          <div className={`text-sm font-semibold mt-1 ${scoreColor}`}>{scoreLabel}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right">
          <div>
            <div className="text-[10px] text-white/30 mb-1">10Y Yield</div>
            <div className="text-xl font-mono text-white">{data.current.dgs10 != null ? `${data.current.dgs10.toFixed(2)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">Real Yield</div>
            <div className="text-xl font-mono text-amber-400">{data.current.realYield != null ? `${data.current.realYield.toFixed(2)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">Breakeven</div>
            <div className="text-xl font-mono text-sky-400">{data.current.breakeven != null ? `${data.current.breakeven.toFixed(2)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">Curve</div>
            <div className="text-sm font-medium text-white">{data.current.curveDynamic}</div>
          </div>
        </div>
      </div>

      {/* Component Table */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Landmark className="w-4 h-4 text-indigo-400" /> Component Breakdown
          </h3>
        </div>
        <div className="divide-y divide-white/5">
          {data.components.map((c, i) => (
            <div key={i} className="px-5 py-4 flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-white mb-0.5">{c.name}</div>
                <div className="text-xs text-white/50">{c.description}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-sm font-mono text-white/70">
                  {c.value === null ? 'N/A' : typeof c.value === 'number' ? `${c.value.toFixed(2)}%` : c.value}
                </div>
                <ScoreChip score={c.score} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
          {data.current.dgs10 && data.current.realYield && data.current.dgs10 > data.current.realYield
            ? <TrendingUp className="w-4 h-4 text-amber-400" />
            : <TrendingDown className="w-4 h-4 text-sky-400" />}
          10Y Nominal, Real Yield & Breakeven Inflation (3 Years)
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
              <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(v: number) => [`${v?.toFixed(2)}%`]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
              <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
              <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.3} label={{ value: '2% target', fill: '#f59e0b66', fontSize: 10 }} />
              <Line type="monotone" dataKey="10Y Yield" stroke="#e2e8f0" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="Real Yield (TIPS)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="Breakeven Inflation" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
