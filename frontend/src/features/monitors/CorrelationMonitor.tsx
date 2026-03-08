import { useEffect, useState } from 'react';
import { Layers, Info, RefreshCw, AlertTriangle } from 'lucide-react';

type WindowKey = '3M' | '5Y' | 'ALL';

interface CorrelationData {
  assets: { key: string; label: string }[];
  matrices: Record<WindowKey, Record<string, Record<string, number>>>;
  stockBondCorrs: Record<WindowKey, number>;
  regime: string;
  windowMeta: Record<WindowKey, { label: string; cadence: string; observations: number }>;
}

const WINDOW_ORDER: WindowKey[] = ['3M', '5Y', 'ALL'];

function getRegimeStyle(regime: string) {
  if (regime.includes('Negative')) return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  if (regime.includes('Positive')) return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
  return 'text-slate-200 bg-slate-500/10 border-slate-500/20';
}

function getStockBondTone(value: number) {
  if (value <= -0.2) return 'text-emerald-300';
  if (value >= 0.2) return 'text-rose-300';
  return 'text-amber-200';
}

function getWindowBlurb(windowKey: WindowKey) {
  if (windowKey === '3M') return 'Short-term market regime';
  if (windowKey === '5Y') return 'Medium-term macro relationship';
  return 'Longest available relationship';
}

