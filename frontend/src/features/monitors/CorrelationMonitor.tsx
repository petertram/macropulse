import { useState, useEffect } from 'react';
import { Layers, Info, RefreshCw, AlertTriangle } from 'lucide-react';

type Window = '60D' | '6M' | '1Y';

interface CorrelationData {
  assets: { key: string; label: string }[];
  matrices: Record<Window, Record<string, Record<string, number>>>;
  stockBondCorr: number;
  regime: string;
}

function getRegimeStyle(regime: string) {
  if (regime.includes('Negative')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (regime.includes('Positive')) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
}

// Returns a tailwind-compatible inline style for heatmap cells
function cellStyle(value: number): { backgroundColor: string; color: string } {
  const abs = Math.abs(value);
  if (value === 1.0) return { backgroundColor: 'rgba(148,163,184,0.15)', color: '#94a3b8' };
  if (value > 0.6) return { backgroundColor: 'rgba(16,185,129,0.25)', color: '#34d399' };
  if (value > 0.3) return { backgroundColor: 'rgba(16,185,129,0.12)', color: '#6ee7b7' };
  if (value < -0.6) return { backgroundColor: 'rgba(239,68,68,0.25)', color: '#f87171' };
  if (value < -0.3) return { backgroundColor: 'rgba(239,68,68,0.12)', color: '#fca5a5' };
  return { backgroundColor: 'rgba(255,255,255,0.03)', color: `rgba(255,255,255,${0.3 + abs * 0.4})` };
}

export function CorrelationMonitor() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWindow, setActiveWindow] = useState<Window>('60D');

  useEffect(() => {
    fetch('/api/models/correlations')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Computing correlation matrix...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load correlation data. Try syncing FRED data.</span>
    </div>
  );

  const { assets, matrices, stockBondCorr, regime } = data;
  const matrix = matrices[activeWindow];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Cross-Asset Correlation
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Pearson correlation of daily returns across 5 assets: <strong>S&P 500</strong>, <strong>10Y Treasury</strong> (yield inverted = price direction), <strong>Gold</strong>, <strong>Oil (WTI)</strong>, <strong>US Dollar (DXY)</strong>. Windows: 60 trading days (~3 months), 6 months, 1 year. <strong>Key regime signal:</strong> Stock-Bond correlation — negative (classic hedge regime) vs. positive (2022-style inflation regime where stocks and bonds sell off together).
        </p>
      </div>

      {/* Regime Banner + Stock-Bond Signal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-xl border p-5 ${getRegimeStyle(regime)}`}>
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Cross-Asset Regime</div>
          <div className="text-xl font-bold">{regime}</div>
        </div>
        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
          <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Stock-Bond Correlation (60D)</div>
          <div className={`text-3xl font-light font-mono ${stockBondCorr >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {stockBondCorr >= 0 ? '+' : ''}{stockBondCorr.toFixed(2)}
          </div>
          <p className="text-[10px] text-white/30 mt-2">
            {stockBondCorr < -0.2 ? 'Negative — bonds acting as equity hedge (classic regime)' :
              stockBondCorr > 0.2 ? 'Positive — bonds and equities moving together (inflation/stress regime)' :
              'Near zero — transitional or decoupled'}
          </p>
        </div>
      </div>

      {/* Window Selector */}
      <div className="flex items-center gap-2">
        {(['60D', '6M', '1Y'] as Window[]).map(w => (
          <button
            key={w}
            onClick={() => setActiveWindow(w)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium border transition-colors ${activeWindow === w ? 'bg-white/10 border-white/20 text-white' : 'border-white/5 text-white/40 hover:text-white/70 hover:bg-white/5'}`}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Correlation Heatmap */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Correlation Heatmap — {activeWindow} Rolling Window
          </h3>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10px] text-white/30 uppercase tracking-wider pb-3 pr-4 w-36" />
                {assets.map(a => (
                  <th key={a.key} className="text-center text-[10px] text-white/40 uppercase tracking-wider pb-3 px-2 min-w-[90px]">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="space-y-1">
              {assets.map(rowAsset => (
                <tr key={rowAsset.key}>
                  <td className="text-xs font-medium text-white/60 py-2 pr-4 whitespace-nowrap">{rowAsset.label}</td>
                  {assets.map(colAsset => {
                    const value = matrix?.[rowAsset.key]?.[colAsset.key] ?? 0;
                    const style = cellStyle(value);
                    const isDiag = rowAsset.key === colAsset.key;
                    return (
                      <td key={colAsset.key} className="px-2 py-1.5 text-center">
                        <div
                          className="rounded-lg py-2 px-1 text-xs font-mono font-medium transition-colors"
                          style={style}
                        >
                          {isDiag ? '—' : (value >= 0 ? '+' : '') + value.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Color Legend */}
        <div className="px-5 pb-5">
          <div className="flex items-center gap-4 text-[10px] text-white/40">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.25)' }} />
              <span>Strong Negative (&lt; -0.6)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
              <span>Uncorrelated (−0.3 to +0.3)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.25)' }} />
              <span>Strong Positive (&gt; +0.6)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interpretation Guide */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-medium text-white mb-4">Regime Interpretation Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/60 leading-relaxed">
          <div className="space-y-3">
            <div>
              <strong className="text-emerald-400">Stocks (+) / Bonds (−):</strong> Classic risk-on regime. Equities rising, bonds acting as hedge. Traditional 60/40 portfolio benefits.
            </div>
            <div>
              <strong className="text-sky-400">Gold (−) / Dollar (−):</strong> Typically means risk-on, with USD weakness and gold selling off.
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <strong className="text-rose-400">Stocks (+) / Bonds (+):</strong> Inflation regime (2022). Both assets selling off together — traditional hedging breaks down, alternatives needed.
            </div>
            <div>
              <strong className="text-amber-400">Gold (+) / Stocks (−):</strong> Defensive/recession regime. Safe-haven demand for gold outperforms equities.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
