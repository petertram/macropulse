import React from 'react';
import { 
  TrendingUp, 
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Flame,
  Thermometer,
  BarChart3
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
  breakeven: 2.2 + Math.sin(i / 4) * 0.3 + Math.random() * 0.1,
  sticky_cpi: 3.5 + i * 0.05 + Math.random() * 0.2,
}));

export function InflationTracker() {
  const currentBreakeven = 2.45; // %
  const currentSticky = 4.1; // %
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">10Y Breakeven Inflation</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentBreakeven.toFixed(2)}%</div>
            <div className="text-xs font-medium text-amber-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> 0.15%
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Market Expectation (T10YIE)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Sticky Price CPI</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentSticky.toFixed(1)}%</div>
            <div className="text-xs font-medium text-amber-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Rising
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Atlanta Fed Sticky CPI</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Inflation Regime</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Elevated
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Sticky Inflationary Pressure</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-amber-400" />
            10Y Breakeven Inflation Rate
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorBreak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
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
                  dataKey="breakeven" 
                  name="10Y Breakeven"
                  stroke="#f59e0b" 
                  fillOpacity={1} 
                  fill="url(#colorBreak)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-400" />
            Sticky Price CPI Growth
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
                  dataKey="sticky_cpi" 
                  name="Sticky CPI YoY"
                  stroke="#f43f5e" 
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
            <h3 className="text-lg font-semibold text-white mb-2">Inflation Regime Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              Inflation is currently in an <strong>Elevated</strong> regime. While headline CPI may show volatility due to energy prices, the "Sticky Price CPI" (which includes services and housing) remains stubbornly high. Market-based inflation expectations (10Y Breakeven) are also beginning to drift upward. This environment typically favors Commodities and Real Assets while posing a threat to long-duration Fixed Income.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
