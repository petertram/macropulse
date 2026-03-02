import React from 'react';
import { 
  Activity, 
  ArrowUpRight,
  ArrowDownRight,
  Info,
  BarChart,
  Target,
  TrendingUp
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart as ReBarChart,
  Bar,
  ReferenceLine,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const mockHistory = Array.from({ length: 24 }).map((_, i) => ({
  date: new Date(2022, i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  surprise: Math.sin(i / 2) * 40 + Math.random() * 20,
}));

export function EconomicSurprise() {
  const currentESI = 14.2;
  const prevESI = -5.8;
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Economic Surprise Index (ESI)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentESI > 0 ? '+' : ''}{currentESI.toFixed(1)}</div>
            <div className="text-xs font-medium text-emerald-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> 20.0 pts
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Data vs. Analyst Expectations</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Momentum</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">Positive</div>
            <div className="text-xs font-medium text-emerald-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Accelerating
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">3-Month Trend Direction</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Economic Pulse</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Expanding
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Beating Consensus Estimates</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <BarChart className="w-4 h-4 text-emerald-400" />
            Economic Surprise Index History
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={mockHistory}>
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
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <ReferenceLine y={0} stroke="#444" />
                <Bar 
                  dataKey="surprise" 
                  name="ESI Score"
                  radius={[4, 4, 0, 0]}
                >
                  {mockHistory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.surprise > 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            Consensus Accuracy Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorSurprise" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
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
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="surprise" 
                  name="Surprise Momentum"
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorSurprise)" 
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
            <h3 className="text-lg font-semibold text-white mb-2">Economic Surprise Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The Economic Surprise Index (ESI) is currently <strong>Positive</strong> and accelerating. This indicates that macroeconomic data releases (Employment, Retail Sales, Manufacturing) are consistently beating analyst consensus estimates. While this signals economic resilience, it also increases the likelihood of "higher for longer" interest rate policy as the economy remains warmer than anticipated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
