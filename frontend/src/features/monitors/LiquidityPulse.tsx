import React, { useMemo } from 'react';
import {
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Zap,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Minus
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
  Legend,
  ComposedChart
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  fredData?: any[];
  rawHistoryData?: any[];
  loading?: boolean;
}

export function LiquidityPulse({ fredData = [], rawHistoryData = [], loading = false }: Props) {
  const chartData = useMemo(() => {
    if (!rawHistoryData || rawHistoryData.length === 0) return [];

    let lastWALCL = 0;
    let lastWDTGAL = 0;
    let lastRRP = 0;
    let lastM2 = 0;

    // Create a map for quick M2 lookups by YYYY-MM
    const m2Map = new Map<string, number>();
    rawHistoryData.forEach(d => {
      if (d.M2SL) {
        m2Map.set(d.date.substring(0, 7), d.M2SL);
      }
    });

    const processed = rawHistoryData.map(d => {
      if (d.WALCL) lastWALCL = d.WALCL;
      if (d.WDTGAL) lastWDTGAL = d.WDTGAL;
      if (d.RRPONTSYD) lastRRP = d.RRPONTSYD;
      if (d.M2SL) lastM2 = d.M2SL;

      const walclT = lastWALCL / 1000000;
      const tgaT = lastWDTGAL / 1000000;
      const rrpT = lastRRP / 1000;

      const netLiquidity = walclT > 0 ? (walclT - tgaT - rrpT) : null;

      // Calculate M2 YoY
      let m2YoY = null;
      if (lastM2 > 0) {
        const dDate = new Date(d.date);
        const prevYear = dDate.getFullYear() - 1;
        const prevMonthStr = `${prevYear}-${String(dDate.getMonth() + 1).padStart(2, '0')}`;
        const prevM2 = m2Map.get(prevMonthStr);
        if (prevM2) {
          m2YoY = ((lastM2 / prevM2) - 1) * 100;
        }
      }

      return {
        date: d.date,
        displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        netLiquidity: netLiquidity ? parseFloat(netLiquidity.toFixed(3)) : null,
        m2YoY: m2YoY !== null ? parseFloat(m2YoY.toFixed(2)) : null,
        sp500: d.SP500 ? parseFloat(d.SP500.toFixed(0)) : null
      };
    });

    // filter to last 5 years for chart
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const startDateStr = fiveYearsAgo.toISOString().split('T')[0];

    return processed.filter(d => d.date >= startDateStr);
  }, [rawHistoryData]);

  const latestStats = useMemo(() => {
    const getVal = (id: string) => fredData.find(d => d.id === id)?.value || 0;
    const walclT = getVal('WALCL') / 1000000;
    const tgaT = getVal('WDTGAL') / 1000000;
    const rrpT = getVal('RRPONTSYD') / 1000;

    const currentNetLiquidity = (walclT > 0 && tgaT > 0) ? (walclT - tgaT - rrpT) : 0;

    // Get last year's M2 YoY from chartData
    const lastValidM2YoY = [...chartData].reverse().find(d => d.m2YoY !== null)?.m2YoY || 0;

    return {
      walclT,
      currentNetLiquidity,
      m2YoY: lastValidM2YoY
    };
  }, [fredData, chartData]);

  // Determine pulse status by looking back roughly 3 months (90 days)
  const threeMonthsAgoDate = new Date();
  threeMonthsAgoDate.setDate(threeMonthsAgoDate.getDate() - 90);
  const threeMonthsAgoStr = threeMonthsAgoDate.toISOString().split('T')[0];
  const oldLiqPoint = chartData.find(d => d.date >= threeMonthsAgoStr && d.netLiquidity !== null);
  const liq3MoChange = oldLiqPoint && latestStats.currentNetLiquidity > 0
    ? latestStats.currentNetLiquidity - oldLiqPoint.netLiquidity
    : 0;

  const pulseStatus = (liq3MoChange > 0 && latestStats.m2YoY > 0) ? 'Expansionary'
    : (liq3MoChange < 0 && latestStats.m2YoY < 0) ? 'Contracting'
      : 'Mixed / Neutral';
  const pulseColor = pulseStatus === 'Expansionary' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : pulseStatus === 'Contracting' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  const pulseDotColor = pulseStatus === 'Expansionary' ? 'bg-emerald-500'
    : pulseStatus === 'Contracting' ? 'bg-rose-500'
      : 'bg-amber-500';

  if (loading || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500/80 rounded-full animate-spin"></div>
        <div className="text-white/50 text-sm animate-pulse tracking-widest uppercase">Calculating Liquidity Pulse...</div>
        <div className="text-white/30 text-xs">Waiting for real FRED data to sync.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Net Liquidity (WALCL-TGA-RRP)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">${latestStats.currentNetLiquidity.toFixed(2)}T</div>
            <div className={cn("text-xs font-medium flex items-center", liq3MoChange >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {liq3MoChange >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(liq3MoChange).toFixed(2)}T (3M)
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">True central bank liquidity injected into markets</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">M2 Money Supply Growth</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{latestStats.m2YoY.toFixed(1)}%</div>
            <div className={cn("text-xs font-medium flex items-center", latestStats.m2YoY >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {latestStats.m2YoY >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {latestStats.m2YoY >= 0 ? "Positive" : "Negative"}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">YoY % Change (M2SL)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Liquidity Pulse</div>
          <div className="flex items-center gap-3">
            <div className={cn("px-3 py-1 border text-sm font-bold uppercase tracking-widest rounded-lg", pulseColor)}>
              {pulseStatus}
            </div>
            <div className={cn("w-2 h-2 rounded-full animate-pulse", pulseDotColor)}></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Macro liquidity environment for risk assets</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            Net Liquidity vs. S&P 500
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorLiq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="#444"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#3b82f6"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}T`}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#10b981"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="netLiquidity"
                  name="Net Liquidity"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorLiq)"
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sp500"
                  name="S&P 500"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            M2 Money Supply Growth
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="#444"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
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
                  labelStyle={{ color: '#fff' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="m2YoY"
                  name="M2 YoY %"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
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
              Global liquidity is currently in a <strong className="text-white">{pulseStatus}</strong> phase.
              {pulseStatus === 'Contracting' ? " The Federal Reserve's Quantitative Tightening (QT) program combined with negative M2 growth is draining reserves from the banking system. This reduction in the 'financial lubricant' typically leads to higher volatility and lower valuation multiples for risk assets."
                : pulseStatus === 'Expansionary' ? " Liquidity is increasing, acting as a tailwind for risk asset valuations. Improving M2 growth and easing reserve constraints offer supportive conditions for equities."
                  : " The macro liquidity environment remains mixed. Divergences between net reserve conditions and broader money supply growth suggest a transitional period where targeted risk exposure is warranted."}
              <br /><br />
              <em>Net Liquidity</em> is calculated as Total Fed Assets (WALCL) minus the Treasury General Account (WDTGAL) minus Reverse Repos (RRPONTSYD). This isolates the true amount of central bank cash available to fuel financial markets.
            </p>
          </div>
        </div>
      </div>

      {/* Debug Card (Temporary) */}
      <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-6">
        <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-4">Data Debug Panel</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[10px] items-start">
          <div className="bg-black/50 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 mb-1">FredData Length</div>
            <div className="text-white font-mono">{fredData?.length || 0} items</div>
          </div>
          <div className="bg-black/50 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 mb-1">History Length</div>
            <div className="text-white font-mono">{rawHistoryData?.length || 0} items</div>
          </div>
          <div className="bg-black/50 p-3 rounded-lg border border-white/5 overflow-hidden">
            <div className="text-white/40 mb-1">Latest Observations</div>
            <div className="text-[9px] text-white/60 font-mono leading-tight">
              {fredData.filter(d => ['WALCL', 'WDTGAL', 'M2SL'].includes(d.id)).map(d => (
                <div key={d.id}>{d.id}: {d.value}</div>
              ))}
            </div>
          </div>
          <div className="bg-black/50 p-3 rounded-lg border border-white/5 overflow-hidden">
            <div className="text-white/40 mb-1">Sample History Keys (Latest)</div>
            <div className="text-[9px] text-white/60 font-mono leading-tight whitespace-pre">
              {rawHistoryData.length > 0 && JSON.stringify(Object.keys(rawHistoryData[rawHistoryData.length - 1]), null, 1)}
            </div>
          </div>
        </div>
        <p className="text-[9px] text-amber-500/50 mt-4 italic">* If counts are 0, data is not reaching the component via props. If WALCL is missing keys, the sync didn't fetch it.</p>
      </div>
    </div>
  );
}
