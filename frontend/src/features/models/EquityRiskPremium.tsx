import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Info, RefreshCw, AlertTriangle } from 'lucide-react';
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

interface ERPData {
  forwardPE: number | null;
  earningsYield: number | null;
  dgs10: number | null;
  realYield: number | null;
  fedERP: number | null;
  realERP: number | null;
  gordonERP: number | null;
  fedERPPercentile: number | null;
  regime: string;
  analysis: string;
  history: { date: string; fedERP: number | null; realERP: number | null; sp500: number | null }[];
}

function getRegimeStyle(regime: string) {
  if (regime === 'Cheap') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
  if (regime === 'Very Expensive') return { color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' };
  if (regime === 'Expensive') return { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' };
}

export function EquityRiskPremium() {
  const [data, setData] = useState<ERPData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetch('/api/models/erp')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-white/50">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Computing Equity Risk Premium...</span>
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64 gap-3 text-rose-400">
      <AlertTriangle className="w-5 h-5" />
      <span className="text-sm">Failed to load ERP model. Try syncing data.</span>
    </div>
  );

  const regimeStyle = getRegimeStyle(data.regime);
  const filteredHistory = filterHistoryByRange(data.history, range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const hasMeaningfulHistory = filteredHistory.some(h => h.fedERP !== null || h.realERP !== null);
  const historyChart = filteredHistory.map(h => ({
    date: h.date,
    'Fed ERP': h.fedERP,
    'Real ERP': h.realERP,
    'S&P 500': h.sp500,
  }));
  const tickFormatter = getHistoryTickFormatter(range);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400" /> Methodology — Equity Risk Premium
        </h3>
        <p className="text-xs text-white/60 leading-relaxed">
          The ERP measures the excess return equities must offer over risk-free rates to justify their risk.
          Three measures: <strong>Fed Model ERP</strong> = Earnings Yield − 10Y Nominal (Yardeni/Fed); <strong>Real ERP</strong> = Earnings Yield − TIPS Real Yield (Bridgewater preferred — adjusts for inflation regime); <strong>Gordon ERP</strong> = Earnings Yield + 4% LT GDP Growth − 10Y Nominal (DDM-implied).
          Earnings Yield = 1 / Forward P/E (sourced from Yahoo Finance). High ERP = equities cheap vs bonds; Low/negative ERP = equities expensive.
        </p>
      </div>

      {/* Valuation Banner */}
      <div className={`rounded-2xl border p-6 flex items-center justify-between ${regimeStyle.bg}`}>
        <div>
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1">Equity Valuation Regime</div>
          <div className={`text-4xl font-light font-mono ${regimeStyle.color}`}>{data.regime}</div>
          <div className="text-xs text-white/40 mt-2">vs Risk-Free Rate (Fed Model)</div>
        </div>
        <div className="grid grid-cols-2 gap-6 text-right">
          <div>
            <div className="text-[10px] text-white/30 mb-1">Forward P/E</div>
            <div className="text-xl font-mono text-white">{data.forwardPE != null ? `${data.forwardPE.toFixed(1)}x` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">Earnings Yield</div>
            <div className="text-xl font-mono text-white">{data.earningsYield != null ? `${data.earningsYield.toFixed(2)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">10Y Yield</div>
            <div className="text-xl font-mono text-white">{data.dgs10 != null ? `${data.dgs10.toFixed(2)}%` : 'N/A'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 mb-1">5Y Percentile</div>
            <div className={`text-xl font-mono ${regimeStyle.color}`}>{data.fedERPPercentile != null ? `${data.fedERPPercentile.toFixed(0)}th` : 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* ERP Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Fed Model ERP</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${data.fedERP == null ? 'text-white/40' : data.fedERP > 2 ? 'text-emerald-400' : data.fedERP < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
              {data.fedERP != null ? `${data.fedERP >= 0 ? '+' : ''}${data.fedERP.toFixed(2)}%` : 'N/A'}
            </div>
            {data.fedERP != null && (
              <div className={`text-xs ${data.fedERP > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.fedERP > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 mt-2">Earnings Yield − 10Y Nominal · &gt;2% = Cheap</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Real ERP (vs TIPS)</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${data.realERP == null ? 'text-white/40' : data.realERP > 3 ? 'text-emerald-400' : data.realERP < 1 ? 'text-rose-400' : 'text-amber-400'}`}>
              {data.realERP != null ? `${data.realERP >= 0 ? '+' : ''}${data.realERP.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Earnings Yield − TIPS Real Yield · Bridgewater preferred</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Gordon Growth ERP</div>
          <div className="flex items-baseline gap-2">
            <div className={`text-3xl font-light font-mono ${data.gordonERP == null ? 'text-white/40' : data.gordonERP > 2 ? 'text-emerald-400' : data.gordonERP < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
              {data.gordonERP != null ? `${data.gordonERP >= 0 ? '+' : ''}${data.gordonERP.toFixed(2)}%` : 'N/A'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Earnings Yield + 4% GDP − 10Y · DDM-implied</p>
        </div>
      </div>

      {/* Percentile Bar */}
      {data.fedERPPercentile != null && (
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Fed ERP — 5-Year Percentile</h3>
            <span className={`text-sm font-mono font-bold ${regimeStyle.color}`}>{data.fedERPPercentile.toFixed(0)}th percentile</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${data.fedERPPercentile >= 60 ? 'bg-emerald-500' : data.fedERPPercentile <= 30 ? 'bg-rose-500' : 'bg-amber-500'}`}
              style={{ width: `${data.fedERPPercentile}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-white/30">
            <span>0th — Very Expensive</span><span>50th — Fair Value</span><span>100th — Very Cheap</span>
          </div>
        </div>
      )}

      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-4">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
        />
      </div>

      {/* History Chart */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            {hasMeaningfulHistory ? 'Fed ERP & Real ERP History' : 'S&P 500 Context History'}
          </h3>
          <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
        </div>
        {!hasMeaningfulHistory && (
          <p className="text-[10px] text-white/40 mb-4">
            Historical ERP inputs are not stored in the current database. The live ERP values above are current, and this chart shows S&amp;P 500 context instead of implying a full ERP history.
          </p>
        )}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={30} tickFormatter={tickFormatter} />
              <YAxis
                stroke={CHART_AXIS_COLOR}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => hasMeaningfulHistory ? `${v}%` : `${Math.round(v)}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                formatter={(v: number) => [hasMeaningfulHistory ? `${v?.toFixed(2)}%` : Math.round(v ?? 0).toLocaleString()]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
              {hasMeaningfulHistory ? (
                <>
                  <ReferenceLine y={0} stroke={CHART_REFERENCE_COLOR} strokeDasharray="3 3" />
                  <ReferenceLine y={2} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: '2% Cheap threshold', fill: '#10b98166', fontSize: 9 }} />
                  <Line type="monotone" dataKey="Fed ERP" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="Real ERP" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
                </>
              ) : (
                <Line type="monotone" dataKey="S&P 500" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls />
              )}
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
            <h3 className="text-lg font-semibold text-white mb-2">ERP Analysis</h3>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">{data.analysis}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
