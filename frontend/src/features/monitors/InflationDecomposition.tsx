import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Flame, Info, RefreshCw, AlertTriangle } from 'lucide-react';
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  CHART_REFERENCE_COLOR,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
} from '../../shared/utils';

interface InflationData {
  current: {
    cpiYoY: number | null;
    pceYoY: number | null;
    corePCEYoY: number | null;
    stickyCPI: number | null;
    flexCPI: number | null;
    breakeven: number | null;
    cshYoY: number | null;
  };
  regime: string;
  history: {
    date: string;
    cpiYoY: number | null;
    pceYoY: number | null;
    corePCEYoY: number | null;
    stickyCPI: number | null;
    flexCPI: number | null;
  }[];
}

function getRegimeStyle(regime: string) {
  if (regime === 'Stagflation') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  if (regime === 'Reflation') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (regime === 'Disinflation') return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; // Anchored
}

function Metric({ label, value, target, note }: { label: string; value: number | null; target?: number; note?: string }) {
  const color = value === null ? 'text-white/60' : target && value > target + 1 ? 'text-rose-400' : target && value < target - 0.5 ? 'text-sky-400' : 'text-amber-400';
  return (
    <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-5">
      <div className="text-xs font-medium text-white/65 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-light font-mono ${color}`}>
        {value !== null ? `${value.toFixed(1)}%` : 'N/A'}
      </div>
      {note && <p className="text-[10px] text-white/55 mt-2">{note}</p>}
    </div>
  );
}

export function InflationDecomposition() {
  const [data, setData] = useState<InflationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/inflation-decomposition')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading inflation decomposition...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load inflation data. Try syncing FRED data.</span>
    </div>
  );

  const { current, regime, history } = data;
  const filteredHistory = filterHistoryByRange(history, range);
  const historyCoverage = getHistoryCoverageLabel(history);
  const chartData = filteredHistory;
  const tickFormatter = getHistoryTickFormatter(range);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Inflation Decomposition
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Tracks five inflation dimensions: <strong>Headline CPI</strong> (CPIAUCSL) and <strong>PCE</strong> (PCEPI, the Fed's preferred measure), <strong>Core PCE</strong> (ex-food & energy), <strong>Sticky CPI</strong> (Atlanta Fed CORESTICKM159 — slow-moving, structural component) vs <strong>Flexible CPI</strong> (FLEXCPIM157 — fast-moving, transitory), plus market-implied <strong>10Y Breakeven</strong> (T10YIE). Regime: Disinflation (falling, below 2%) / Anchored (2–3%) / Reflation (rising &gt;3%) / Stagflation (rising + weak growth).
        </p>
      </div>

      {/* Regime Banner */}
      <div className={`rounded-xl border px-6 py-4 flex items-center justify-between ${getRegimeStyle(regime)}`}>
        <div>
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Inflation Regime</div>
          <div className="text-2xl font-bold">{regime}</div>
        </div>
        <Flame className="w-8 h-8 opacity-40" />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="CPI YoY" value={current.cpiYoY} target={2} note="Headline consumer prices (CPIAUCSL)" />
        <Metric label="PCE YoY" value={current.pceYoY} target={2} note="Fed's preferred measure (PCEPI)" />
        <Metric label="Core PCE YoY" value={current.corePCEYoY} target={2} note="Ex food & energy (PCEPILFE)" />
        <Metric label="10Y Breakeven" value={current.breakeven} target={2} note="Market-implied inflation (T10YIE)" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric label="Sticky CPI (MoM)" value={current.stickyCPI} note="Slow-moving structural inflation (Atlanta Fed)" />
        <Metric label="Flexible CPI (MoM)" value={current.flexCPI} note="Fast-moving transitory component" />
        <Metric label="Case-Shiller HPI YoY" value={current.cshYoY} note="Housing cost inflation proxy (CSUSHPISA)" />
      </div>

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              CPI vs PCE vs Core PCE
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(v: number) => [`${v?.toFixed(1)}%`]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
                <ReferenceLine y={2} stroke={CHART_REFERENCE_COLOR} strokeDasharray="4 4" label={{ value: '2% target', fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                <Line type="monotone" dataKey="cpiYoY" name="CPI YoY" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="pceYoY" name="PCE YoY" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="corePCEYoY" name="Core PCE YoY" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              Sticky vs Flexible CPI (Atlanta Fed Components)
            </h3>
            <span className="text-[10px] text-white/60 uppercase tracking-wider">{historyCoverage}</span>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
                <YAxis stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  formatter={(v: number) => [`${v?.toFixed(1)}%`]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
                <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="stickyCPI" name="Sticky CPI (structural)" stroke="#fb923c" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="flexCPI" name="Flexible CPI (transitory)" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-white/60 mt-3">Sticky CPI reflects structural inflation (shelter, services). Flexible CPI captures transitory pressures (energy, food). Persistent Sticky inflation is harder for the Fed to reduce through rate hikes alone.</p>
        </div>
      </div>
    </div>
  );
}
