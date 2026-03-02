import React from 'react';
import { 
  Activity, 
  BarChart3, 
  Cpu, 
  ShieldAlert, 
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  LineChart
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function AssetAllocationDashboard() {
  // Mock data for the models to demonstrate the "Silent Divergence" logic
  const hmmState = 'Bullish'; // State 1
  const creditCycleState = 'Contracting';
  const liquidityState = 'Contracting';
  const inflationState = 'Elevated';
  
  // Logic Bridge: Macro Divergence
  const isDivergence = hmmState === 'Bullish' && (creditCycleState === 'Contracting' || liquidityState === 'Contracting');
  const isStagflation = hmmState === 'Bullish' && creditCycleState === 'Contracting' && inflationState === 'Elevated';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Macro Divergence Panel (The Logic Bridge) */}
      {isDivergence && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex items-start gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-amber-500 mb-1">
              {isStagflation ? 'Stagflationary Trap Detected' : 'Negative Macro Divergence'}
            </h3>
            <p className="text-sm text-amber-500/80 leading-relaxed">
              <strong>The Silent Divergence:</strong> HMM indicates a "{hmmState}" regime, but underlying macro sensors show Credit Cycle is {creditCycleState} and Liquidity is {liquidityState}. 
              {isStagflation && " Inflation is also hitting elevated levels."} Consider fading the HMM signal and adopting a defensive posture before the trend officially flips.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Primary Tactical View (Existing Models) */}
        <div className="xl:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-emerald-400" />
            Tactical View (Current Models)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* HMM Model */}
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  HMM Regime Monitor
                </h3>
                <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded">State 1</span>
              </div>
              <div className="text-3xl font-light text-white mb-2">Bullish</div>
              <p className="text-xs text-white/40">3-State Hidden Markov Model</p>
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs">
                <span className="text-white/40">Equities: <span className="text-emerald-400">Overweight</span></span>
                <span className="text-white/40">Bonds: <span className="text-amber-400">Underweight</span></span>
              </div>
            </div>

            {/* Sector Rotation */}
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Sector Rotation
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">Cyclical (XLY, XLF, XLI)</span>
                    <span className="text-emerald-400">+1.2 SD</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 w-[70%]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">Defensive (XLU, XLP, XLV)</span>
                    <span className="text-rose-400">-0.8 SD</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-400 w-[30%]"></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs">
                <span className="text-white/40">Equities: <span className="text-emerald-400">Overweight</span></span>
                <span className="text-white/40">Cmdty: <span className="text-emerald-400">Overweight</span></span>
              </div>
            </div>

            {/* Flight to Safety */}
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 md:col-span-2">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-medium text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Flight to Safety Flows
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#141414] p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-white/40 mb-1">Gold (GLD)</div>
                  <div className="text-lg font-mono text-emerald-400 flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> +2.4%
                  </div>
                </div>
                <div className="bg-[#141414] p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-white/40 mb-1">USD (DXY)</div>
                  <div className="text-lg font-mono text-emerald-400 flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> +0.8%
                  </div>
                </div>
                <div className="bg-[#141414] p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-white/40 mb-1">Treasuries (TLT)</div>
                  <div className="text-lg font-mono text-rose-400 flex items-center gap-1">
                    <ArrowDownRight className="w-4 h-4" /> -1.2%
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between text-xs">
                <span className="text-white/40">Equities: <span className="text-amber-400">Neutral</span></span>
                <span className="text-white/40">Bonds: <span className="text-rose-400">Underweight</span></span>
                <span className="text-white/40">Cmdty: <span className="text-emerald-400">Overweight</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Macro Context Sidebar (New Sensing Models) */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <LineChart className="w-5 h-5 text-indigo-400" />
            Macro Context (Sensing)
          </h2>

          {/* Credit Cycle Sense */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-rose-500"></div>
            <h3 className="text-sm font-medium text-white mb-3 flex items-center justify-between">
              Credit Cycle Sense
              <span className="text-[10px] font-mono text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded">Contracting</span>
            </h3>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">HY Spreads (BAMLH0A0HYM2)</span>
                <span className="text-sm font-mono text-rose-400">4.2% <ArrowUpRight className="w-3 h-3 inline" /></span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">Lending Standards</span>
                <span className="text-sm font-mono text-rose-400">Tightening</span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-wider">
              <span className="text-white/40">EQ: <span className="text-rose-400">UW</span></span>
              <span className="text-white/40">FI: <span className="text-emerald-400">OW</span></span>
              <span className="text-white/40">CO: <span className="text-rose-400">UW</span></span>
            </div>
          </div>

          {/* Global Liquidity Pulse */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-rose-500"></div>
            <h3 className="text-sm font-medium text-white mb-3 flex items-center justify-between">
              Global Liquidity Pulse
              <span className="text-[10px] font-mono text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded">Contracting</span>
            </h3>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">Fed Balance Sheet (WALCL)</span>
                <span className="text-sm font-mono text-rose-400">-1.2T <ArrowDownRight className="w-3 h-3 inline" /></span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">M2 Momentum</span>
                <span className="text-sm font-mono text-rose-400">-0.4% <ArrowDownRight className="w-3 h-3 inline" /></span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-wider">
              <span className="text-white/40">EQ: <span className="text-rose-400">UW</span></span>
              <span className="text-white/40">FI: <span className="text-emerald-400">OW</span></span>
              <span className="text-white/40">CO: <span className="text-rose-400">UW</span></span>
            </div>
          </div>

          {/* Inflation Regime Tracker */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-amber-500"></div>
            <h3 className="text-sm font-medium text-white mb-3 flex items-center justify-between">
              Inflation Regime Tracker
              <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">Elevated</span>
            </h3>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">10Y Breakeven (T10YIE)</span>
                <span className="text-sm font-mono text-amber-400">2.45% <ArrowUpRight className="w-3 h-3 inline" /></span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">Sticky CPI</span>
                <span className="text-sm font-mono text-amber-400">4.1% <ArrowUpRight className="w-3 h-3 inline" /></span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-wider">
              <span className="text-white/40">EQ: <span className="text-rose-400">UW</span></span>
              <span className="text-white/40">FI: <span className="text-rose-400">UW</span></span>
              <span className="text-white/40">CO: <span className="text-emerald-400">OW</span></span>
            </div>
          </div>

          {/* Economic Surprise Index */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500"></div>
            <h3 className="text-sm font-medium text-white mb-3 flex items-center justify-between">
              Economic Surprise (ESI)
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">Positive</span>
            </h3>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white/50">Data vs Expectations</span>
                <span className="text-sm font-mono text-emerald-400">+14.2 <ArrowUpRight className="w-3 h-3 inline" /></span>
              </div>
            </div>
            <div className="pt-3 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-wider">
              <span className="text-white/40">EQ: <span className="text-emerald-400">OW</span></span>
              <span className="text-white/40">FI: <span className="text-rose-400">UW</span></span>
              <span className="text-white/40">CO: <span className="text-emerald-400">OW</span></span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