function cellStyle(value: number, isDiagonal: boolean) {
  if (isDiagonal) {
    return {
      backgroundColor: 'rgba(148,163,184,0.16)',
      color: 'rgba(241,245,249,0.92)',
      border: '1px solid rgba(148,163,184,0.14)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    };
  }

  const strength = Math.min(1, Math.abs(value));
  if (value >= 0.6) {
    return {
      backgroundColor: `rgba(16,185,129,${0.22 + strength * 0.28})`,
      color: '#ecfdf5',
      border: '1px solid rgba(52,211,153,0.28)',
      boxShadow: '0 0 0 1px rgba(16,185,129,0.06) inset',
    };
  }
  if (value >= 0.3) {
    return {
      backgroundColor: `rgba(16,185,129,${0.12 + strength * 0.18})`,
      color: '#d1fae5',
      border: '1px solid rgba(52,211,153,0.18)',
      boxShadow: '0 0 0 1px rgba(16,185,129,0.04) inset',
    };
  }
  if (value <= -0.6) {
    return {
      backgroundColor: `rgba(239,68,68,${0.22 + strength * 0.28})`,
      color: '#fff1f2',
      border: '1px solid rgba(248,113,113,0.28)',
      boxShadow: '0 0 0 1px rgba(239,68,68,0.06) inset',
    };
  }
  if (value <= -0.3) {
    return {
      backgroundColor: `rgba(239,68,68,${0.12 + strength * 0.18})`,
      color: '#ffe4e6',
      border: '1px solid rgba(248,113,113,0.18)',
      boxShadow: '0 0 0 1px rgba(239,68,68,0.04) inset',
    };
  }

  return {
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'rgba(241,245,249,0.88)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  };
}

function HeatmapCard({
  windowKey,
  assets,
  matrix,
  meta,
  stockBondCorr,
}: {
  windowKey: WindowKey;
  assets: { key: string; label: string }[];
  matrix: Record<string, Record<string, number>>;
  meta: { label: string; cadence: string; observations: number };
  stockBondCorr: number;
}) {
  return (
    <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-5 border-b border-white/6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-300" />
              Correlation Heatmap — {meta.label}
            </h3>
            <p className="text-[11px] text-white/70 mt-1">{meta.cadence} · {meta.observations} observations</p>
          </div>
          <div className={`text-sm font-mono ${getStockBondTone(stockBondCorr)}`}>
            S/B {stockBondCorr >= 0 ? '+' : ''}{stockBondCorr.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-5">
        <table className="w-full border-separate border-spacing-y-2 border-spacing-x-2 min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left text-[10px] text-white/60 uppercase tracking-[0.18em] pb-2 pr-2 w-32" />
              {assets.map(asset => (
                <th key={asset.key} className="text-center text-[10px] text-white/80 uppercase tracking-[0.18em] pb-2 px-2 min-w-[104px]">
                  {asset.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map(rowAsset => (
              <tr key={rowAsset.key}>
                <td className="text-xs font-semibold text-white/85 py-1 pr-2 whitespace-nowrap">{rowAsset.label}</td>
                {assets.map(colAsset => {
                  const value = matrix?.[rowAsset.key]?.[colAsset.key] ?? 0;
                  const isDiagonal = rowAsset.key === colAsset.key;
                  return (
                    <td key={colAsset.key} className="px-0.5 py-0.5 text-center">
                      <div
                        className="rounded-xl py-3 px-2 text-[13px] font-mono font-semibold"
                        style={cellStyle(value, isDiagonal)}
                      >
                        {isDiagonal ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pb-5">
        <p className="text-[11px] text-white/62">{getWindowBlurb(windowKey)}</p>
      </div>
    </div>
  );
}

export function CorrelationMonitor() {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/correlations')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/60">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Computing correlation matrix...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-300">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load correlation data. Try syncing FRED data.</span>
    </div>
  );

  const { assets, matrices, stockBondCorrs, regime, windowMeta } = data;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Cross-Asset Correlation
        </h3>
        <p className="text-xs text-white/70 leading-relaxed">
          Pearson correlation of returns across 5 assets: <strong>S&amp;P 500</strong>, <strong>10Y Treasury</strong> (yield converted to price-direction returns), <strong>Gold</strong>, <strong>Oil (WTI)</strong>, and <strong>US Dollar (DXY)</strong>. <strong>3M</strong> uses daily returns for the current market regime. <strong>5Y</strong> and <strong>All</strong> use monthly returns so the monitor can show the longest reliable history available in the database.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-5 xl:col-span-1 ${getRegimeStyle(regime)}`}>
          <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">Cross-Asset Regime</div>
          <div className="text-xl font-bold">{regime}</div>
          <p className="text-[11px] opacity-80 mt-3">Driven by the short-term stock-bond relationship in the 3M matrix.</p>
        </div>

        {WINDOW_ORDER.map(windowKey => {
          const corr = stockBondCorrs[windowKey];
          return (
            <div key={windowKey} className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
              <div className="text-xs font-medium text-white/70 uppercase tracking-wider mb-2">Stock-Bond Corr. ({windowMeta[windowKey].label})</div>
              <div className={`text-3xl font-light font-mono ${getStockBondTone(corr)}`}>
                {corr >= 0 ? '+' : ''}{corr.toFixed(2)}
              </div>
              <p className="text-[10px] text-white/60 mt-2">{getWindowBlurb(windowKey)}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-6">
        <HeatmapCard
          windowKey="3M"
          assets={assets}
          matrix={matrices['3M']}
          meta={windowMeta['3M']}
          stockBondCorr={stockBondCorrs['3M']}
        />

        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
          <HeatmapCard
            windowKey="5Y"
            assets={assets}
            matrix={matrices['5Y']}
            meta={windowMeta['5Y']}
            stockBondCorr={stockBondCorrs['5Y']}
          />
          <HeatmapCard
            windowKey="ALL"
            assets={assets}
            matrix={matrices['ALL']}
            meta={windowMeta['ALL']}
            stockBondCorr={stockBondCorrs['ALL']}
          />
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm font-medium text-white mb-4">Reading The Map</h3>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[11px] text-white/70 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.42)', border: '1px solid rgba(248,113,113,0.28)' }} />
            <span>Strong negative</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }} />
            <span>Near zero / weak relationship</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: 'rgba(16,185,129,0.42)', border: '1px solid rgba(52,211,153,0.28)' }} />
            <span>Strong positive</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/70 leading-relaxed">
          <div className="space-y-3">
            <div>
              <strong className="text-emerald-300">Stocks vs Bonds negative:</strong> classic hedge regime where Treasuries diversify equity drawdowns.
            </div>
            <div>
              <strong className="text-sky-300">Gold vs Dollar negative:</strong> the usual safe-haven/risk-on pattern.
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <strong className="text-rose-300">Stocks vs Bonds positive:</strong> inflation or stress regime where traditional 60/40 protection weakens.
            </div>
            <div>
              <strong className="text-amber-200">3M vs 5Y vs All:</strong> use 3M for the live regime, 5Y for the post-2020 environment, and All for the structural baseline.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
