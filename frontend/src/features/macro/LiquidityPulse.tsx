import React from 'react';
import { 
  Activity, 
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Zap,
  DollarSign,
  TrendingDown
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
  fed_balance: 8.5 - i * 0.05 + Math.random() * 0.1,
  m2_momentum: 5 - i * 0.3 + Math.random() * 0.5,
}));

export function LiquidityPulse() {
  const currentBalance = 7.42; // Trillions
  const balanceChange = -1.2; // Trillions from peak
  
  const currentM2 = -0.4; // % YoY
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Fed Balance Sheet (WALCL)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">${currentBalance.toFixed(2)}T</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <ArrowDownRight className="w-3 h-3" /> {Math.abs(balanceChange).toFixed(1)}T
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Quantitative Tightening (QT) Active</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">M2 Money Supply Momentum</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentM2.toFixed(1)}%</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-1" /> Negative
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">YoY % Change (M2SL)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Liquidity Pulse</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Contracting
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Monetary Headwinds</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Fed Balance Sheet Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorFed" x1="0" y1="0" x2="0" y2="1">
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
                  tickFormatter={(v) => `$${v}T`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="fed_balance" 
                  name="Fed Balance Sheet"
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorFed)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            M2 Money Supply Growth
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
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="m2_momentum" 
                  name="M2 YoY %"
                  stroke="#10b981" 
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
            <h3 className="text-lg font-semibold text-white mb-2">Liquidity Pulse Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              Global liquidity is currently in a <strong>Contracting</strong> phase. The Federal Reserve's Quantitative Tightening (QT) program continues to drain reserves from the banking system, while M2 money supply growth has turned negative for the first time in decades. This reduction in the "financial lubricant" typically leads to higher volatility and lower valuation multiples for risk assets.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
