import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';
import { Activity, Cpu, RefreshCw, AlertTriangle, Globe, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Bridgewater 4-quadrant regime configuration
const REGIME_CONFIG: Record<number, {
  name: string;
  color: string;
  bg: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  description: string;
  assets: { equities: string; bonds: string; commodities: string; cash: string };
}> = {
  0: {
    name: 'Goldilocks',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.15)',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
    borderClass: 'border-emerald-500/30',
    description: 'Growth accelerating, inflation falling',
    assets: { equities: 'Overweight', bonds: 'Neutral', commodities: 'Underweight', cash: 'Underweight' }
  },
  1: {
    name: 'Reflation',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/20',
    borderClass: 'border-sky-500/30',
    description: 'Growth accelerating, inflation rising',
    assets: { equities: 'Neutral', bonds: 'Underweight', commodities: 'Overweight', cash: 'Underweight' }
  },
  2: {
    name: 'Stagflation',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.15)',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
    borderClass: 'border-orange-500/30',
    description: 'Growth decelerating, inflation rising',
    assets: { equities: 'Underweight', bonds: 'Underweight', commodities: 'Overweight', cash: 'Neutral' }
  },
  3: {
    name: 'Deflation',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/30',
    description: 'Growth decelerating, inflation falling',
    assets: { equities: 'Underweight', bonds: 'Overweight', commodities: 'Underweight', cash: 'Overweight' }
  },
};

interface RegimePoint {
  date: string;
  regime: number;
  regimeName: string;
  growthSignal: number;
  inflationYoY: number;
  confidence: number;
}

interface RegimeData {
  currentRegime: number;
  regimeName: string;
  description: string;
  assets: { equities: string; bonds: string; commodities: string; cash: string };
  growthSignal: number | null;
  inflationYoY: number | null;
  confidence: number | null;
  history: RegimePoint[];
}

function getAssetColor(posture: string): string {
  if (posture === 'Overweight') return 'text-emerald-400';
  if (posture === 'Underweight') return 'text-rose-400';
  return 'text-amber-400';
}

