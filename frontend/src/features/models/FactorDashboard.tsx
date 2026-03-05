import { useState, useEffect } from 'react';
import { BarChart3, Info, RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface FactorResult {
  key: string;
  name: string;
  description: string;
  r1m: number | null;
  r3m: number | null;
  r12m: number | null;
  excess1m: number | null;
  excess3m: number | null;
  excess12m: number | null;
}

interface FactorData {
  factors: FactorResult[];
  benchmark: { key: string; name: string; r1m: number | null; r3m: number | null; r12m: number | null };
  regimeLeaders: Record<string, string[]>;
}

function ReturnCell({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-white/30 text-xs">N/A</span>;
  const isPos = value >= 0;
  return (
    <span className={`text-xs font-mono font-medium ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
      {isPos ? '+' : ''}{value.toFixed(1)}%{label ? ` ${label}` : ''}
    </span>
  );
}

function ExcessBar({ value }: { value: number | null }) {
  if (value === null) return <div className="w-full h-1.5 bg-white/5 rounded-full" />;
  const width = Math.min(100, Math.abs(value) * 5); // scale: 20% excess = full bar
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${value >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={{ width: `${width}%`, marginLeft: value < 0 ? `${50 - width / 2}%` : '50%' }}
      />
    </div>
  );
}

const REGIME_COLORS: Record<string, string> = {
  'Goldilocks': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Reflation': 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  'Stagflation': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  'Deflation': 'text-red-400 bg-red-500/10 border-red-500/20',
};

export function FactorDashboard() {
  const [data, setData] = useState<FactorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/factors')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading factor returns...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load factor dashboard. Yahoo Finance may be unavailable.</span>
      </div>
    );
  }

  const { factors, benchmark } = data;

  // Sort by 12m excess return descending
  const sorted = [...factors].sort((a, b) => (b.excess12m ?? -999) - (a.excess12m ?? -999));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Factor Investing & Macro Regime Alignment
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Factor returns are computed using liquid ETF proxies versus the SPY benchmark. <strong>Excess return</strong> = factor return − SPY return over the same period. Historical research (Fama-French, AQR, Bridgewater) shows systematic factor leadership by macro regime: Momentum and Growth lead in Goldilocks; Value and commodity-linked sectors in Reflation; Quality and Low-Vol in Stagflation/Deflation. Use the Macro Regime Model to identify the current quadrant and align factor tilts accordingly.
        </p>
      </div>

      {/* Benchmark */}
      <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Benchmark: {benchmark.name} (SPY)</span>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-[10px] text-white/30 mb-1">1M</div>
              <ReturnCell value={benchmark.r1m} />
            </div>
            <div className="text-center">
              <div className="text-[10px] text-white/30 mb-1">3M</div>
              <ReturnCell value={benchmark.r3m} />
            </div>
            <div className="text-center">
              <div className="text-[10px] text-white/30 mb-1">12M</div>
              <ReturnCell value={benchmark.r12m} />
            </div>
          </div>
        </div>
      </div>

      {/* Factor Table */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            Factor Performance vs Benchmark (sorted by 12M alpha)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">Factor</th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">1M Return</th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">3M Return</th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">12M Return</th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">1M Alpha</th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider">3M Alpha</th>
                <th className="px-4 py-3 text-[10px] font-medium text-white/40 uppercase tracking-wider w-36">12M Alpha</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f, i) => (
                <tr key={f.key} className={`border-b border-white/5 hover:bg-white/2 transition-colors ${i === 0 ? 'bg-emerald-500/5' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {f.excess12m !== null && f.excess12m > 0
                        ? <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-rose-400 shrink-0" />}
                      <div>
                        <div className="text-sm font-medium text-white">{f.name}</div>
                        <div className="text-[10px] text-white/30">{f.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right"><ReturnCell value={f.r1m} /></td>
                  <td className="px-4 py-4 text-right"><ReturnCell value={f.r3m} /></td>
                  <td className="px-4 py-4 text-right"><ReturnCell value={f.r12m} /></td>
                  <td className="px-4 py-4 text-right"><ReturnCell value={f.excess1m} /></td>
                  <td className="px-4 py-4 text-right"><ReturnCell value={f.excess3m} /></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <ReturnCell value={f.excess12m} />
                      <div className="flex-1 min-w-[60px]">
                        <ExcessBar value={f.excess12m} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regime-Factor Leadership Matrix */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          Regime–Factor Leadership Map
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(data.regimeLeaders).map(([regime, leaders]) => (
            <div key={regime} className={`p-4 rounded-xl border ${REGIME_COLORS[regime] ?? 'text-white/60 bg-white/5 border-white/10'}`}>
              <div className="text-xs font-bold uppercase tracking-wider mb-3">{regime}</div>
              <div className="space-y-2">
                {leaders.map(leader => (
                  <div key={leader} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0"></div>
                    <span className="text-xs font-medium">
                      {factors.find(f => f.key === leader)?.name ?? leader}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] opacity-60 mt-3 leading-relaxed">
                {regime === 'Goldilocks' && 'High returns drive momentum; growth stocks benefit from earnings expansion.'}
                {regime === 'Reflation' && 'Value and cyclicals benefit from rising earnings and commodity tailwinds.'}
                {regime === 'Stagflation' && 'Defensive quality and min-vol preserve capital as growth deteriorates.'}
                {regime === 'Deflation' && 'Quality balance sheets and low volatility outperform in risk-off environments.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
