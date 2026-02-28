import React from 'react';
import { 
  Activity, 
  BarChart3, 
  Cpu, 
  TrendingUp, 
  ShieldAlert, 
  ArrowRightLeft, 
  BookOpen,
  Zap,
  Target,
  ArrowRight
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-implement the score calculation for the overview
const calculateScore = (val: number | null, minRisk: number, maxRisk: number, weight: number) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  let pct = (val - minRisk) / (maxRisk - minRisk);
  pct = Math.max(0, Math.min(1, pct));
  return Math.round(pct * weight);
};

const scorecardConfig = [
  {
    id: 'hy_spread',
    name: 'HY Spread Widening',
    weight: 25,
    series: ['BAMLH0A0HYM2'],
    calc: (vals: number[]) => vals[0],
    minRisk: 2.0,
    maxRisk: 5.0,
  },
  {
    id: 'yield_curve',
    name: 'Yield Curve Inversion',
    weight: 20,
    series: ['T10Y2Y'],
    calc: (vals: number[]) => vals[0],
    minRisk: 1.0,
    maxRisk: -0.5,
  },
  {
    id: 'fin_stress',
    name: 'Financial Stress Index',
    weight: 20,
    series: ['STLFSI4'],
    calc: (vals: number[]) => vals[0],
    minRisk: -1.0,
    maxRisk: 1.0,
  },
  {
    id: 'macro_activity',
    name: 'Macro Contraction',
    weight: 15,
    series: ['CFNAI'],
    calc: (vals: number[]) => vals[0],
    minRisk: 0.5,
    maxRisk: -0.5,
  },
  {
    id: 'vix_term',
    name: 'VIX Term Structure',
    weight: 10,
    series: ['VIXCLS', 'VXVCLS'],
    calc: (vals: number[]) => vals[0] / vals[1],
    minRisk: 0.8,
    maxRisk: 1.0,
  },
  {
    id: 'real_yield',
    name: 'Real Yields > 2.0%',
    weight: 10,
    series: ['DFII10'],
    calc: (vals: number[]) => vals[0],
    minRisk: 0.0,
    maxRisk: 2.0,
  }
];

interface CockpitOverviewProps {
  setActiveModel: (model: string) => void;
  fredData: any[];
  loading: boolean;
}

