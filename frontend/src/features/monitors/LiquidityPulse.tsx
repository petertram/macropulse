import { useState, useEffect } from 'react';
import {
  Activity,
  Info,
  Zap,
  DollarSign,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  AlertTriangle
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
  ComposedChart,
  ReferenceLine
} from 'recharts';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  CHART_REFERENCE_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
  hasMixedCadenceHistory,
} from '../../shared/utils';

interface LiquidityData {
  current: {
    walcl: number | null;
    tga: number | null;
    rrp: number | null;
    netLiquidity: number | null;
    netLiqChange3m: number | null;
    m2YoY: number | null;
    busloansYoY: number | null;
    totalslYoY: number | null;
    mortgage30: number | null;
    pulseStatus: string;
  };
  history: { date: string; displayDate?: string; netLiquidity: number | null; sp500: number | null }[];
  m2History: { date: string; displayDate?: string; m2YoY: number | null; busloansYoY: number | null; totalslYoY: number | null }[];
}

export function LiquidityPulse() {
  const [data, setData] = useState<LiquidityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/liquidity')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-white/50">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Calculating liquidity pulse...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">Failed to load liquidity data. Try syncing FRED data.</span>
      </div>
    );
  }

  const { current, history, m2History } = data;
  const filteredLiquidityHistory = filterHistoryByRange(history, range);
  const filteredM2History = filterHistoryByRange(m2History, range);
  const liquidityCoverage = getHistoryCoverageLabel(history);
  const m2Coverage = getHistoryCoverageLabel(m2History);
  const tickFormatter = getHistoryTickFormatter(range);

  const pulseColor = current.pulseStatus === 'Expansionary'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : current.pulseStatus === 'Contracting'
    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/20';

  const pulseDotColor = current.pulseStatus === 'Expansionary' ? 'bg-emerald-500'
    : current.pulseStatus === 'Contracting' ? 'bg-rose-500'
    : 'bg-amber-500';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Net Liquidity (WALCL-TGA-RRP)</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {current.netLiquidity != null ? `$${current.netLiquidity.toFixed(2)}T` : 'N/A'}
            </div>
            {current.netLiqChange3m != null && (
              <div className={`text-xs font-medium flex items-center ${current.netLiqChange3m >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {current.netLiqChange3m >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {Math.abs(current.netLiqChange3m).toFixed(2)}T (3M)
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">True central bank liquidity injected into markets</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">M2 Money Supply Growth</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">
              {current.m2YoY != null ? `${current.m2YoY.toFixed(1)}%` : 'N/A'}
            </div>
            {current.m2YoY != null && (
              <div className={`text-xs font-medium flex items-center ${current.m2YoY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {current.m2YoY >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {current.m2YoY >= 0 ? 'Positive' : 'Negative'}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">YoY % Change (M2SL)</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Liquidity Pulse</div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 border text-sm font-bold uppercase tracking-widest rounded-lg ${pulseColor}`}>
              {current.pulseStatus}
            </div>
            <div className={`w-2 h-2 rounded-full animate-pulse ${pulseDotColor}`}></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Macro liquidity environment for risk assets</p>
        </div>
      </div>

      {/* Credit Impulse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Bank Credit Impulse (BUSLOANS)</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${current.busloansYoY == null ? 'text-white/60' : current.busloansYoY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {current.busloansYoY != null ? `${current.busloansYoY >= 0 ? '+' : ''}${current.busloansYoY.toFixed(1)}%` : 'N/A'}
            </div>
            {current.busloansYoY != null && (
              <div className={`text-xs font-medium flex items-center ${current.busloansYoY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {current.busloansYoY >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {current.busloansYoY >= 0 ? 'Expanding' : 'Contracting'}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">C&amp;I + commercial loans YoY — leading credit demand indicator</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">Consumer Credit Impulse (TOTALSL)</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${current.totalslYoY == null ? 'text-white/60' : current.totalslYoY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {current.totalslYoY != null ? `${current.totalslYoY >= 0 ? '+' : ''}${current.totalslYoY.toFixed(1)}%` : 'N/A'}
            </div>
            {current.totalslYoY != null && (
              <div className={`text-xs font-medium flex items-center ${current.totalslYoY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {current.totalslYoY >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                {current.totalslYoY >= 0 ? 'Expanding' : 'Contracting'}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Total consumer credit outstanding YoY — household leverage signal</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">30-Year Mortgage Rate</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${current.mortgage30 == null ? 'text-white/60' : current.mortgage30 > 7 ? 'text-rose-400' : current.mortgage30 > 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {current.mortgage30 != null ? `${current.mortgage30.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">30-year fixed rate (MORTGAGE30US) — housing affordability &amp; credit tightness</p>
        </div>
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={liquidityCoverage}
          showMixedCadenceNote={hasMixedCadenceHistory(history)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Net Liquidity vs. S&amp;P 500
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{liquidityCoverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredLiquidityHistory}>
                <defs>
                  <linearGradient id="colorLiq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
                <YAxis yAxisId="left" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}T`} domain={['auto', 'auto']} />
                <YAxis yAxisId="right" orientation="right" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area yAxisId="left" type="monotone" dataKey="netLiquidity" name="Net Liquidity ($T)" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLiq)" connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="sp500" name="S&P 500" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              M2 Money Supply Growth
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{m2Coverage}</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredM2History}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="m2YoY" name="M2 YoY %" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Credit Impulse Chart */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            Bank &amp; Consumer Credit Growth (YoY %)
          </h3>
          <span className="text-[10px] text-white/60 uppercase tracking-wider">{m2Coverage}</span>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredM2History}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
              <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
              <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="busloansYoY" name="Bank Credit (BUSLOANS)" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="totalslYoY" name="Consumer Credit (TOTALSL)" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
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
              Global liquidity is currently in a <strong className="text-white">{current.pulseStatus}</strong> phase.
              {current.pulseStatus === 'Contracting'
                ? " The Federal Reserve's Quantitative Tightening (QT) program combined with negative M2 growth is draining reserves from the banking system. This reduction in the 'financial lubricant' typically leads to higher volatility and lower valuation multiples for risk assets."
                : current.pulseStatus === 'Expansionary'
                ? " Liquidity is increasing, acting as a tailwind for risk asset valuations. Improving M2 growth and easing reserve constraints offer supportive conditions for equities."
                : " The macro liquidity environment remains mixed. Divergences between net reserve conditions and broader money supply growth suggest a transitional period where targeted risk exposure is warranted."}
              <br /><br />
              <em>Net Liquidity</em> = Total Fed Assets (WALCL) − Treasury General Account (WDTGAL) − Reverse Repos (RRPONTSYD). The <em>Bank Credit Impulse</em> (BUSLOANS YoY%) and <em>Consumer Credit Impulse</em> (TOTALSL YoY%) track private-sector credit creation — the engine of money multiplier effects beyond central bank balance sheet operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
