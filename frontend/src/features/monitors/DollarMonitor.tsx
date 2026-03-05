import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Globe, Info, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface DollarData {
  current: {
    dxy: number | null;
    rank52w: number | null;
    r3m: number | null;
    r6m: number | null;
    r12m: number | null;
    usdEur: number | null;
    regime: string;
  };
  correlations: { sp500: number | null; gold: number | null };
  history: { date: string; dxy: number | null }[];
}

function getRegimeStyle(regime: string) {
  if (regime === 'Trending Stronger') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (regime === 'Trending Weaker') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
}

function CorrBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.abs(value) * 100);
  const pos = value >= 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className={`font-mono font-medium ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
          {pos ? '+' : ''}{value.toFixed(2)}
        </span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pos ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${pct}%`, marginLeft: pos ? '50%' : `${50 - pct / 2}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-white/20">
        <span>-1.0</span><span>0</span><span>+1.0</span>
      </div>
    </div>
  );
}

export function DollarMonitor() {
  const [data, setData] = useState<DollarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/dollar')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading dollar monitor...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load dollar data. Try syncing FRED data.</span>
    </div>
  );

  const { current, correlations, history } = data;

  const chartData = history.filter((_, i) => i % 3 === 0).map(h => ({
    date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    DXY: h.dxy,
  }));

  const rankColor = current.rank52w === null ? 'text-white/40'
    : current.rank52w >= 75 ? 'text-emerald-400'
    : current.rank52w <= 25 ? 'text-rose-400'
    : 'text-amber-400';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Dollar Strength Monitor
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Tracks the US Dollar Index (DXY / DTWEXBGS) and USD/EUR (DEXUSEU). The <strong>52-Week Percentile Rank</strong> measures where the current level sits relative to the past year (≥75% = Trending Stronger; ≤25% = Trending Weaker). <strong>60-Day Pearson Correlations</strong> to SP500 and Gold capture the prevailing macro regime: a negative DXY/SP500 correlation is typical (risk-on = weak dollar); if positive, it signals an inflationary or flight-to-safety episode.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">DXY Level</div>
          <div className="text-3xl font-light font-mono text-white">
            {current.dxy !== null ? current.dxy.toFixed(2) : 'N/A'}
          </div>
          <div className={`inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-0.5 rounded border ${getRegimeStyle(current.regime)}`}>
            {current.regime}
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">52-Week Percentile</div>
          <div className={`text-3xl font-light font-mono ${rankColor}`}>
            {current.rank52w !== null ? `${current.rank52w}%` : 'N/A'}
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden">
            <div className={`h-full rounded-full ${rankColor.replace('text-', 'bg-')}`} style={{ width: `${current.rank52w ?? 0}%` }} />
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">USD/EUR</div>
          <div className="text-3xl font-light font-mono text-sky-400">
            {current.usdEur !== null ? current.usdEur.toFixed(4) : 'N/A'}
          </div>
          <p className="text-[10px] text-white/30 mt-2">USD per EUR (DEXUSEU)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Returns</div>
          <div className="space-y-1.5 mt-1">
            {[{ l: '3M', v: current.r3m }, { l: '6M', v: current.r6m }, { l: '12M', v: current.r12m }].map(({ l, v }) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-[10px] text-white/30">{l}</span>
                {v !== null ? (
                  <div className={`flex items-center gap-1 text-xs font-mono ${v >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {v >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {v >= 0 ? '+' : ''}{v.toFixed(1)}%
                  </div>
                ) : <span className="text-white/30 text-xs">N/A</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DXY Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" /> DXY Index — 1 Year
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="dxyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="DXY" stroke="#38bdf8" strokeWidth={2} fill="url(#dxyGrad)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Correlations */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" /> 60-Day Rolling Correlations
          </h3>
          <div className="space-y-6 mt-4">
            <CorrBar value={correlations.sp500} label="DXY vs S&P 500 (typically negative = risk-on)" />
            <CorrBar value={correlations.gold} label="DXY vs Gold (typically negative = safe-haven)" />
          </div>
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-xs text-white/40 leading-relaxed">
              A <strong className="text-rose-400">positive DXY/SP500</strong> correlation is unusual and signals an inflation or flight-to-quality episode (2022 pattern). Negative is the typical risk-on regime where weaker dollar accompanies equity strength.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
