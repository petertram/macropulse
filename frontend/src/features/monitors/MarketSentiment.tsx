import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Activity,
  Sparkles,
  RefreshCw,
  Gauge,
  AlertTriangle,
  Zap
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
import { HistoryRangeTabs, useHistoryRange } from '../../shared/components/HistoryRangeTabs';
import {
  CHART_AXIS_COLOR,
  CHART_AXIS_TICK,
  CHART_GRID_COLOR,
  CHART_REFERENCE_COLOR,
  cn,
  filterHistoryByRange,
  getHistoryCoverageLabel,
  getHistoryTickFormatter,
} from '../../shared/utils';

interface SentimentData {
  composite: number;
  regime: string;
  institutional: number;
  consumer: number;
  momentum: { value: number; label: string };
  divergence: { value: number; isDiverging: boolean };
  components: {
    id: string;
    name: string;
    score: number;
    weight: number;
    rawValue: number | null;
  }[];
  history: {
    date: string;
    composite: number;
    institutional: number;
    consumer: number;
  }[];
  analysis: string;
}

export function MarketSentiment() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [range, setRange] = useHistoryRange();

  useEffect(() => {
    fetchData();
    fetchSyncStatus();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sentiment');
      if (!response.ok) throw new Error('Failed to fetch sentiment data');
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/fred/sync-status');
      const result = await response.json();
      if (result.lastSyncDate) {
        setLastSync(result.lastSyncDate);
      }
    } catch (err) {
      console.error('Failed to fetch sync status', err);
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'Extreme Fear': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'Fear': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'Greed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Extreme Greed': return 'text-emerald-500 bg-emerald-500/20 border-emerald-500/30';
      default: return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-white/40 font-mono uppercase tracking-widest text-center">
          Analyzing Macro Sentiment Channels...<br />
          <span className="text-[10px]">Normalizing FRED & Yahoo Finance Data</span>
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-rose-500/5 border border-rose-500/20 rounded-2xl flex items-center gap-4">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        <div>
          <h3 className="text-white font-semibold">Data Connection Error</h3>
          <p className="text-sm text-rose-400/80">{error}. Ensure the backend server is running.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredHistory = filterHistoryByRange(data.history, range);
  const historyCoverage = getHistoryCoverageLabel(data.history);
  const tickFormatter = getHistoryTickFormatter(range);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Section */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-400" /> Composite Sentiment Index
          </h3>
          {lastSync && (
            <div className="text-[10px] font-mono text-white/30 uppercase text-right">
              Data Updated:<br />{new Date(lastSync).toLocaleString()}
            </div>
          )}
        </div>
        <p className="text-xs text-white/60 leading-relaxed">
          Our proprietary <strong>Fear & Greed Composite</strong> aggregates 7 real-time macro indicators across institutional positioning (VIX, HY Spreads, Financial Stress), market structure (Defensive/Cyclical ratio), and consumer sentiment (U. Michigan, Policy Uncertainty). Each metric is normalized to its 1-year percentile rank. <strong>Extremes often signal powerful contrarian reversals.</strong>
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-5">
            <Gauge className="w-16 h-16 text-white" />
          </div>
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Composite Sentiment</div>
          <div className="flex items-baseline gap-2">
            <div className="text-4xl font-light text-white font-mono">{data.composite}</div>
            <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border", getRegimeColor(data.regime))}>
              {data.regime}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Scale: 0 (Extreme Fear) — 100 (Extreme Greed)</p>
          <div className="h-1.5 w-full bg-white/5 rounded-full mt-4 overflow-hidden">
            <div
              className={cn("h-full transition-all duration-1000",
                data.composite < 25 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' :
                  data.composite < 45 ? 'bg-orange-500' :
                    data.composite < 65 ? 'bg-indigo-500' :
                      'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
              )}
              style={{ width: `${data.composite}%` }}
            />
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Institutional Position</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{data.institutional}</div>
            <div className={cn("text-xs font-medium flex items-center", data.institutional < 50 ? 'text-rose-400' : 'text-emerald-400')}>
              {data.institutional < 50 ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
              {data.institutional < 40 ? 'Risk Aversion' : data.institutional > 60 ? 'Risk On' : 'Neutral'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">VIX + HY Spreads + Financial Conditions</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Consumer Confidence</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{data.consumer}</div>
            <div className={cn("text-xs font-medium flex items-center", data.consumer < 50 ? 'text-rose-400' : 'text-emerald-400')}>
              {data.consumer < 50 ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
              {data.consumer < 40 ? 'Pessimism' : data.consumer > 60 ? 'Optimism' : 'Stable'}
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">U. Michigan + Policy Uncertainty</p>
        </div>
      </div>

      {/* Main Analysis and Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <div className="flex items-start gap-4 relative">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shrink-0">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="space-y-4 w-full">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  Market Pulse Analysis
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-mono uppercase">Live Synthesis</span>
                </h3>
              </div>

              <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                <p className="text-sm text-white/80 leading-relaxed italic">
                  "{data.analysis}"
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#141414] p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase font-bold mb-1">Momentum Status</div>
                  <div className="flex items-center gap-2">
                    <Activity className={cn("w-4 h-4", data.momentum.value >= 0 ? 'text-emerald-400' : 'text-rose-400')} />
                    <span className="text-xs text-white/80 font-medium tracking-tight">
                      {data.momentum.label.charAt(0).toUpperCase() + data.momentum.label.slice(1)}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">({data.momentum.value > 0 ? '+' : ''}{data.momentum.value} pts)</span>
                  </div>
                </div>
                <div className="bg-[#141414] p-3 rounded-lg border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase font-bold mb-1">Divergence Signal</div>
                  <div className="flex items-center gap-2">
                    <Zap className={cn("w-4 h-4", data.divergence.isDiverging ? 'text-amber-400' : 'text-white/20')} />
                    <span className="text-xs text-white/80 font-medium tracking-tight">
                      {data.divergence.isDiverging ? 'Significant Divergence' : 'Aligned Channels'}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">({data.divergence.value} pt spread)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6 flex flex-col">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-6 text-center">Component Loadings</h3>
          <div className="w-full space-y-4">
            {data.components.map(comp => (
              <div key={comp.id} className="space-y-1">
                <div className="flex justify-between text-[10px] font-medium">
                  <span className="text-white/60 truncate mr-2">{comp.name}</span>
                  <span className={cn("font-mono", comp.score < 30 ? 'text-rose-400' : comp.score > 70 ? 'text-emerald-400' : 'text-white/40')}>
                    {comp.score}
                  </span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-1000",
                      comp.score < 30 ? 'bg-rose-500' :
                        comp.score > 70 ? 'bg-emerald-500' : 'bg-indigo-500/40'
                    )}
                    style={{ width: `${comp.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
        <HistoryRangeTabs
          value={range}
          onChange={setRange}
          coverageLabel={historyCoverage}
          className="mb-8"
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Historical Sentiment Channels
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[10px] text-white/35 uppercase tracking-wider">{historyCoverage}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Composite</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Institutional</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Consumer</span>
            </div>
          </div>
        </div>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory}>
              <defs>
                <linearGradient id="colorComposite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                stroke={CHART_AXIS_COLOR}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickFormatter}
                minTickGap={30}
              />
              <YAxis
                stroke={CHART_AXIS_COLOR}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                labelFormatter={(str) => new Date(str).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              />
              <ReferenceLine y={50} stroke={CHART_REFERENCE_COLOR} strokeDasharray="5 5" />
              <ReferenceLine y={25} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.3} label={{ value: 'FEAR', position: 'right', fill: '#f43f5e', fontSize: 8, fontWeight: 'bold' }} />
              <ReferenceLine y={75} stroke="#10b981" strokeDasharray="3 3" opacity={0.3} label={{ value: 'GREED', position: 'right', fill: '#10b981', fontSize: 8, fontWeight: 'bold' }} />

              <Line
                type="monotone"
                dataKey="institutional"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                opacity={0.5}
                name="Institutional Score"
              />
              <Line
                type="monotone"
                dataKey="consumer"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                opacity={0.5}
                name="Consumer Score"
              />
              <Area
                type="monotone"
                dataKey="composite"
                name="Composite Score"
                stroke="#6366f1"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorComposite)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
