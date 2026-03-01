/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  ShieldAlert,
  ArrowRightLeft,
  BookOpen,
  Download,
  BarChart3,
  Cpu,
  Zap,
  Target,
  Menu,
  X,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Area,
  ComposedChart
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Data Models ---

// Dynamic Scorecard Configuration mapping directly to FRED series
import { Chatbot } from './components/Chatbot';
import { SectorScorecard } from './components/SectorScorecard';
import { RegimeModel } from './components/RegimeModel';
import { CockpitOverview } from './components/CockpitOverview';
import { AssetAllocationDashboard } from './components/AssetAllocationDashboard';
import { CreditCycle } from './components/CreditCycle';
import { LiquidityPulse } from './components/LiquidityPulse';
import { InflationTracker } from './components/InflationTracker';
import { EconomicSurprise } from './components/EconomicSurprise';
import { RecessionProbability } from './components/RecessionProbability';
import { YieldCurve } from './components/YieldCurve';
import { MarketSentiment } from './components/MarketSentiment';
import { EconomicCycles } from './components/EconomicCycles';
import ScenarioAnalysis from './components/ScenarioAnalysis';
import { RecessionAlert } from './components/RecessionAlert';
import Methodology from './components/Methodology';

const scorecardConfig = [
  {
    id: 'hy_spread',
    name: 'HY Spread Widening',
    weight: 25,
    series: ['BAMLH0A0HYM2'],
    calc: (vals: number[]) => vals[0],
    minRisk: 2.0, // 0 points
    maxRisk: 5.0, // 25 points
    unit: '%',
    desc: 'ICE BofA US High Yield Spread'
  },
  {
    id: 'yield_curve',
    name: 'Yield Curve Inversion',
    weight: 20,
    series: ['T10Y2Y'],
    calc: (vals: number[]) => vals[0],
    minRisk: 1.0,  // 0 points (steep)
    maxRisk: -0.5, // 20 points (inverted)
    unit: '%',
    desc: '10Y-2Y Treasury Spread'
  },
  {
    id: 'fin_stress',
    name: 'Financial Stress Index',
    weight: 20,
    series: ['STLFSI4'],
    calc: (vals: number[]) => vals[0],
    minRisk: -1.0, // 0 points (low stress)
    maxRisk: 1.0,  // 20 points (high stress)
    unit: 'pts',
    desc: 'St. Louis Fed Financial Stress Index'
  },
  {
    id: 'macro_activity',
    name: 'Macro Contraction',
    weight: 15,
    series: ['CFNAI'],
    calc: (vals: number[]) => vals[0],
    minRisk: 0.5,  // 0 points (growth)
    maxRisk: -0.5, // 15 points (contraction)
    unit: 'pts',
    desc: 'Chicago Fed National Activity Index'
  },
  {
    id: 'vix_term',
    name: 'VIX Term Structure',
    weight: 10,
    series: ['VIXCLS', 'VXVCLS'],
    calc: (vals: number[]) => vals[0] / vals[1],
    minRisk: 0.8, // 0 points (normal contango)
    maxRisk: 1.0, // 10 points (backwardation/panic)
    unit: 'x',
    desc: 'VIX 1M / VIX 3M Ratio'
  },
  {
    id: 'real_yield',
    name: 'Real Yields > 2.0%',
    weight: 10,
    series: ['DFII10'],
    calc: (vals: number[]) => vals[0],
    minRisk: 0.0, // 0 points
    maxRisk: 2.0, // 10 points
    unit: '%',
    desc: '10-Year Treasury Inflation-Indexed Security'
  }
];

const appendixData = [
  { id: 'hy_spread', name: 'High-Yield (HY) Spread', desc: 'The difference in yield between high-yield corporate bonds and treasury bonds. Widening spreads indicate growing default risk and economic stress, often preceding equity sell-offs. The model tracks the ICE BofA US High Yield Index Option-Adjusted Spread.' },
  { id: 'yield_curve', name: 'Yield Curve Inversion (10Y-2Y)', desc: 'The spread between the 10-Year and 2-Year Treasury yields. An inverted curve (below 0%) is a classic leading indicator of recession, signaling tight near-term monetary policy and poor long-term growth expectations.' },
  { id: 'fin_stress', name: 'Financial Stress Index', desc: 'The St. Louis Fed Financial Stress Index measures the degree of financial stress in the markets. A value above zero indicates above-average financial market stress. Values approaching 1.0 signal systemic risk.' },
  { id: 'macro_activity', name: 'Macro Contraction (CFNAI)', desc: 'The Chicago Fed National Activity Index is a monthly index designed to gauge overall economic activity and related inflationary pressure. A value below -0.5 historically signals an increasing likelihood of a recession.' },
  { id: 'vix_term', name: 'VIX Term Structure (1M/3M)', desc: 'The relationship between short-term (1M) and long-term (3M) volatility expectations. An inversion (ratio > 1.0) indicates acute near-term panic and backwardation, often marking a capitulation point in equities.' },
  { id: 'real_yield', name: 'Real Yields (10Y TIPS)', desc: 'The yield on 10-Year Treasury Inflation-Protected Securities. High real yields (approaching 2.0%) tighten financial conditions significantly, making bonds highly attractive relative to equities and slowing economic growth.' },
];

// --- Helper Functions ---

const calculateScore = (val: number | null, minRisk: number, maxRisk: number, weight: number) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  let pct = (val - minRisk) / (maxRisk - minRisk);
  pct = Math.max(0, Math.min(1, pct));
  return Math.round(pct * weight);
};

