import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  Info,
  BarChart3,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Score = -1 | 0 | 1;
type FinalScore = -3 | -2 | -1 | 0 | 1 | 2 | 3;

interface PillarData {
  score: Score;
  value: string;
  breakdown: string;
}

interface SectorData {
  id: string;
  sector: string;
  ticker?: string;
  momentum: PillarData;
  fundamental: PillarData;
  macro: PillarData;
  relativeStrength: PillarData;
  finalScore: FinalScore;
}

const mockDataEU: SectorData[] = [
  {
    id: 'eu_banks', sector: 'Banks',
    momentum: { score: 1, value: '+32.1%', breakdown: 'Top 3 in region (12m return)' },
    fundamental: { score: 1, value: '7.5x', breakdown: 'Forward P/E < 90% of 5yr mean' },
    macro: { score: 1, value: 'Expanding', breakdown: 'Positive employment trend (3m)' },
    relativeStrength: { score: 1, value: '+8.2%', breakdown: 'Sector return exceeds benchmark by >5%' },
    finalScore: 3
  },
  {
    id: 'eu_tech', sector: 'Technology',
    momentum: { score: 1, value: '+28.4%', breakdown: 'Top 3 in region (12m return)' },
    fundamental: { score: -1, value: '24.2x', breakdown: 'Forward P/E > 110% of 5yr mean' },
    macro: { score: 1, value: 'Expanding', breakdown: 'Positive production trend (3m)' },
    relativeStrength: { score: 0, value: '+2.1%', breakdown: 'Sector return within ±5% of benchmark' },
    finalScore: 1
  },
  {
    id: 'eu_health', sector: 'Healthcare',
    momentum: { score: 0, value: '+15.2%', breakdown: 'Middle tier in region (12m return)' },
    fundamental: { score: 0, value: '16.5x', breakdown: 'Forward P/E near 5yr mean' },
    macro: { score: 0, value: 'Stable', breakdown: 'Neutral employment trend (3m)' },
    relativeStrength: { score: 0, value: '-1.3%', breakdown: 'Sector return within ±5% of benchmark' },
    finalScore: 0
  },
  {
    id: 'eu_ind', sector: 'Industrials',
    momentum: { score: 1, value: '+22.5%', breakdown: 'Top 3 in region (12m return)' },
    fundamental: { score: 0, value: '14.8x', breakdown: 'Forward P/E near 5yr mean' },
    macro: { score: 1, value: 'Expanding', breakdown: 'Positive production trend (3m)' },
    relativeStrength: { score: 0, value: '+3.4%', breakdown: 'Sector return within ±5% of benchmark' },
    finalScore: 2
  },
  {
    id: 'eu_cons', sector: 'Consumer Goods',
    momentum: { score: -1, value: '+2.1%', breakdown: 'Bottom 3 in region (12m return)' },
    fundamental: { score: -1, value: '22.4x', breakdown: 'Forward P/E > 110% of 5yr mean' },
    macro: { score: -1, value: 'Contracting', breakdown: 'Negative employment trend (3m)' },
    relativeStrength: { score: -1, value: '-7.6%', breakdown: 'Sector return lags benchmark by >5%' },
    finalScore: -3
  },
  {
    id: 'eu_energy', sector: 'Energy',
    momentum: { score: -1, value: '-4.5%', breakdown: 'Bottom 3 in region (12m return)' },
    fundamental: { score: 1, value: '8.2x', breakdown: 'Forward P/E < 90% of 5yr mean' },
    macro: { score: -1, value: 'Contracting', breakdown: 'Negative production trend (3m)' },
    relativeStrength: { score: 0, value: '-2.1%', breakdown: 'Sector return within ±5% of benchmark' },
    finalScore: -1
  }
];

// --- Helpers ---

