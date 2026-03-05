import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  TrendingDown,
  TrendingUp,
  Info,
  Activity,
  RefreshCw,
  AlertTriangle
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

interface YieldCurveData {
  currentCurve: { maturity: string; yield: number }[];
  spread10y2y: number | null;
  spread10y3m: number | null;
  curveDynamic: string;
  inversionDays: number;
  history: { date: string; spread: number }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getDynamicColor(dynamic: string): string {
  if (dynamic.includes('Bear')) return 'text-amber-400';
  if (dynamic.includes('Bull Steepening')) return 'text-emerald-400';
  if (dynamic.includes('Bull Flattening')) return 'text-blue-400';
  return 'text-white/60';
}

function getDynamicBg(dynamic: string): string {
  if (dynamic.includes('Bear')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  if (dynamic.includes('Bull Steepening')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  if (dynamic.includes('Bull Flattening')) return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
  return 'bg-white/5 border-white/10 text-white/60';
}

export function YieldCurve() {
  const [data, setData] = useState<YieldCurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/yield-curve')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading yield curve data...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load yield curve. Try syncing FRED data.</span>
      </div>
    );
  }

  const spread10y2y = data.spread10y2y;
  const spread10y3m = data.spread10y3m;
  const isInverted10y2y = spread10y2y !== null && spread10y2y < 0;
  const isInverted10y3m = spread10y3m !== null && spread10y3m < 0;

  const chartHistory = data.history.map(h => ({
    date: formatDate(h.date),
    spread: h.spread,
  }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Yield Curve model tracks the full term structure of US Treasuries using 8 live FRED series (DGS1M through DGS30). <strong>Inversions</strong> (short-term rates &gt; long-term rates) historically precede recessions by 6-18 months. The model also classifies curve dynamics: <strong>Bull Steepening</strong> (short rates falling faster — typically bullish for risk assets), <strong>Bear Steepening</strong> (long rates rising faster — inflation/term-premium driven), <strong>Bull Flattening</strong> (long rates falling faster), and <strong>Bear Flattening</strong> (short rates rising faster — Fed tightening).
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">10Y-2Y Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {spread10y2y !== null ? `${spread10y2y >= 0 ? '+' : ''}${spread10y2y.toFixed(2)}%` : 'N/A'}
            </div>
            <div className={`text-xs font-medium flex items-center ${isInverted10y2y ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isInverted10y2y ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
              {isInverted10y2y ? 'Inverted' : 'Normal'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">T10Y2Y — Primary spread</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">10Y-3M Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {spread10y3m !== null ? `${spread10y3m >= 0 ? '+' : ''}${spread10y3m.toFixed(2)}%` : 'N/A'}
            </div>
            <div className={`text-xs font-medium flex items-center ${isInverted10y3m ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isInverted10y3m ? <AlertTriangle className="w-3 h-3 mr-1" /> : null}
              {isInverted10y3m ? `${data.inversionDays}d Inverted` : 'Normal'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">T10Y3M — Estrella-Mishkin probit input</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Curve Regime</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 border text-sm font-bold uppercase tracking-widest rounded-lg ${getDynamicBg(data.curveDynamic)}`}>
              {data.curveDynamic}
            </div>
            <div className={`w-2 h-2 rounded-full animate-pulse ${data.curveDynamic.includes('Bear') ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">3-month rate change dynamics</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Current Treasury Yield Curve
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.currentCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="maturity" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Yield']} />
                <Line type="monotone" dataKey="yield" name="Yield" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0a0a0a' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
            10Y-2Y Spread History (5 Years)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartHistory}>
                <defs>
                  <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="date" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v.toFixed(2)}%`, '10Y-2Y Spread']} />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="spread" name="10Y-2Y Spread" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSpread)" dot={false} />
              </AreaChart>
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
            <h3 className="text-lg font-semibold text-white mb-2">Yield Curve Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The 10Y-2Y spread is currently <strong>{spread10y2y !== null ? `${spread10y2y >= 0 ? '+' : ''}${spread10y2y.toFixed(2)}%` : 'unavailable'}</strong>{isInverted10y2y ? ' (inverted)' : ''}. The 10Y-3M spread — the primary Estrella-Mishkin probit input — stands at <strong>{spread10y3m !== null ? `${spread10y3m >= 0 ? '+' : ''}${spread10y3m.toFixed(2)}%` : 'unavailable'}</strong>
              {isInverted10y3m ? ` and has been inverted for ${data.inversionDays} trading days` : ''}.{' '}
              The curve dynamic is currently <strong className={getDynamicColor(data.curveDynamic)}>{data.curveDynamic}</strong>.{' '}
              {data.curveDynamic === 'Bear Steepening' && 'Long-end yields rising faster than short-end, often driven by inflation persistence or increased term premium. Historically, steepening from deep inversion is the immediate precursor to economic contraction.'}
              {data.curveDynamic === 'Bull Steepening' && 'Short-term rates falling faster than long-term rates — typically signals the Fed beginning an easing cycle. Early stages are often bullish for risk assets.'}
              {data.curveDynamic === 'Bear Flattening' && 'Short-term rates rising faster than long-term rates — classic Fed tightening cycle pattern. Late-stage flattening often precedes inversion.'}
              {data.curveDynamic === 'Bull Flattening' && 'Long-term rates falling faster than short-term rates — markets pricing in growth slowdown or disinflation at the long end.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