export function RegimeModel() {
  const [data, setData] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/models/macro-regime')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  // Compute reference areas for regime background coloring
  const referenceAreas = useMemo(() => {
    if (!data?.history?.length) return [];
    const areas: { start: string; end: string; regime: number; color: string }[] = [];
    let startIdx = 0;
    const h = data.history;
    for (let i = 1; i < h.length; i++) {
      if (h[i].regime !== h[i - 1].regime || i === h.length - 1) {
        areas.push({
          start: h[startIdx].date.substring(0, 7),
          end: h[i].date.substring(0, 7),
          regime: h[startIdx].regime,
          color: REGIME_CONFIG[h[startIdx].regime].bg,
        });
        startIdx = i;
      }
    }
    return areas;
  }, [data]);

  // Build regime probability from recent 12-month window
  const regimeProbabilities = useMemo(() => {
    if (!data?.history?.length) return [];
    const recent = data.history.slice(-12);
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const pt of recent) counts[pt.regime]++;
    return [0, 1, 2, 3].map(r => ({
      regime: r,
      prob: counts[r] / recent.length,
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Computing macro regime...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load regime model. Try syncing FRED data.</span>
      </div>
    );
  }

  const currentConfig = REGIME_CONFIG[data.currentRegime];
  const chartData = data.history.map(pt => ({
    displayDate: pt.date.substring(0, 7),
    inflationYoY: pt.inflationYoY,
    growthSignal: pt.growthSignal,
    regime: pt.regime,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400" /> Methodology (Bridgewater 4-Quadrant Framework)</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Based on Ray Dalio / Bridgewater's research: almost all asset returns can be explained by growth and inflation conditions relative to expectations. <strong>Growth axis</strong>: CFNAI (Chicago Fed National Activity Index) — above 0 = accelerating, below 0 = decelerating. <strong>Inflation axis</strong>: CPI YoY% — above 2.5% = rising, below 2.5% = falling. Confidence reflects the strength of both signals. Regime is updated monthly.
        </p>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f0f0f] p-5 rounded-xl border border-white/10 shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white/70" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Macro Regime Model
                <span className="text-xs font-mono px-2 py-0.5 bg-white/10 text-white/50 rounded border border-white/10">Bridgewater</span>
              </h2>
              <p className="text-xs text-white/40">4-Quadrant Growth × Inflation Framework</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Active Regime</span>
            <span className={cn('text-lg font-bold', currentConfig.textClass)}>{data.regimeName}</span>
            <span className="text-[10px] text-white/40 mt-0.5">{data.description}</span>
          </div>
          <div className="h-10 w-px bg-white/10"></div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Confidence</span>
            <div className={cn('px-3 py-1 rounded-md text-sm font-semibold border', currentConfig.bgClass, currentConfig.textClass, currentConfig.borderClass)}>
              {data.confidence !== null ? `${data.confidence}%` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Signals row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Growth Signal (CFNAI)</div>
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-mono font-light', data.growthSignal !== null && data.growthSignal >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {data.growthSignal !== null ? `${data.growthSignal >= 0 ? '+' : ''}${data.growthSignal.toFixed(2)}` : 'N/A'}
            </span>
            {data.growthSignal !== null && (data.growthSignal >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />)}
          </div>
          <p className="text-[10px] text-white/30 mt-1">{data.growthSignal !== null && data.growthSignal >= 0 ? 'Accelerating (>0)' : 'Decelerating (<0)'}</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Inflation (CPI YoY)</div>
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-mono font-light', data.inflationYoY !== null && data.inflationYoY >= 2.5 ? 'text-amber-400' : 'text-emerald-400')}>
              {data.inflationYoY !== null ? `${data.inflationYoY.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          <p className="text-[10px] text-white/30 mt-1">{data.inflationYoY !== null && data.inflationYoY >= 2.5 ? 'Rising (>2.5%)' : 'Falling (<2.5%)'}</p>
        </div>

        {/* Asset allocation */}
        {(['equities', 'bonds'] as const).map(asset => (
          <div key={asset} className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{asset.charAt(0).toUpperCase() + asset.slice(1)}</div>
            <div className={cn('text-lg font-semibold', getAssetColor(data.assets[asset]))}>{data.assets[asset]}</div>
            <p className="text-[10px] text-white/30 mt-1">Regime allocation signal</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Regime History Chart */}
        <div className="flex-1 bg-[#0f0f0f] rounded-xl border border-white/10 p-5 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              Regime History — CPI YoY % (10 Years)
            </h3>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              {[0, 1, 2, 3].map(r => (
                <div key={r} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REGIME_CONFIG[r].color }}></div>
                  <span className="text-white/60">{REGIME_CONFIG[r].name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorInflation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="displayDate" stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} tickMargin={10} minTickGap={40} />
                <YAxis domain={['auto', 'auto']} stroke="rgba(255,255,255,0.4)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#141414', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'inflationYoY') return [`${value.toFixed(1)}%`, 'CPI YoY'];
                    return [value, name];
                  }}
                />
                {referenceAreas.map((area, idx) => (
                  <ReferenceArea key={idx} x1={area.start} x2={area.end} fill={area.color} fillOpacity={1} strokeOpacity={0} />
                ))}
                <Area type="monotone" dataKey="inflationYoY" name="inflationYoY" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorInflation)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-4">
          {/* Regime Probabilities (12-month frequency) */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-white/40" />
              Regime Frequency (12M)
            </h3>
            <div className="flex flex-col gap-3">
              {regimeProbabilities.map(item => {
                const config = REGIME_CONFIG[item.regime];
                const isCurrent = data.currentRegime === item.regime;
                return (
                  <div key={item.regime} className={cn('p-3 rounded-lg border transition-colors', isCurrent ? config.bgClass + ' ' + config.borderClass : 'bg-[#141414] border-white/5')}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn('text-xs font-medium', isCurrent ? config.textClass : 'text-white/60')}>{config.name}</span>
                      <span className={cn('text-xs font-mono', isCurrent ? config.textClass : 'text-white/40')}>{(item.prob * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${item.prob * 100}%`, backgroundColor: config.color, opacity: isCurrent ? 1 : 0.4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Asset Allocation Matrix */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 flex-1">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              Asset Allocation Signal
            </h3>
            <div className="space-y-3">
              {(['equities', 'bonds', 'commodities', 'cash'] as const).map(asset => (
                <div key={asset} className="flex justify-between items-center">
                  <span className="text-xs text-white/60 capitalize">{asset}</span>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', getAssetColor(data.assets[asset]), data.assets[asset] === 'Overweight' ? 'bg-emerald-500/10' : data.assets[asset] === 'Underweight' ? 'bg-rose-500/10' : 'bg-amber-500/10')}>
                    {data.assets[asset]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-[10px] text-white/40 leading-relaxed">
                Based on empirical Bridgewater research. Each quadrant systematically advantages different asset classes. Use as a directional tilt, not a binary switch.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