const getBadgeStyle = (score: FinalScore) => {
  switch (score) {
    case 3: return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
    case 2: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 1: return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 0: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    case -1: return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case -2: return 'bg-red-500/20 text-red-400 border-red-500/30';
    case -3: return 'bg-rose-600/20 text-rose-300 border-rose-600/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
};

const getBadgeLabel = (score: FinalScore) => {
  switch (score) {
    case 3: return '+3 Max OW';
    case 2: return '+2 Strong OW';
    case 1: return '+1 OW';
    case 0: return '0 Neutral';
    case -1: return '-1 UW';
    case -2: return '-2 Strong UW';
    case -3: return '-3 Max UW';
    default: return '0 Neutral';
  }
};

const getTrendIcon = (score: Score) => {
  switch (score) {
    case 1: return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    case -1: return <TrendingDown className="w-4 h-4 text-red-400" />;
    case 0: return <Minus className="w-4 h-4 text-slate-400" />;
  }
};

const getScoreColor = (score: Score) => {
  switch (score) {
    case 1: return 'text-emerald-400';
    case -1: return 'text-red-400';
    case 0: return 'text-slate-400';
  }
};

type SortKey = 'sector' | 'momentum' | 'fundamental' | 'macro' | 'relativeStrength' | 'finalScore';

export function SectorScorecard() {
  const [region, setRegion] = useState<'us' | 'eu'>('us');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'finalScore',
    direction: 'desc'
  });
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Live data fetching for US sectors
  const [usData, setUsData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchUsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sectors/us');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setUsData(json);
      setLastFetched(new Date());
    } catch (err: any) {
      console.error('[SectorScorecard] Fetch error:', err);
      setError(err.message || 'Failed to fetch sector data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsData();
  }, []);

  const data = region === 'us' ? usData : mockDataEU;

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    sortableItems.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case 'sector':
          aValue = a.sector;
          bValue = b.sector;
          break;
        case 'momentum':
          aValue = a.momentum.score;
          bValue = b.momentum.score;
          break;
        case 'fundamental':
          aValue = a.fundamental.score;
          bValue = b.fundamental.score;
          break;
        case 'macro':
          aValue = a.macro.score;
          bValue = b.macro.score;
          break;
        case 'relativeStrength':
          aValue = a.relativeStrength.score;
          bValue = b.relativeStrength.score;
          break;
        case 'finalScore':
          aValue = a.finalScore;
          bValue = b.finalScore;
          break;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [data, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const toggleExpand = (id: string) => {
    setExpandedSector(expandedSector === id ? null : id);
  };

  return (
    <div className="flex flex-col xl:flex-row gap-4 h-full">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 gap-4 h-full">

        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f0f0f] p-3 rounded-xl border border-white/10 shrink-0">
          <div className="flex items-center gap-2 bg-[#1a1a1a] p-1 rounded-lg border border-white/5">
            <button
              onClick={() => setRegion('us')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                region === 'us'
                  ? "bg-[#2a2a2a] text-white shadow-sm border border-white/10"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
              )}
            >
              <Globe className="w-4 h-4" />
              US S&P 500
            </button>
            <button
              onClick={() => setRegion('eu')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                region === 'eu'
                  ? "bg-[#2a2a2a] text-white shadow-sm border border-white/10"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
              )}
            >
              <Globe className="w-4 h-4" />
              EuroStoxx 600
            </button>
          </div>

          <div className="flex items-center gap-2">
            {region === 'us' && (
              <button
                onClick={fetchUsData}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 font-mono bg-white/5 hover:bg-white/10 px-3 py-2 rounded-md border border-white/5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                Refresh
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-white/40 font-mono bg-white/5 px-3 py-2 rounded-md border border-white/5">
              <Clock className="w-3.5 h-3.5" />
              {region === 'us' && lastFetched
                ? `Fetched: ${lastFetched.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                : `Last Updated: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              }
            </div>
          </div>
        </div>

        {/* Scorecard Table */}
        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse relative">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/10 bg-[#141414]">
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('sector')}>
                    <div className="flex items-center gap-1">
                      Sector {sortConfig.key === 'sector' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('momentum')}>
                    <div className="flex items-center gap-1">
                      Momentum {sortConfig.key === 'momentum' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('fundamental')}>
                    <div className="flex items-center gap-1">
                      Fundamental {sortConfig.key === 'fundamental' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('macro')}>
                    <div className="flex items-center gap-1">
                      Macro {sortConfig.key === 'macro' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('relativeStrength')}>
                    <div className="flex items-center gap-1">
                      Rel. Strength {sortConfig.key === 'relativeStrength' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                  <th className="p-3 font-medium text-xs uppercase tracking-wider text-white/50 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort('finalScore')}>
                    <div className="flex items-center gap-1">
                      Final Score {sortConfig.key === 'finalScore' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading && region === 'us' ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                        <span className="text-sm text-white/50">Fetching live sector data from Yahoo Finance & FRED...</span>
                      </div>
                    </td>
                  </tr>
                ) : error && region === 'us' ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                        <span className="text-sm text-red-400">{error}</span>
                        <button
                          onClick={fetchUsData}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                        >
                          Try again
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <span className="text-sm text-white/40">No sector data available</span>
                    </td>
                  </tr>
                ) : sortedData.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={cn(
                        "group cursor-pointer transition-colors hover:bg-white/[0.02]",
                        expandedSector === row.id ? "bg-white/[0.02]" : ""
                      )}
                      onClick={() => toggleExpand(row.id)}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-1.5 h-6 rounded-full",
                            row.finalScore > 0 ? "bg-emerald-500" : row.finalScore < 0 ? "bg-red-500" : "bg-slate-500"
                          )} />
                          <div>
                            <div className="font-medium text-white flex items-center gap-2 text-sm">
                              {row.sector}
                              {row.ticker && <span className="text-[10px] text-white/30 font-mono px-1.5 py-0.5 bg-white/5 rounded border border-white/10">{row.ticker}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getTrendIcon(row.momentum.score)}
                          <span className={cn("font-mono text-xs", getScoreColor(row.momentum.score))}>
                            {row.momentum.score > 0 ? '+' : ''}{row.momentum.score}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getTrendIcon(row.fundamental.score)}
                          <span className={cn("font-mono text-xs", getScoreColor(row.fundamental.score))}>
                            {row.fundamental.score > 0 ? '+' : ''}{row.fundamental.score}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getTrendIcon(row.macro.score)}
                          <span className={cn("font-mono text-xs", getScoreColor(row.macro.score))}>
                            {row.macro.score > 0 ? '+' : ''}{row.macro.score}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getTrendIcon(row.relativeStrength.score)}
                          <span className={cn("font-mono text-xs", getScoreColor(row.relativeStrength.score))}>
                            {row.relativeStrength.score > 0 ? '+' : ''}{row.relativeStrength.score}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border",
                          getBadgeStyle(row.finalScore)
                        )}>
                          {getBadgeLabel(row.finalScore)}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Pillar Breakdown */}
                    {expandedSector === row.id && (
                      <tr className="bg-[#0a0a0a] border-b border-white/5">
                        <td colSpan={6} className="p-0">
                          <div className="px-6 py-4 flex flex-col gap-3 border-l-2 border-indigo-500/50 ml-4 my-2 rounded-r-lg bg-gradient-to-r from-indigo-500/5 to-transparent">
                            <h4 className="text-xs font-medium text-white flex items-center gap-2">
                              <Info className="w-3 h-3 text-indigo-400" />
                              Pillar Breakdown Logic
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {/* Momentum Breakdown */}
                              <div className="bg-[#141414] border border-white/10 rounded-lg p-2.5">
                                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Momentum</div>
                                <div className="flex items-end gap-2 mb-1">
                                  <span className="text-sm font-mono text-white">{row.momentum.value}</span>
                                  <span className={cn("text-[10px] font-medium mb-0.5", getScoreColor(row.momentum.score))}>
                                    Score: {row.momentum.score > 0 ? '+' : ''}{row.momentum.score}
                                  </span>
                                </div>
                                <p className="text-[10px] text-white/60 leading-tight">{row.momentum.breakdown}</p>
                              </div>

                              {/* Fundamental Breakdown */}
                              <div className="bg-[#141414] border border-white/10 rounded-lg p-2.5">
                                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Fundamental (P/E)</div>
                                <div className="flex items-end gap-2 mb-1">
                                  <span className="text-sm font-mono text-white">{row.fundamental.value}</span>
                                  <span className={cn("text-[10px] font-medium mb-0.5", getScoreColor(row.fundamental.score))}>
                                    Score: {row.fundamental.score > 0 ? '+' : ''}{row.fundamental.score}
                                  </span>
                                </div>
                                <p className="text-[10px] text-white/60 leading-tight">{row.fundamental.breakdown}</p>
                              </div>

                              {/* Macro Breakdown */}
                              <div className="bg-[#141414] border border-white/10 rounded-lg p-2.5">
                                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Macro Trend</div>
                                <div className="flex items-end gap-2 mb-1">
                                  <span className="text-sm font-mono text-white">{row.macro.value}</span>
                                  <span className={cn("text-[10px] font-medium mb-0.5", getScoreColor(row.macro.score))}>
                                    Score: {row.macro.score > 0 ? '+' : ''}{row.macro.score}
                                  </span>
                                </div>
                                <p className="text-[10px] text-white/60 leading-tight">{row.macro.breakdown}</p>
                              </div>

                              {/* Relative Strength Breakdown */}
                              <div className="bg-[#141414] border border-white/10 rounded-lg p-2.5">
                                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Rel. Strength vs SPY</div>
                                <div className="flex items-end gap-2 mb-1">
                                  <span className="text-sm font-mono text-white">{row.relativeStrength.value}</span>
                                  <span className={cn("text-[10px] font-medium mb-0.5", getScoreColor(row.relativeStrength.score))}>
                                    Score: {row.relativeStrength.score > 0 ? '+' : ''}{row.relativeStrength.score}
                                  </span>
                                </div>
                                <p className="text-[10px] text-white/60 leading-tight">{row.relativeStrength.breakdown}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Context */}
      <div className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-4 h-full">
        {/* Market Pulse Widget */}
        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Market Pulse</h3>
              <p className="text-[10px] text-white/40">Global Macro Environment</p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative flex items-center justify-center">
              {/* Circular Progress Background */}
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
                {/* Circular Progress Value (36/100 = 36% of circumference) */}
                <circle
                  cx="48" cy="48" r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 40}
                  strokeDashoffset={2 * Math.PI * 40 * (1 - 0.36)}
                  className="text-slate-400 transition-all duration-1000 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white tracking-tighter">36</span>
                <span className="text-[9px] uppercase tracking-widest text-white/40">Normal</span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-[10px] text-white/60 leading-relaxed">
              The current macro environment is scoring <strong className="text-white">36/100</strong>, indicating a neutral to slightly cooling regime. Sector dispersion is expected to be driven by idiosyncratic fundamentals rather than broad beta.
            </p>
          </div>
        </div>

        {/* Legend Widget */}
        <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4 flex-1 flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-white/40" />
            Scoring Legend
          </h3>
          <div className="flex flex-col gap-2.5 mb-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Max Overweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(3))}>+3</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Strong Overweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(2))}>+2</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Overweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(1))}>+1</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Neutral</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(0))}>0</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Underweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(-1))}>-1</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Strong Underweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(-2))}>-2</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Max Underweight</span>
              <span className={cn("px-2 py-0.5 rounded border", getBadgeStyle(-3))}>-3</span>
            </div>
          </div>
          <div className="mt-auto pt-3 border-t border-white/10">
            <p className="text-[10px] text-white/50 leading-relaxed">
              <strong className="text-white/70">4 pillars:</strong> Momentum + Fundamental (P/E) + Macro Trend + Relative Strength vs SPY. Each scores −1/0/+1. Final score is clamped to <strong className="text-teal-300">[−3, +3]</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
