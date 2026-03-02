import React from 'react';
import { 
  LineChart as LineChartIcon, 
  Info,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceArea,
  Legend,
  AreaChart,
  Area
} from 'recharts';

const historicalData = [
  { year: '1999', equities: 100, bonds: 100 },
  { year: '2000', equities: 90, bonds: 110 },
  { year: '2001', equities: 75, bonds: 118 },
  { year: '2002', equities: 58, bonds: 130 },
  { year: '2003', equities: 75, bonds: 135 },
  { year: '2004', equities: 85, bonds: 140 },
  { year: '2005', equities: 90, bonds: 145 },
  { year: '2006', equities: 105, bonds: 150 },
  { year: '2007', equities: 110, bonds: 160 },
  { year: '2008', equities: 65, bonds: 180 },
  { year: '2009', equities: 80, bonds: 175 },
  { year: '2010', equities: 95, bonds: 185 },
  { year: '2011', equities: 95, bonds: 200 },
  { year: '2012', equities: 110, bonds: 205 },
  { year: '2013', equities: 140, bonds: 195 },
  { year: '2014', equities: 155, bonds: 210 },
  { year: '2015', equities: 155, bonds: 215 },
  { year: '2016', equities: 170, bonds: 220 },
  { year: '2017', equities: 205, bonds: 225 },
  { year: '2018', equities: 195, bonds: 225 },
  { year: '2019', equities: 255, bonds: 240 },
  { year: '2020', equities: 295, bonds: 265 },
  { year: '2021', equities: 370, bonds: 255 },
  { year: '2022', equities: 300, bonds: 220 },
  { year: '2023', equities: 375, bonds: 230 },
  { year: '2024', equities: 450, bonds: 235 },
];

const correlationData = [
  { year: '1999', correlation: 0.2 },
  { year: '2000', correlation: -0.1 },
  { year: '2001', correlation: -0.3 },
  { year: '2002', correlation: -0.4 },
  { year: '2003', correlation: -0.2 },
  { year: '2004', correlation: -0.1 },
  { year: '2005', correlation: -0.2 },
  { year: '2006', correlation: -0.3 },
  { year: '2007', correlation: -0.4 },
  { year: '2008', correlation: -0.6 },
  { year: '2009', correlation: -0.5 },
  { year: '2010', correlation: -0.4 },
  { year: '2011', correlation: -0.5 },
  { year: '2012', correlation: -0.3 },
  { year: '2013', correlation: -0.2 },
  { year: '2014', correlation: -0.3 },
  { year: '2015', correlation: -0.4 },
  { year: '2016', correlation: -0.3 },
  { year: '2017', correlation: -0.2 },
  { year: '2018', correlation: -0.1 },
  { year: '2019', correlation: -0.3 },
  { year: '2020', correlation: -0.5 },
  { year: '2021', correlation: 0.1 },
  { year: '2022', correlation: 0.6 },
  { year: '2023', correlation: 0.4 },
  { year: '2024', correlation: 0.2 },
];

const highlightPeriods = [
  { start: '2000', end: '2002', label: 'Dot-Com Bust' },
  { start: '2007', end: '2009', label: 'GFC' },
  { start: '2020', end: '2020', label: 'COVID-19' },
];

export function EconomicCycles() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Section */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400"/> Methodology</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The <strong>Economic Cycles</strong> model tracks the relative performance of Equities (S&P 500) versus Bonds (10-Year US Treasuries) across different macroeconomic regimes. Historically, during expansionary phases, equities outperform as corporate earnings grow. During contractions or recessions (highlighted areas), central banks cut interest rates, causing bond prices to rally and bonds to significantly outperform equities, acting as a portfolio ballast.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Main Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <LineChartIcon className="w-4 h-4 text-emerald-400" />
            Historical Asset Performance (Normalized to 100 in 1999)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="year" 
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
                  itemStyle={{ fontSize: '12px' }}
                  labelStyle={{ color: '#888', marginBottom: '4px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                
                {highlightPeriods.map((period, idx) => (
                  <ReferenceArea 
                    key={idx} 
                    x1={period.start} 
                    x2={period.end} 
                    fill="#3b82f6" 
                    fillOpacity={0.15}
                  />
                ))}

                <Line 
                  type="monotone" 
                  dataKey="equities" 
                  name="Equities (S&P 500)" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#000', strokeWidth: 2 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="bonds" 
                  name="Bonds (10Y US Treasury)" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#000', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-white/40">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500/20 border border-blue-500/50 rounded-sm"></div>
              <span>Recession / Bond Outperformance Periods</span>
            </div>
          </div>
        </div>

        {/* Correlation Chart */}
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            Stock-Bond 3-Year Rolling Correlation
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={correlationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCorrelation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="year" 
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
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px', color: '#f59e0b' }}
                  labelStyle={{ color: '#888', marginBottom: '4px', fontSize: '12px' }}
                  formatter={(value: number) => [value.toFixed(2), 'Correlation']}
                />
                <ReferenceArea y1={0} y2={1} fill="#ef4444" fillOpacity={0.05} />
                <ReferenceArea y1={-1} y2={0} fill="#10b981" fillOpacity={0.05} />
                <Area 
                  type="monotone" 
                  dataKey="correlation" 
                  stroke="#f59e0b" 
                  fillOpacity={1} 
                  fill="url(#colorCorrelation)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-white/40 px-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Negative (Diversification)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span>Positive (Correlated Risk)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden">
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
