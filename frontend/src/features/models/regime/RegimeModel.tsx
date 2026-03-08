import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
  ScatterChart, Scatter, ReferenceLine, ZAxis
} from 'recharts';
import { Activity, Cpu, RefreshCw, AlertTriangle, Globe, TrendingUp, TrendingDown, Info, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { HistoryRangeTabs, useHistoryRange } from '../../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  CHART_REFERENCE_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
} from '../../../shared/utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

interface ScatterPoint { date: string; growthCoord: number; inflationCoord: number; regime: number }

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
  growthImpulse: number | null;
  inflationImpulse: number | null;
  regimeMomentum: 'Strengthening' | 'Established' | 'Shifting';
  regimeConsistency: number;
  growthCoord: number | null;
  inflationCoord: number | null;
  scatterTrail: ScatterPoint[];
  history: RegimePoint[];
}

function getAssetColor(posture: string): string {
  if (posture === 'Overweight') return 'text-emerald-400';
  if (posture === 'Underweight') return 'text-rose-400';
  return 'text-amber-400';
}

function getMomentumStyle(m: string) {
  if (m === 'Strengthening') return { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (m === 'Established') return { text: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
  return { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
}

function ImpulseArrow({ value }: { value: number | null }) {
  if (value === null) return <Minus className="w-3 h-3 text-white/30" />;
  if (value > 0.05) return <ArrowUp className="w-3 h-3 text-emerald-400" />;
  if (value < -0.05) return <ArrowDown className="w-3 h-3 text-rose-400" />;
  return <Minus className="w-3 h-3 text-white/40" />;
}

// Custom dot for scatter trail (faded for older, bright for latest)
function TrailDot(props: any) {
  const { cx, cy, payload, isLatest } = props;
  const config = REGIME_CONFIG[payload.regime] ?? REGIME_CONFIG[3];
  const opacity = isLatest ? 1 : 0.35;
  const r = isLatest ? 7 : 4;
  return <circle cx={cx} cy={cy} r={r} fill={config.color} fillOpacity={opacity} stroke="none" />;
}

export function RegimeModel() {
  const [data, setData] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/macro-regime')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const filteredHistory = useMemo(() => filterHistoryByRange(data?.history ?? [], range), [data, range]);
  const historyCoverage = useMemo(() => getHistoryCoverageLabel(data?.history ?? []), [data]);
  const tickFormatter = useMemo(() => getHistoryTickFormatter(range), [range]);

  const referenceAreas = useMemo(() => {
    if (!filteredHistory.length) return [];
    const areas: { start: string; end: string; regime: number; color: string }[] = [];
    let startIdx = 0;
    const h = filteredHistory;
    for (let i = 1; i < h.length; i++) {
      if (h[i].regime !== h[i - 1].regime || i === h.length - 1) {
        areas.push({
          start: h[startIdx].date,
          end: h[i].date,
          regime: h[startIdx].regime,
          color: REGIME_CONFIG[h[startIdx].regime].bg,
        });
        startIdx = i;
      }
    }
    return areas;
  }, [filteredHistory]);

  const regimeProbabilities = useMemo(() => {
    if (!data?.history?.length) return [];
    const recent = data.history.slice(-12);
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const pt of recent) counts[pt.regime]++;
    return [0, 1, 2, 3].map(r => ({ regime: r, prob: counts[r] / recent.length }));
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
  const momentumStyle = getMomentumStyle(data.regimeMomentum ?? 'Established');
  const chartData = filteredHistory.map(pt => ({
    date: pt.date,
    inflationYoY: pt.inflationYoY,
    growthSignal: pt.growthSignal,
    regime: pt.regime,
  }));

  // Scatter trail: all points + current
  const trail = (data.scatterTrail ?? []).map((pt, i, arr) => ({
    x: pt.growthCoord,
    y: pt.inflationCoord,
    regime: pt.regime,
    isLatest: i === arr.length - 1,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400" /> Methodology (Bridgewater 4-Quadrant Framework)</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Based on Ray Dalio / Bridgewater's research: almost all asset returns can be explained by growth and inflation conditions relative to expectations. <strong>Growth axis</strong>: CFNAI (Chicago Fed National Activity Index) — above 0 = accelerating. <strong>Inflation axis</strong>: CPI YoY% — above 2.5% = rising. <strong>Impulse arrows</strong> show 3-month momentum in each signal. <strong>Regime Momentum</strong> reflects whether the current regime is deepening or transitioning based on the last 6 months of regime history.
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
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Momentum</span>
            <div className={cn('px-3 py-1 rounded-md text-xs font-semibold border', momentumStyle.bg, momentumStyle.text)}>
              {data.regimeMomentum ?? 'Established'}
            </div>
            <span className="text-[10px] text-white/30">{data.regimeConsistency ?? 0}/6 months consistent</span>
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
          <div className="flex items-center gap-1.5 mt-1">
            <ImpulseArrow value={data.growthImpulse} />
            <p className="text-[10px] text-white/30">
              {data.growthImpulse !== null ? `3M Δ: ${data.growthImpulse > 0 ? '+' : ''}${data.growthImpulse.toFixed(2)}` : data.growthSignal !== null && data.growthSignal >= 0 ? 'Accelerating (>0)' : 'Decelerating (<0)'}
            </p>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Inflation (CPI YoY)</div>
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-mono font-light', data.inflationYoY !== null && data.inflationYoY >= 2.5 ? 'text-amber-400' : 'text-emerald-400')}>
              {data.inflationYoY !== null ? `${data.inflationYoY.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <ImpulseArrow value={data.inflationImpulse} />
            <p className="text-[10px] text-white/30">
              {data.inflationImpulse !== null ? `3M Δ: ${data.inflationImpulse > 0 ? '+' : ''}${data.inflationImpulse.toFixed(1)}%` : data.inflationYoY !== null && data.inflationYoY >= 2.5 ? 'Rising (>2.5%)' : 'Falling (<2.5%)'}
            </p>
          </div>
        </div>

        {(['equities', 'bonds'] as const).map(asset => (
          <div key={asset} className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{asset.charAt(0).toUpperCase() + asset.slice(1)}</div>
            <div className={cn('text-lg font-semibold', getAssetColor(data.assets[asset]))}>{data.assets[asset]}</div>
            <p className="text-[10px] text-white/30 mt-1">Regime allocation signal</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Regime History Chart */}
        <div className="flex-1 bg-[#0f0f0f] rounded-xl border border-white/10 p-5 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              Regime History — CPI YoY %
            </h3>
            <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
              <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
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
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickMargin={10} minTickGap={40} tickFormatter={tickFormatter} />
                <YAxis domain={['auto', 'auto']} stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
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
          {/* 2D Scatter — Regime Position */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
              <Globe className="w-4 h-4 text-white/40" />
              Current Position (12M Trail)
            </h3>
            <p className="text-[10px] text-white/30 mb-3">X = CFNAI (growth) · Y = CPI YoY − 2.5% (inflation). Dot = current.</p>
            <div className="h-[200px] w-full relative">
              {/* Quadrant labels */}
              <div className="absolute inset-0 pointer-events-none z-10">
                <div className="absolute top-1 left-2 text-[9px] text-emerald-400/60 font-medium">GOLDILOCKS</div>
                <div className="absolute top-1 right-2 text-[9px] text-sky-400/60 font-medium text-right">REFLATION</div>
                <div className="absolute bottom-1 left-2 text-[9px] text-red-400/60 font-medium">DEFLATION</div>
                <div className="absolute bottom-1 right-2 text-[9px] text-orange-400/60 font-medium text-right">STAGFLATION</div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis type="number" dataKey="x" domain={[-2, 2]} stroke={CHART_AXIS_COLOR} tick={{ ...CHART_AXIS_TICK, fontSize: 9 }} tickFormatter={(v) => `${v}`} />
                  <YAxis type="number" dataKey="y" domain={[-2, 2]} stroke={CHART_AXIS_COLOR} tick={{ ...CHART_AXIS_TICK, fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                  <ZAxis range={[30, 30]} />
                  <ReferenceLine x={0} stroke={CHART_REFERENCE_COLOR} strokeWidth={1} />
                  <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeWidth={1} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                    formatter={(_: any, name: string, props: any) => {
                      const regime = REGIME_CONFIG[props.payload.regime]?.name ?? 'Unknown';
                      return [regime, 'Regime'];
                    }}
                  />
                  <Scatter
                    data={trail}
                    shape={(props: any) => <TrailDot {...props} isLatest={props.payload.isLatest} />}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Regime Probabilities */}
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
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
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
                Based on empirical Bridgewater research. Each quadrant systematically advantages different asset classes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
