import React from 'react';
import { 
  ShieldAlert, 
  TrendingUp,
  AlertTriangle,
  Info,
  Activity
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
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const mockHistory = Array.from({ length: 24 }).map((_, i) => ({
  date: new Date(2022, i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  probability: Math.max(5, Math.min(95, 10 + i * 3 + Math.random() * 15)),
  sahm: Math.max(0, 0.1 + (i > 12 ? (i - 12) * 0.05 : 0) + Math.random() * 0.1),
}));

export function RecessionProbability() {
  const currentProb = 68.5;
  const currentSahm = 0.52;
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Section */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400"/> Methodology</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Recession Probability model synthesizes two primary leading indicators: The <strong>Sahm Rule</strong> and the <strong>Yield Curve Inversion (10Y-3M)</strong>. The Sahm Rule signals the start of a recession when the three-month moving average of the national unemployment rate rises by 0.50 percentage points or more relative to its low during the previous 12 months. The 12-month forward probability uses a probit model based on the spread between 10-Year Treasury Constant Maturity and 3-Month Treasury Bill.
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Composite Recession Probability</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentProb.toFixed(1)}%</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Rising
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">12-Month Forward Outlook</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Sahm Rule Indicator</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentSahm.toFixed(2)}</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <AlertTriangle className="w-3 h-3 mr-1" /> Triggered
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Threshold: 0.50</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Risk Level</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Elevated
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Defensive Posture Recommended</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Recession Probability Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="probability" 
                  name="Probability"
                  stroke="#f43f5e" 
                  fillOpacity={1} 
                  fill="url(#colorProb)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Sahm Rule Real-Time Indicator
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <ReferenceLine y={0.5} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: 'Recession Threshold (0.5)', fill: '#f43f5e', fontSize: 10 }} />
                <Line 
                  type="monotone" 
                  dataKey="sahm" 
                  name="Sahm Indicator"
                  stroke="#f59e0b" 
                  strokeWidth={2} 
                  dot={false}
                />
              </LineChart>
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
            <h3 className="text-lg font-semibold text-white mb-2">Recession Risk Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The composite recession probability has reached <strong>Elevated</strong> levels. The Sahm Rule indicator, which tracks the 3-month moving average of the unemployment rate relative to its 12-month low, has crossed the critical 0.50 threshold. Combined with leading economic indicators (LEI) contraction and yield curve dynamics, the model suggests a high likelihood of a formal NBER recession declaration within the next 6-9 months. A defensive asset allocation posture is strongly recommended.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
