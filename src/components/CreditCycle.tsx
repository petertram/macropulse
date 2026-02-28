import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Info
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
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const mockHistory = Array.from({ length: 24 }).map((_, i) => ({
  date: new Date(2022, i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  hy_spread: 3.5 + Math.sin(i / 3) + (i > 18 ? 0.5 : 0),
  lending_standards: 10 + i * 2 + Math.random() * 5,
}));

export function CreditCycle() {
  const currentSpread = 4.2;
  const prevSpread = 3.8;
  const spreadChange = ((currentSpread - prevSpread) / prevSpread) * 100;
  
  const currentStandards = 45.5; // Net % tightening
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">HY Option-Adjusted Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentSpread.toFixed(2)}%</div>
            <div className={cn("text-xs font-medium flex items-center", spreadChange > 0 ? "text-rose-400" : "text-emerald-400")}>
              {spreadChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(spreadChange).toFixed(1)}%
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">FRED: BAMLH0A0HYM2</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Bank Lending Standards</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentStandards}%</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Tightening
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Net % of Banks Tightening (SLOOS)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Cycle Posture</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Contracting
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Late Cycle / Recessionary Risk</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            HY Spread vs. Lending Standards
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
                  yAxisId="left"
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="hy_spread" 
                  name="HY Spread"
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={false}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="lending_standards" 
                  name="Lending Standards"
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            Default Risk Probability
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
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
                <Area 
                  type="monotone" 
                  dataKey="lending_standards" 
                  name="Default Risk Proxy"
                  stroke="#f43f5e" 
                  fillOpacity={1} 
                  fill="url(#colorRisk)" 
                />
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
            <h3 className="text-lg font-semibold text-white mb-2">Credit Cycle Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The Credit Cycle is currently in a <strong>Contracting</strong> phase. Historically, when bank lending standards tighten (SLOOS) and high-yield spreads begin to widen, it signals a significant reduction in the availability of capital. This environment is typically hostile for small-cap equities and highly leveraged companies. We recommend an <strong>Underweight</strong> posture in Equities and a shift toward high-quality Fixed Income.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