const getPearsonCorrelation = (x: number[], y: number[]) => {
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== null && y[i] !== null && !isNaN(x[i]) && !isNaN(y[i])) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
      n++;
    }
  }
  if (n === 0) return 0;
  const step1 = (n * sumXY) - (sumX * sumY);
  const step2 = (n * sumX2) - (sumX * sumX);
  const step3 = (n * sumY2) - (sumY * sumY);
  const step4 = Math.sqrt(step2 * step3);
  if (step4 === 0) return 0;
  return step1 / step4;
};

// --- Components ---

function MetricCard({ title, value, unit, trend, chartData, dataKey, color = "#818cf8" }: { title: string, value: string, unit: string, trend: 'up' | 'down' | 'neutral', chartData?: any[], dataKey?: string, color?: string }) {
  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-5 flex flex-col justify-between hover:bg-[#141414] transition-colors relative overflow-hidden group min-h-[140px]">
      <div className="relative z-10">
        <div className="text-white/50 text-xs font-medium uppercase tracking-wider mb-4">{title}</div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-mono text-white tracking-tight">{value}</span>
          <span className="text-white/40 text-sm font-mono">{unit}</span>
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          {trend === 'up' && <TrendingUp className="w-3 h-3 text-rose-400" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 text-emerald-400" />}
          {trend === 'neutral' && <div className="w-3 h-0.5 bg-white/30 rounded-full" />}
          <span className="text-[10px] text-white/40 uppercase tracking-widest">Latest Observation</span>
        </div>
      </div>
      {chartData && dataKey && (
        <div className="absolute bottom-0 left-0 right-0 h-24 opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
              <YAxis domain={['auto', 'auto']} hide />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function DashboardTab({ fredData, loading, historyData }: { fredData: any[], loading: boolean, historyData: any[] }) {
  const getFredValue = (id: string) => {
    if (loading) return '---';
    const item = fredData.find(d => d.id === id);
    return item && item.value !== '.' && item.value !== null ? parseFloat(item.value).toFixed(2) : 'N/A';
  };

  // Calculate live scorecard data
  const liveScorecard = scorecardConfig.map(config => {
    const vals = config.series.map(id => {
      const item = fredData.find(d => d.id === id);
      return item && item.value !== '.' && item.value !== null ? parseFloat(item.value) : null;
    });

    const canCalc = vals.every(v => v !== null && !isNaN(v as number));
    const liveValue = canCalc ? config.calc(vals as number[]) : null;
    const currentScore = canCalc ? calculateScore(liveValue, config.minRisk, config.maxRisk, config.weight) : 0;

    let status = 'safe';
    const pct = currentScore / config.weight;
    if (pct >= 0.75) status = 'danger';
    else if (pct >= 0.4) status = 'warning';

    return {
      ...config,
      liveValue,
      currentScore,
      status
    };
  });

  const totalScore = liveScorecard.reduce((acc, curr) => acc + curr.currentScore, 0);
  const riskLevel = totalScore >= 70 ? 'CRITICAL RISK' : totalScore >= 40 ? 'ELEVATED RISK' : 'NORMAL';
  const riskColor = totalScore >= 70 ? 'text-rose-500' : totalScore >= 40 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Scorecard */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#141414]">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ShieldAlert className={cn("w-5 h-5", riskColor)} />
              "Flight-to-Safety" Scorecard
            </h2>
            <p className="text-sm text-white/50 mt-1">Live weighted scoring system (0-100) powered by FRED</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-light tracking-tight text-white font-mono">
              {loading ? '--' : totalScore}<span className="text-xl text-white/30">/100</span>
            </div>
            <div className={cn("text-[10px] font-bold uppercase tracking-widest mt-1", riskColor)}>
              {loading ? 'CALCULATING...' : riskLevel}
            </div>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
          {liveScorecard.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-white/80">{item.name}</span>
                <span className="font-mono text-white/50">{item.currentScore} / {item.weight}</span>
              </div>
              <div className="flex justify-between text-[10px] text-white/40 font-mono mb-2 uppercase tracking-wider">
                <span>Live: {item.liveValue !== null ? item.liveValue.toFixed(2) + item.unit : 'Loading...'}</span>
                <span>Range: {item.minRisk}{item.unit} → {item.maxRisk}{item.unit}</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    item.status === 'danger' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                    item.status === 'warning' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                    'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                  )}
                  style={{ width: `${(item.currentScore / item.weight) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Factors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scorecardConfig.map(config => {
          const liveScorecardItem = liveScorecard.find(item => item.id === config.id);
          const liveValue = liveScorecardItem?.liveValue !== null && liveScorecardItem?.liveValue !== undefined 
            ? liveScorecardItem.liveValue.toFixed(2) 
            : 'N/A';
          
          return (
            <MetricCard 
              key={config.id}
              title={config.name} 
              value={liveValue} 
              unit={config.unit} 
              trend="neutral" 
              chartData={historyData}
              dataKey={config.id}
              color="#818cf8"
            />
          );
        })}
      </div>
    </div>
  );
}

function PeriodSelector({ forwardPeriod, setForwardPeriod }: { forwardPeriod: number, setForwardPeriod: (v: number) => void }) {
  const periods = [
    { label: '1M', value: 1 },
    { label: '3M', value: 3 },
    { label: '6M', value: 6 },
    { label: '9M', value: 9 },
    { label: '1Y', value: 12 },
  ];

  return (
    <div className="flex items-center gap-2 bg-[#1f1f1f] p-1 rounded-lg border border-white/10 w-fit">
      {periods.map(p => (
        <button
          key={p.value}
          onClick={() => setForwardPeriod(p.value)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-all",
            forwardPeriod === p.value 
              ? "bg-indigo-500 text-white shadow-md" 
              : "text-white/50 hover:text-white hover:bg-white/5"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function BacktestTab({ historyData, forwardPeriod, setForwardPeriod }: { historyData: any[], forwardPeriod: number, setForwardPeriod: (v: number) => void }) {
  const [backtestData, setBacktestData] = useState<any[]>([]);

  useEffect(() => {
    if (!historyData || historyData.length === 0) return;

    const processedData = historyData.map(item => {
      // Calculate total score for this data point
      const totalScore = scorecardConfig.reduce((acc, config) => {
        let val = null;
        if (config.id === 'hy_spread') val = item.hy_spread;
        else if (config.id === 'yield_curve') val = item.yield_curve;
        else if (config.id === 'fin_stress') val = item.fin_stress;
        else if (config.id === 'macro_activity') val = item.macro_activity;
        else if (config.id === 'vix_term') val = item.vix_term;
        else if (config.id === 'real_yield') val = item.real_yield;
        
        return acc + calculateScore(val, config.minRisk, config.maxRisk, config.weight);
      }, 0);

      const diff = item.return_diff || 0;

      return {
        ...item,
        score: totalScore,
        return_diff_pos: diff > 0 ? diff : 0,
        return_diff_neg: diff < 0 ? diff : 0
      };
    });

    setBacktestData(processedData);
  }, [historyData]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const dateStr = new Date(data.raw_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return (
        <div className="bg-[#0f0f0f] border border-white/20 p-4 rounded-xl shadow-2xl font-mono text-xs min-w-[220px]">
          <p className="text-white font-bold mb-3 border-b border-white/10 pb-2">{dateStr}</p>
          
          <div className="space-y-3">
            <div>
              <p className="text-indigo-400 font-bold uppercase tracking-wider mb-1">Flight-to-Safety Score</p>
              <p className="text-white text-lg font-bold">{data.score}<span className="text-[10px] text-white/40 ml-1 font-normal">/100</span></p>
            </div>

            <div className="h-px bg-white/10" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">US 10Y Fwd</p>
                <p className="text-white font-medium">{data.us10y_fwd}%</p>
              </div>
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">S&P 500 Fwd</p>
                <p className="text-white font-medium">{data.spx_fwd}%</p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-white/40 uppercase text-[9px] mb-1">Return Difference</p>
                  <p className={cn("text-base font-bold", data.return_diff > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {data.return_diff > 0 ? '+' : ''}{data.return_diff}%
                  </p>
                </div>
                <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", data.return_diff > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                  {data.return_diff > 0 ? 'Bonds Out' : 'Equities Out'}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const maxAbsDiff = useMemo(() => {
    if (!backtestData || backtestData.length === 0) return 20;
    const validDiffs = backtestData
      .map(d => Math.abs(d.return_diff || 0))
      .filter(v => !isNaN(v) && isFinite(v));
    
    if (validDiffs.length === 0) return 20;
    
    const max = Math.max(...validDiffs);
    const padded = max * 1.1;
    // Round up to nearest multiple of 10 to ensure nice ticks with tickCount={5}
    return Math.max(10, Math.ceil(padded / 10) * 10);
  }, [backtestData]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-500" />
              Backtest Logic & Signals
            </h2>
            <p className="text-sm text-white/50 mt-1">Tactical asset allocation shift from 60/40 to bond-heavy overweight</p>
          </div>
        </div>
        
        <div className="p-6">
          <div className="h-[400px]">
            <h3 className="text-sm font-medium text-white/50 mb-6 uppercase tracking-widest">Historical Score vs. Asset Performance</h3>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={backtestData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.4}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                <XAxis 
                  dataKey="raw_date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }} 
                  dy={5}
                  tickFormatter={(str) => new Date(str).getFullYear().toString()}
                  minTickGap={60}
                />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }} dx={-10} domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#ffffff50', fontFamily: 'monospace' }} dx={10} domain={[-maxAbsDiff, maxAbsDiff]} tickCount={5} />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', paddingBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }} 
                  iconType="circle"
                  iconSize={8}
                />
                <ReferenceLine y={70} yAxisId="left" stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Entry (70)', fill: '#f43f5e', fontSize: 10, fontFamily: 'monospace' }} />
                <ReferenceLine y={40} yAxisId="left" stroke="#10b981" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Exit (40)', fill: '#10b981', fontSize: 10, fontFamily: 'monospace' }} />
                <ReferenceLine y={0} yAxisId="right" stroke="#ffffff20" />
                <Area 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="return_diff_pos" 
                  name="Return Diff (10Y - SPX)" 
                  legendType="none"
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorPos)" 
                  dot={false} 
                  baseValue={0}
                  connectNulls
                />
                <Area 
                  yAxisId="right" 
                  type="monotone" 
                  dataKey="return_diff_neg" 
                  name="Return Diff (10Y - SPX)" 
                  legendType="none"
                  stroke="#f43f5e" 
                  fillOpacity={1} 
                  fill="url(#colorNeg)" 
                  dot={false} 
                  baseValue={0}
                  connectNulls
                />
                <Line yAxisId="left" type="monotone" dataKey="score" name="F2S Score" stroke="#818cf8" strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={{ r: 6, fill: '#ffffff' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function ForwardReturnsTab({ historyData, forwardPeriod, setForwardPeriod }: { historyData: any[], forwardPeriod: number, setForwardPeriod: (v: number) => void }) {
  const [zoomState, setZoomState] = useState<'zoomed-in' | 'zoomed-out'>('zoomed-in');
  const periodLabel = forwardPeriod === 12 ? '1Y' : `${forwardPeriod}M`;
  
  const maxAbsDiff = useMemo(() => {
    if (!historyData || historyData.length === 0) return 20;
    const validDiffs = historyData
      .map(d => Math.abs(d.return_diff || 0))
      .filter(v => !isNaN(v) && isFinite(v));
      
    if (validDiffs.length === 0) return 20;

    const max = Math.max(...validDiffs);
    const padded = max * 1.1;
    // Round up to nearest multiple of 10 to ensure nice ticks with tickCount={5}
    return Math.max(10, Math.ceil(padded / 10) * 10);
  }, [historyData]);

  const processedHistory = useMemo(() => {
    return historyData.map(item => {
      const diff = item.return_diff || 0;
      return {
        ...item,
        return_diff_pos: diff > 0 ? diff : 0,
        return_diff_neg: diff < 0 ? diff : 0
      };
    });
  }, [historyData]);

  const factorDomains = useMemo(() => {
    const domains: Record<string, number[]> = {};
    
    scorecardConfig.forEach(config => {
      const values = processedHistory.map(d => d[config.id]).filter(v => v !== null && v !== undefined && !isNaN(v));
      if (values.length === 0) {
        domains[config.id] = [0, 2.5, 5, 7.5, 10];
        return;
      }
      
      const mid = (config.minRisk + config.maxRisk) / 2;
      
      if (zoomState === 'zoomed-in') {
        const delta = Math.abs(config.maxRisk - mid);
        domains[config.id] = [
          mid - delta,
          mid - delta / 2,
          mid,
          mid + delta / 2,
          mid + delta
        ];
      } else {
        const dataMin = Math.min(...values);
        const dataMax = Math.max(...values);
        
        let delta = Math.max(Math.abs(dataMin - mid), Math.abs(dataMax - mid), Math.abs(config.maxRisk - mid));
        delta = delta * 1.1;
        
        if (delta === 0) delta = 1;
        const exponent = Math.floor(Math.log10(delta));
        const fraction = delta / Math.pow(10, exponent);
        let niceFraction;
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 4) niceFraction = 4;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
        
        delta = niceFraction * Math.pow(10, exponent);
        
        domains[config.id] = [
          mid - delta,
          mid - delta / 2,
          mid,
          mid + delta / 2,
          mid + delta
        ];
      }
    });
    
    return domains;
  }, [processedHistory, zoomState]);

  const FactorTooltip = ({ active, payload, factorConfig }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const dateStr = new Date(data.raw_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      const inputs = factorConfig.series.map((s: string) => ({
        id: s,
        val: data.raw_inputs ? data.raw_inputs[s] : null
      }));

      return (
        <div className="bg-[#0f0f0f] border border-white/20 p-4 rounded-xl shadow-2xl font-mono text-xs min-w-[240px]">
          <p className="text-white font-bold mb-3 border-b border-white/10 pb-2">{dateStr}</p>
          
          <div className="space-y-3">
            <div>
              <p className="text-indigo-400 font-bold uppercase tracking-wider mb-1">{factorConfig.name}</p>
              <p className="text-white text-lg font-bold">
                {data[factorConfig.id] !== null ? data[factorConfig.id] : 'N/A'}
                <span className="text-[10px] text-white/40 ml-1 font-normal">{factorConfig.unit}</span>
              </p>
              <div className="mt-1.5 p-2 bg-white/5 rounded border border-white/5">
                <p className="text-[9px] text-white/40 uppercase mb-1">Calculation Method</p>
                <p className="text-[10px] text-white/70 leading-tight">{factorConfig.desc}</p>
                {inputs.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-x-3 gap-y-1">
                    {inputs.map((i: any) => (
                      <div key={i.id} className="flex gap-1">
                        <span className="text-white/30">{i.id}:</span>
                        <span className="text-white/70">{i.val !== null ? i.val : 'N/A'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">US 10Y Fwd</p>
                <p className="text-white font-medium">{data.us10y_fwd}%</p>
              </div>
              <div>
                <p className="text-white/40 uppercase text-[9px] mb-1">S&P 500 Fwd</p>
                <p className="text-white font-medium">{data.spx_fwd}%</p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-white/40 uppercase text-[9px] mb-1">Return Difference</p>
                  <p className={cn("text-base font-bold", data.return_diff > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {data.return_diff > 0 ? '+' : ''}{data.return_diff}%
                  </p>
                </div>
                <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", data.return_diff > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                  {data.return_diff > 0 ? 'Bonds Out' : 'Equities Out'}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#141414] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              {periodLabel} Forward Return Difference vs. Factors
            </h2>
            <p className="text-sm text-white/50 mt-1">Historical {periodLabel} forward performance difference (US10Y - SPX) compared to each scorecard factor.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PeriodSelector forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />
            <div className="flex bg-[#0f0f0f] border border-white/10 rounded-md p-1">
              <button
                onClick={() => setZoomState('zoomed-in')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  zoomState === 'zoomed-in' 
                    ? "bg-indigo-500 text-white shadow-md" 
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
              >
                Zoomed In
              </button>
              <button
                onClick={() => setZoomState('zoomed-out')}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  zoomState === 'zoomed-out' 
                    ? "bg-indigo-500 text-white shadow-md" 
                    : "text-white/50 hover:text-white hover:bg-white/5"
                )}
              >
                Zoomed Out
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-8">
          {scorecardConfig.map((config) => (
            <div key={config.id} className="bg-[#141414] border border-white/5 rounded-xl p-6 h-[400px] flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider">{config.name}</h3>
                  <p className="text-[10px] text-white/40 font-mono mt-0.5">Correlation vs. Returns</p>
                </div>
                <div className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono text-white/60 border border-white/10">
                  Weight: {config.weight}%
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={processedHistory} margin={{ top: 5, right: 0, bottom: 25, left: 0 }}>
                    <defs>
                      <linearGradient id={`colorPos-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id={`colorNeg-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.05}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.4}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                    <XAxis 
                      dataKey="raw_date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#ffffff30', fontFamily: 'monospace' }} 
                      dy={10} 
                      tickFormatter={(str) => str ? new Date(str).getFullYear().toString() : ''}
                      minTickGap={60} 
                    />
                    <YAxis 
                      yAxisId="left" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#818cf8', fontFamily: 'monospace' }} 
                      dx={-10} 
                      ticks={factorDomains[config.id]}
                      domain={[factorDomains[config.id][0], factorDomains[config.id][4]]}
                      tickFormatter={(val) => {
                        if (Math.abs(val) >= 10) return Math.round(val).toString();
                        if (Number.isInteger(val)) return val.toString();
                        return String(Number(val.toFixed(2)));
                      }}
                      allowDataOverflow={true}
                      reversed={config.minRisk > config.maxRisk}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#ffffff30', fontFamily: 'monospace' }} 
                      dx={10} 
                      domain={[-maxAbsDiff, maxAbsDiff]} 
                      tickCount={5} 
                      allowDataOverflow={true}
                    />
                    <Tooltip content={<FactorTooltip factorConfig={config} />} />
                    <Legend 
                      verticalAlign="top" 
                      align="right"
                      wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', paddingBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }} 
                      iconType="circle"
                      iconSize={8}
                    />
                    <ReferenceLine y={0} yAxisId="right" stroke="#ffffff15" strokeWidth={1} />
                    <Area 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="return_diff_pos" 
                      name="Return Diff (10Y - SPX)" 
                      stroke="#10b981" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill={`url(#colorPos-${config.id})`} 
                      baseValue={0}
                      connectNulls
                    />
                    <Area 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="return_diff_neg" 
                      name="Return Diff (10Y - SPX)" 
                      legendType="none"
                      stroke="#f43f5e" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill={`url(#colorNeg-${config.id})`} 
                      baseValue={0}
                      connectNulls
                    />
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey={config.id} 
                      name={config.name} 
                      stroke="#818cf8" 
                      strokeWidth={1} 
                      strokeDasharray="4 4"
                      dot={false} 
                      activeDot={{ r: 4, fill: '#fff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CorrelationMatrixTab({ historyData }: { historyData: any[] }) {
  const variables = [
    { id: 'return_diff', label: 'SPX-10Y Diff (1Y Fwd)' },
    ...scorecardConfig.map(c => ({ id: c.id, label: c.name }))
  ];

  const matrix = variables.map(v1 => {
    return variables.map(v2 => {
      const x = historyData.map(d => d[v1.id]);
      const y = historyData.map(d => d[v2.id]);
      return getPearsonCorrelation(x, y);
    });
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#141414]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Factor Correlation Matrix
          </h2>
          <p className="text-sm text-white/50 mt-1">Pearson correlation coefficients between scorecard factors and 1Y forward return differences.</p>
        </div>
        <div className="p-6 overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-8 gap-1 mb-1">
              <div className="col-span-1"></div>
              {variables.map(v => (
                <div key={v.id} className="text-[10px] font-mono text-white/50 text-center truncate px-1" title={v.label}>
                  {v.label}
                </div>
              ))}
            </div>
            {variables.map((v1, i) => (
              <div key={v1.id} className="grid grid-cols-8 gap-1 mb-1">
                <div className="col-span-1 text-[10px] font-mono text-white/50 flex items-center justify-end pr-4 text-right truncate" title={v1.label}>
                  {v1.label}
                </div>
                {variables.map((v2, j) => {
                  const corr = matrix[i][j];
                  const isSelf = i === j;
                  const absCorr = Math.abs(corr);
                  const bgColor = corr > 0 
                    ? `rgba(16, 185, 129, ${absCorr * 0.8})` 
                    : `rgba(244, 63, 94, ${absCorr * 0.8})`;
                  
                  return (
                    <div 
                      key={`${v1.id}-${v2.id}`} 
                      className="h-10 rounded flex items-center justify-center text-xs font-mono"
                      style={{ backgroundColor: isSelf ? 'rgba(255,255,255,0.1)' : bgColor, color: absCorr > 0.5 || isSelf ? '#fff' : 'rgba(255,255,255,0.5)' }}
                    >
                      {corr.toFixed(2)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden mt-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="flex items-start gap-4 relative">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shrink-0">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="space-y-4 w-full">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                AI Correlation Analysis & BEATS Implications
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">LIVE</span>
              </h3>
              <p className="text-xs text-white/40 mt-1">Automated synthesis of stock-bond correlation shifts and their impact on the BEATS model.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400"/> Historical Regime Shifts
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  For the two decades preceding 2022, the stock-bond correlation was reliably negative (averaging -0.3). During demand-driven shocks (like the GFC or Dot-Com bust), bonds rallied as equities fell, providing the foundational logic for the 60/40 portfolio. However, during supply-driven inflation shocks (e.g., 2022), the correlation flips positive, causing simultaneous drawdowns.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400"/> Implications for BEATS Model
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  The BEATS (Bond Equity Allocation Timing Scorecard) model traditionally assumes bonds act as a safe haven when equity risk premiums compress. When correlation is positive (&gt;0), the BEATS model's "Risk-Off" signal becomes less effective if it simply rotates into long-duration bonds. The model must dynamically adjust its fixed-income duration targets based on the prevailing inflation regime.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
              <h4 className="text-sm font-medium text-indigo-300 mb-2">Actionable Takeaway for BEATS Allocation</h4>
              <p className="text-sm text-white/70 leading-relaxed">
                As the rolling correlation begins to normalize back toward zero (currently 0.2 down from 0.6), the BEATS model is re-weighting its traditional "Flight to Quality" signals. 
                <br/><br/>
                <strong>BEATS Adjustment:</strong> While recession probabilities are rising, the BEATS model is currently favoring <strong>cash equivalents and short-duration Treasuries (T-Bills)</strong> over long-duration bonds until the correlation firmly re-enters negative territory, ensuring true diversification during the next equity drawdown.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppendixTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-[#141414]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            Indicator Appendix
          </h2>
          <p className="text-sm text-white/50 mt-1">Detailed definitions of the macro and factor-based lead indicators</p>
        </div>
        <div className="p-0">
          <div className="divide-y divide-white/5">
            {appendixData.map((item, idx) => (
              <div key={idx} className="p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row gap-4 md:gap-8">
                <div className="md:w-1/3 shrink-0">
                  <h3 className="text-base font-medium text-white">{item.name}</h3>
                  <div className="text-xs font-mono text-white/40 mt-1 tracking-wider uppercase">ID: {item.id}</div>
                </div>
                <div className="md:w-2/3">
                  <p className="text-sm text-white/60 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeModel, setActiveModel] = useState('overview');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [fredData, setFredData] = useState<any[]>([]);
  const [rawHistoryData, setRawHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwardPeriod, setForwardPeriod] = useState<number>(3); // in months
  const [isExporting, setIsExporting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const pdf = new jsPDF('landscape', 'pt', 'a4');
      const tabs = ['dashboard', 'forward', 'correlation', 'backtest', 'appendix'];
      
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        const element = document.getElementById(`export-${tab}`);
        if (element) {
          const imgData = await htmlToImage.toJpeg(element, {
            quality: 1.0,
            backgroundColor: '#050505',
            pixelRatio: 2,
          });
          
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          
          const imgProps = pdf.getImageProperties(imgData);
          const imgRatio = imgProps.width / imgProps.height;
          const pdfRatio = pdfWidth / pdfHeight;
          
          let finalWidth = pdfWidth;
          let finalHeight = pdfHeight;
          
          if (imgRatio > pdfRatio) {
            finalHeight = pdfWidth / imgRatio;
          } else {
            finalWidth = pdfHeight * imgRatio;
          }
          
          const x = (pdfWidth - finalWidth) / 2;
          const y = (pdfHeight - finalHeight) / 2;
          
          if (i > 0) {
            pdf.addPage();
          }
          
          pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
        }
      }
      
      pdf.save('BEATS_Scorecard.pdf');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // Fetch current data
    fetch('/api/fred')
      .then(res => res.json())
      .then(data => {
        setFredData(data);
      })
      .catch(err => console.error('Failed to fetch FRED data:', err));

    // Fetch historical data
    fetch('/api/fred/history')
      .then(res => res.json())
      .then(data => {
        setRawHistoryData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch FRED history:', err);
        setLoading(false);
      });
  }, []);

  const historyData = React.useMemo(() => {
    if (!rawHistoryData || rawHistoryData.length === 0) return [];
    
    const processed = [];
    for (let i = 0; i < rawHistoryData.length - forwardPeriod; i++) {
      const current = rawHistoryData[i];
      const future = rawHistoryData[i + forwardPeriod];
      
      if (current && future && current.SP500 && future.SP500 && current.DGS10 && future.DGS10) {
        const spx_fwd = ((future.SP500 - current.SP500) / current.SP500) * 100;
        
        // Approx 10Y Treasury Return: yield over the period + price change (duration ~8)
        // Yield is annualized, so we multiply by (forwardPeriod / 12)
        const yield_return = (current.DGS10 || 0) * (forwardPeriod / 12);
        const price_return = -8 * ((future.DGS10 || 0) - (current.DGS10 || 0));
        const us10y_fwd = yield_return + price_return;
        
        // Return Diff: 10Y vs SPX
        const return_diff = us10y_fwd - spx_fwd;
        
        if (!isNaN(return_diff) && isFinite(return_diff)) {
          processed.push({
            date: current.date ? new Date(current.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'N/A',
            raw_date: current.date,
            return_diff: parseFloat(return_diff.toFixed(2)),
            hy_spread: current.BAMLH0A0HYM2,
            yield_curve: current.T10Y2Y,
            fin_stress: current.STLFSI4,
            macro_activity: current.CFNAI,
            vix_term: (current.VIXCLS && current.VXVCLS) ? parseFloat((current.VIXCLS / current.VXVCLS).toFixed(2)) : null,
            real_yield: current.DFII10,
            spx_fwd: parseFloat(spx_fwd.toFixed(2)),
            us10y_fwd: parseFloat(us10y_fwd.toFixed(2)),
            raw_inputs: current
          });
        }
      }
    }
    return processed;
  }, [rawHistoryData, forwardPeriod]);

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <RecessionAlert onNavigate={setActiveModel} />
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#0f0f0f] border-r border-white/5 flex flex-col transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:transform-none"
      )}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-[#073620]/50 shadow-[0_0_15px_rgba(7,54,32,0.4)]">
              <img src="/favicon.svg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white leading-tight">QuantDash</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Models & Scorecards</p>
            </div>
          </div>
          <button 
            className="md:hidden text-white/50 hover:text-white"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-4">Overview</div>
          <button 
            onClick={() => { setActiveModel('overview'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'overview' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Activity className={cn("w-4 h-4", activeModel === 'overview' ? "text-emerald-400" : "")} />
            Cockpit
          </button>
          <button 
            onClick={() => { setActiveModel('allocation'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'allocation' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <LineChart className={cn("w-4 h-4", activeModel === 'allocation' ? "text-emerald-400" : "")} />
            Asset Allocation
          </button>
          
          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Scorecards</div>
          <button 
            onClick={() => { setActiveModel('beats'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'beats' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Activity className={cn("w-4 h-4", activeModel === 'beats' ? "text-emerald-400" : "")} />
            BEATS Scorecard
          </button>
          <button 
            onClick={() => { setActiveModel('sector'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'sector' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <BarChart3 className={cn("w-4 h-4", activeModel === 'sector' ? "text-emerald-400" : "")} />
            Sector Scorecard
          </button>
          <button 
            onClick={() => { setActiveModel('regime'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'regime' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Cpu className={cn("w-4 h-4", activeModel === 'regime' ? "text-emerald-400" : "")} />
            Regime Model
          </button>
          <button 
            onClick={() => { setActiveModel('inflation'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'inflation' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <TrendingUp className={cn("w-4 h-4", activeModel === 'inflation' ? "text-emerald-400" : "")} />
            Inflation Tracker
          </button>
          <button 
            onClick={() => { setActiveModel('recession'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'recession' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <ShieldAlert className={cn("w-4 h-4", activeModel === 'recession' ? "text-emerald-400" : "")} />
            Recession Probability
          </button>
          <button 
            onClick={() => { setActiveModel('surprise'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'surprise' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Target className={cn("w-4 h-4", activeModel === 'surprise' ? "text-emerald-400" : "")} />
            Economic Surprise
          </button>
          
          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Models</div>
          <button 
            onClick={() => { setActiveModel('liquidity'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'liquidity' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Zap className={cn("w-4 h-4", activeModel === 'liquidity' ? "text-emerald-400" : "")} />
            Liquidity Pulse
          </button>
          <button 
            onClick={() => { setActiveModel('yield'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'yield' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <ArrowRightLeft className={cn("w-4 h-4", activeModel === 'yield' ? "text-emerald-400" : "")} />
            Yield Curve Model
          </button>
          <button 
            onClick={() => { setActiveModel('credit'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'credit' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <BookOpen className={cn("w-4 h-4", activeModel === 'credit' ? "text-emerald-400" : "")} />
            Credit Cycle
          </button>
          <button 
            onClick={() => { setActiveModel('sentiment'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'sentiment' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <MessageSquare className={cn("w-4 h-4", activeModel === 'sentiment' ? "text-emerald-400" : "")} />
            Market Sentiment
          </button>
          <button 
            onClick={() => { setActiveModel('cycles'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'cycles' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <LineChart className={cn("w-4 h-4", activeModel === 'cycles' ? "text-emerald-400" : "")} />
            Economic Cycles
          </button>
          <button 
            onClick={() => { setActiveModel('scenario'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'scenario' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Sparkles className={cn("w-4 h-4", activeModel === 'scenario' ? "text-emerald-400" : "")} />
            Scenario Analysis
          </button>
          <div className="mt-8">
            <h3 className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Documentation</h3>
            <div className="space-y-1">
              <button 
                onClick={() => { setActiveModel('methodology'); setIsMobileMenuOpen(false); }}
                className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'methodology' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
              >
                <BookOpen className={cn("w-4 h-4", activeModel === 'methodology' ? "text-emerald-400" : "")} />
                Methodology
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#0a0a0a] sticky top-0 z-20 backdrop-blur-md bg-opacity-80">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                className="md:hidden p-2 -ml-2 text-white hover:bg-white/10 rounded-md transition-colors"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {activeModel === 'overview' && 'Cockpit Overview'}
                  {activeModel === 'allocation' && 'Asset Allocation Dashboard'}
                  {activeModel === 'beats' && 'BEATS Scorecard'}
                  {activeModel === 'sector' && 'Sector Scorecard'}
                  {activeModel === 'regime' && 'Regime Model'}
                  {activeModel === 'inflation' && 'Inflation Tracker'}
                  {activeModel === 'recession' && 'Recession Probability'}
                  {activeModel === 'surprise' && 'Economic Surprise Index'}
                  {activeModel === 'liquidity' && 'Global Liquidity Pulse'}
                  {activeModel === 'yield' && 'Yield Curve Model'}
                  {activeModel === 'credit' && 'Credit Cycle Sense'}
                  {activeModel === 'sentiment' && 'Market Sentiment'}
                  {activeModel === 'cycles' && 'Economic Cycles'}
                  {activeModel === 'scenario' && 'Scenario Analysis'}
                  {activeModel === 'methodology' && 'Methodology & Documentation'}
                </h2>
                <p className="text-xs text-white/40 hidden md:block">
                  {activeModel === 'overview' && 'Central dashboard for all models and scorecards'}
                  {activeModel === 'allocation' && 'Macro Sensing & Tactical Asset Allocation'}
                  {activeModel === 'beats' && 'Bond Equity Allocation Timing Scorecard'}
                  {activeModel === 'sector' && 'Sector Allocation & Momentum'}
                  {activeModel === 'regime' && '4-State Hidden Markov Model'}
                  {activeModel === 'inflation' && '10Y Breakeven & Sticky CPI Tracker'}
                  {activeModel === 'credit' && 'HY Spreads vs Bank Lending Standards'}
                  {activeModel === 'yield' && 'Analysis of Treasury term structure, tracking inversions, steepening, and flattening regimes.'}
                  {activeModel === 'sentiment' && 'AlphaSense macro sentiment and Twitter/X market sentiment.'}
                  {activeModel === 'cycles' && 'Historical asset performance across macroeconomic regimes.'}
                  {activeModel === 'scenario' && 'Hypothetical economic conditions & AI-projected outcomes.'}
                  {activeModel === 'methodology' && 'Theoretical foundations and calculation methodologies for all models.'}
                  {activeModel !== 'overview' && activeModel !== 'allocation' && activeModel !== 'beats' && activeModel !== 'sector' && activeModel !== 'regime' && activeModel !== 'inflation' && activeModel !== 'credit' && activeModel !== 'liquidity' && activeModel !== 'surprise' && activeModel !== 'recession' && activeModel !== 'yield' && activeModel !== 'sentiment' && activeModel !== 'cycles' && activeModel !== 'methodology' && 'Model currently under development'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="hidden md:flex items-center gap-2 text-white/50 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                FRED_SYNC_ACTIVE
              </div>
              <div className="h-4 w-px bg-white/10 hidden md:block"></div>
              <button 
                onClick={handleExport}
                disabled={isExporting}
                className={cn(
                  "text-xs font-medium uppercase tracking-wider transition-colors flex items-center gap-2 px-4 py-2 rounded-md border",
                  isExporting 
                    ? "text-white/50 border-white/10 bg-white/5 cursor-not-allowed" 
                    : "text-white/70 hover:text-white border-white/20 hover:bg-white/10"
                )}
              >
                {isExporting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={cn("px-4 md:px-8 py-8", (activeModel === 'sector' || activeModel === 'regime' || activeModel === 'overview' || activeModel === 'allocation' || activeModel === 'credit' || activeModel === 'liquidity' || activeModel === 'inflation' || activeModel === 'surprise' || activeModel === 'recession' || activeModel === 'yield' || activeModel === 'sentiment' || activeModel === 'cycles' || activeModel === 'methodology') ? "h-[calc(100vh-4rem)] pb-8 overflow-y-auto" : "pb-24")}>
          {activeModel === 'overview' ? (
            <CockpitOverview setActiveModel={setActiveModel} fredData={fredData} loading={loading} />
          ) : activeModel === 'allocation' ? (
            <AssetAllocationDashboard />
          ) : activeModel === 'credit' ? (
            <CreditCycle />
          ) : activeModel === 'liquidity' ? (
            <LiquidityPulse />
          ) : activeModel === 'inflation' ? (
            <InflationTracker />
          ) : activeModel === 'surprise' ? (
            <EconomicSurprise />
          ) : activeModel === 'recession' ? (
            <RecessionProbability />
          ) : activeModel === 'yield' ? (
            <YieldCurve />
          ) : activeModel === 'sentiment' ? (
            <MarketSentiment />
          ) : activeModel === 'cycles' ? (
            <EconomicCycles />
          ) : activeModel === 'scenario' ? (
            <ScenarioAnalysis />
          ) : activeModel === 'methodology' ? (
            <Methodology />
          ) : activeModel === 'beats' ? (
            <>
              {/* Tabs Navigation */}
              <div className="flex space-x-1 bg-[#0f0f0f] p-1 rounded-lg border border-white/10 w-fit mb-8 overflow-x-auto">
                {['dashboard', 'forward', 'correlation', 'backtest', 'appendix'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 capitalize whitespace-nowrap",
                      activeTab === tab 
                        ? "bg-[#1f1f1f] text-white shadow-sm border border-white/5" 
                        : "text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent"
                    )}
                  >
                    {tab === 'forward' ? 'Forward Returns' : tab === 'correlation' ? 'Correlation Matrix' : tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div>
                {activeTab === 'dashboard' && <DashboardTab fredData={fredData} loading={loading} historyData={historyData} />}
                {activeTab === 'forward' && <ForwardReturnsTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'correlation' && <CorrelationMatrixTab historyData={historyData} />}
                {activeTab === 'backtest' && <BacktestTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />}
                {activeTab === 'appendix' && <AppendixTab />}
              </div>
            </>
          ) : activeModel === 'sector' ? (
            <SectorScorecard />
          ) : activeModel === 'regime' ? (
            <RegimeModel />
          ) : (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-16 h-16 mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Activity className="w-8 h-8 text-white/20" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">Coming Soon</h3>
              <p className="text-white/40 max-w-md">
                This model is currently under development. Check back later for updates to the QuantDash platform.
              </p>
            </div>
          )}
        </main>
      
      {/* Hidden Export Container */}
      <div className="fixed top-0 left-[-9999px] w-[1280px] bg-[#050505] text-white pointer-events-none z-[-1]">
        <div id="export-dashboard" className="w-[1280px] min-h-[800px] bg-[#050505] p-8">
          <div className="mb-6 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-semibold tracking-tight text-white">BEATS Dashboard</h1>
            <p className="text-sm uppercase tracking-widest text-white/40 font-medium">Bond Equity Allocation Timing Scorecard</p>
          </div>
          <DashboardTab fredData={fredData} loading={loading} historyData={historyData} />
        </div>
        <div id="export-forward" className="w-[1280px] min-h-[800px] bg-[#050505] p-8">
          <div className="mb-6 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Forward Returns</h1>
            <p className="text-sm uppercase tracking-widest text-white/40 font-medium">Bond Equity Allocation Timing Scorecard</p>
          </div>
          <ForwardReturnsTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />
        </div>
        <div id="export-correlation" className="w-[1280px] min-h-[800px] bg-[#050505] p-8">
          <div className="mb-6 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Correlation Matrix</h1>
            <p className="text-sm uppercase tracking-widest text-white/40 font-medium">Bond Equity Allocation Timing Scorecard</p>
          </div>
          <CorrelationMatrixTab historyData={historyData} />
        </div>
        <div id="export-backtest" className="w-[1280px] min-h-[800px] bg-[#050505] p-8">
          <div className="mb-6 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Backtest Logic & Signals</h1>
            <p className="text-sm uppercase tracking-widest text-white/40 font-medium">Bond Equity Allocation Timing Scorecard</p>
          </div>
          <BacktestTab historyData={historyData} forwardPeriod={forwardPeriod} setForwardPeriod={setForwardPeriod} />
        </div>
        <div id="export-appendix" className="w-[1280px] min-h-[800px] bg-[#050505] p-8">
          <div className="mb-6 pb-4 border-b border-white/10">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Appendix</h1>
            <p className="text-sm uppercase tracking-widest text-white/40 font-medium">Bond Equity Allocation Timing Scorecard</p>
          </div>
          <AppendixTab />
        </div>
      </div>

      <Chatbot 
        fredData={fredData} 
        historyData={historyData} 
        scorecardConfig={scorecardConfig} 
        appendixData={appendixData} 
      />
      </div>
    </div>
  );
}