export function CockpitOverview({ setActiveModel, fredData, loading }: CockpitOverviewProps) {
  // Calculate BEATS score
  const liveScorecard = scorecardConfig.map(config => {
    const vals = config.series.map(id => {
      const item = fredData.find(d => d.id === id);
      return item && item.value !== '.' && item.value !== null ? parseFloat(item.value) : null;
    });

    const canCalc = vals.every(v => v !== null && !isNaN(v as number));
    const liveValue = canCalc ? config.calc(vals as number[]) : null;
    const currentScore = canCalc ? calculateScore(liveValue, config.minRisk, config.maxRisk, config.weight) : 0;

    return { currentScore };
  });

  const beatsScore = liveScorecard.reduce((acc, curr) => acc + curr.currentScore, 0);
  const beatsRiskLevel = beatsScore >= 70 ? 'CRITICAL RISK' : beatsScore >= 40 ? 'ELEVATED RISK' : 'NORMAL';
  const beatsColor = beatsScore >= 70 ? 'text-rose-500' : beatsScore >= 40 ? 'text-amber-500' : 'text-emerald-500';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* BEATS Scorecard */}
        <div 
          onClick={() => setActiveModel('beats')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-emerald-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">BEATS Scorecard</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Bond Equity Allocation Timing Scorecard. Evaluates macro risk factors to determine optimal asset allocation.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Current Score</div>
              <div className={cn("text-sm font-bold uppercase tracking-widest", beatsColor)}>
                {loading ? 'CALCULATING...' : beatsRiskLevel}
              </div>
            </div>
            <div className="text-3xl font-light font-mono text-white">
              {loading ? '--' : beatsScore}<span className="text-lg text-white/30">/100</span>
            </div>
          </div>
        </div>

        {/* Sector Scorecard */}
        <div 
          onClick={() => setActiveModel('sector')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-blue-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Sector Scorecard</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Tracks momentum, relative strength, and capital flows across 11 GICS sectors to identify leadership.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Top Sector</div>
              <div className="text-sm font-bold text-blue-400 uppercase tracking-widest">
                Technology (XLK)
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Momentum</div>
              <div className="text-sm font-mono text-emerald-400">+12.4%</div>
            </div>
          </div>
        </div>

        {/* Regime Model */}
        <div 
          onClick={() => setActiveModel('regime')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-purple-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-purple-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Regime Model</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">4-State Hidden Markov Model detecting structural shifts in market volatility and trend.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Current State</div>
              <div className="text-sm font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Green Light
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Posture</div>
              <div className="text-sm font-medium text-white/80">Aggressive</div>
            </div>
          </div>
        </div>

        {/* Inflation Tracker */}
        <div 
          onClick={() => setActiveModel('inflation')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-amber-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-amber-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Inflation Tracker</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Real-time tracking of CPI, PCE, and leading inflation indicators like commodities and wages.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Regime</div>
              <div className="text-sm font-bold text-amber-400 uppercase tracking-widest">
                Elevated
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">10Y Breakeven</div>
              <div className="text-sm font-mono text-amber-400">2.45%</div>
            </div>
          </div>
        </div>

        {/* Credit Cycle */}
        <div 
          onClick={() => setActiveModel('credit')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-rose-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Activity className="w-6 h-6 text-rose-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Credit Cycle Sense</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Analysis of HY spreads and bank lending standards to detect credit contraction or expansion.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Cycle</div>
              <div className="text-sm font-bold text-rose-400 uppercase tracking-widest">
                Contracting
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">HY Spread</div>
              <div className="text-sm font-mono text-rose-400">4.2%</div>
            </div>
          </div>
        </div>

        {/* Liquidity Pulse */}
        <div 
          onClick={() => setActiveModel('liquidity')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-yellow-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-yellow-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Liquidity Pulse</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Tracking Fed balance sheet (QT/QE) and M2 momentum to gauge market liquidity.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Pulse</div>
              <div className="text-sm font-bold text-rose-400 uppercase tracking-widest">
                Contracting
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Fed Assets</div>
              <div className="text-sm font-mono text-rose-400">$7.4T</div>
            </div>
          </div>
        </div>

        {/* Economic Surprise */}
        <div 
          onClick={() => setActiveModel('surprise')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-emerald-500/10 transition-colors"></div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Target className="w-6 h-6 text-emerald-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors group-hover:translate-x-1" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Economic Surprise</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Measuring the delta between actual economic data releases and analyst consensus.</p>
          
          <div className="bg-[#0a0a0a] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">ESI Score</div>
              <div className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
                +14.2
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Momentum</div>
              <div className="text-sm font-mono text-emerald-400">Positive</div>
            </div>
          </div>
        </div>

        {/* Recession Probability */}
        <div 
          onClick={() => setActiveModel('recession')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden opacity-70"
        >
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white/40" />
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/30 bg-white/5 px-2 py-1 rounded">In Dev</div>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Recession Probability</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Composite model aggregating yield curve, employment, and manufacturing data to forecast recessions.</p>
        </div>

        {/* Yield Curve Model */}
        <div 
          onClick={() => setActiveModel('yield')}
          className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col cursor-pointer hover:bg-[#141414] hover:border-white/20 transition-all group relative overflow-hidden opacity-70"
        >
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <ArrowRightLeft className="w-6 h-6 text-white/40" />
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-white/30 bg-white/5 px-2 py-1 rounded">In Dev</div>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Yield Curve Model</h3>
          <p className="text-sm text-white/40 mb-6 flex-1">Analysis of Treasury term structure, tracking inversions, steepening, and flattening regimes.</p>
        </div>

      </div>
    </div>
  );
}
