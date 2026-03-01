import React from 'react';
import { 
  ArrowRightLeft, 
  TrendingDown,
  Info,
  Activity,
  ArrowUpRight
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
  spread: -0.5 + Math.sin(i / 4) * 0.8 + Math.random() * 0.2,
}));

const currentCurve = [
  { maturity: '1M', yield: 5.35 },
  { maturity: '3M', yield: 5.40 },
  { maturity: '6M', yield: 5.38 },
  { maturity: '1Y', yield: 5.10 },
  { maturity: '2Y', yield: 4.85 },
  { maturity: '5Y', yield: 4.40 },
  { maturity: '10Y', yield: 4.35 },
  { maturity: '30Y', yield: 4.50 },
];

export function YieldCurve() {
  const currentSpread = -0.50; // 10Y-2Y
  const spread3M10Y = -1.05; // 10Y-3M
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Section */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400"/> Methodology</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The Yield Curve model tracks the term structure of US Treasuries. <strong>Inversions</strong> (short-term rates &gt; long-term rates) historically precede recessions. The model also classifies curve dynamics into four regimes: <strong>Bull Steepening</strong> (short rates falling faster than long rates, often bullish for bonds), <strong>Bear Steepening</strong> (long rates rising faster, bearish for bonds), <strong>Bull Flattening</strong> (long rates falling faster), and <strong>Bear Flattening</strong> (short rates rising faster).
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">10Y-2Y Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentSpread.toFixed(2)}%</div>
            <div className="text-xs font-medium text-amber-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> Steepening
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">T10Y2Y</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">10Y-3M Spread</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{spread3M10Y.toFixed(2)}%</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-1" /> Deep Inversion
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">T10Y3M</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Curve Regime</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Bear Steepening
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Long-end yields rising faster</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Current Treasury Yield Curve
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="maturity" 
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
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="yield" 
                  name="Yield"
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0a0a0a' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
            10Y-2Y Spread History
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
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
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="spread" 
                  name="10Y-2Y Spread"
                  stroke="#f59e0b" 
                  fillOpacity={1} 
                  fill="url(#colorSpread)" 
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
            <h3 className="text-lg font-semibold text-white mb-2">Yield Curve Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              The Treasury yield curve remains deeply inverted, particularly at the 3M-10Y segment, signaling persistent restrictive monetary policy and elevated recession risks. However, the 10Y-2Y spread is currently undergoing a <strong>Bear Steepening</strong> phase. Long-end yields are rising faster than short-end yields, often driven by inflation persistence or increased term premium. Historically, the un-inverting of the curve (steepening) from deeply negative territory is the immediate precursor to economic contraction.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
