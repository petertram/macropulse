/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import {
  Activity,
  ShieldAlert,
  ArrowRightLeft,
  BookOpen,
  Download,
  BarChart3,
  Cpu,
  Zap,
  Target,
  Menu,
  X,
  MessageSquare,
  Sparkles,
  LineChart,
  TrendingUp,
  RefreshCw,
  Globe,
  Landmark,
  Layers,
  Flame,
  DollarSign,
  Network,
  Package,
  RefreshCcw,
  Settings,
  Key,
  Gauge,
  PieChart
} from 'lucide-react';

import { cn } from './shared/utils';
import { Flight2Safety } from './features/monitors/flight2safety/Flight2Safety';
import { scorecardConfig, appendixData } from './features/monitors/flight2safety/constants';

// Feature components
import { Chatbot } from './features/ai-chat/Chatbot';
import ScenarioAnalysis from './features/analytics/ScenarioAnalysis';
import { SectorScorecard } from './features/monitors/sector/SectorScorecard';
import { RegimeModel } from './features/models/regime/RegimeModel';
import { Overview } from './features/analytics/Overview';
import { CreditCycle } from './features/models/CreditCycle';
import { LiquidityPulse } from './features/monitors/LiquidityPulse';
import { InflationTracker } from './features/monitors/InflationTracker';
import { EconomicSurprise } from './features/monitors/EconomicSurprise';
import { RecessionProbability } from './features/models/RecessionProbability';
import { YieldCurve } from './features/models/YieldCurve';
import { MarketSentiment } from './features/monitors/MarketSentiment';
import { EconomicCycles } from './features/models/EconomicCycles';
import { FedPolicyTracker } from './features/models/FedPolicyTracker';
import { FactorDashboard } from './features/models/FactorDashboard';
import { BondScorecard } from './features/models/BondScorecard';
import { FCI } from './features/models/FCI';
import { EquityRiskPremium } from './features/models/EquityRiskPremium';
import { HmmRegime } from './features/models/HmmRegime';
import { InflationDecomposition } from './features/monitors/InflationDecomposition';
import { CommodityMonitor } from './features/monitors/CommodityMonitor';
import { DollarMonitor } from './features/monitors/DollarMonitor';
import { CorrelationMonitor } from './features/monitors/CorrelationMonitor';
import { RecessionAlert } from './features/core/RecessionAlert';
import Methodology from './features/documentation/Methodology';

export default function App() {
  const [activeModel, setActiveModel] = useState('overview');
  const [fredData, setFredData] = useState<any[]>([]);
  const [rawHistoryData, setRawHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('user_gemini_api_key') || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  useEffect(() => {
    localStorage.setItem('user_gemini_api_key', userApiKey);
  }, [userApiKey]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSyncDate: string | null; lastSyncStatus: string | null; hasData: boolean; isCurrent: boolean; lastFredDataDate: string | null }>({ lastSyncDate: null, lastSyncStatus: null, hasData: false, isCurrent: false, lastFredDataDate: null });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchFredData = () => {
    setLoading(true);
    fetch('/api/fred')
      .then(res => res.json())
      .then(data => setFredData(data))
      .catch(err => console.error('Failed to fetch FRED data:', err));

    fetch('/api/fred/history')
      .then(res => res.json())
      .then(data => {
        setRawHistoryData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch FRED history:', err);
        setLoading(false);
      });
  };

  const fetchSyncStatus = () => {
    fetch('/api/fred/sync-status')
      .then(res => res.json())
      .then(data => setSyncStatus(data))
      .catch(err => console.error('Failed to fetch sync status:', err));
  };

  const handleFredSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/fred/sync', { method: 'POST' });
      const data = await res.json();
      if (data.lastSyncDate) {
        setSyncStatus(prev => ({ ...prev, lastSyncDate: data.lastSyncDate, lastSyncStatus: 'success', hasData: true, isCurrent: data.skipped || true }));
      }
      if (!data.skipped) {
        fetchFredData();
      }
      fetchSyncStatus();
    } catch (error) {
      console.error('Failed to sync FRED data:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const pdf = new jsPDF('landscape', 'pt', 'a4');
      const tabs = ['dashboard', 'forward', 'correlation', 'backtest', 'appendix'];

      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        const element = document.getElementById(`export-container-${tab}`);
        if (element) {
          const imgData = await htmlToImage.toJpeg(element, {
            quality: 1.0,
            backgroundColor: '#050505',
            pixelRatio: 2,
          });

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = pdf.getImageProperties(imgData);
          const imgRatio = imgProps.width / imgProps.height;
          const pdfRatio = pdfWidth / pdfHeight;

          let finalWidth = pdfWidth;
          let finalHeight = pdfHeight;

          if (imgRatio > pdfRatio) {
            finalHeight = pdfWidth / imgRatio;
          } else {
            finalWidth = pdfHeight * imgRatio;
          }

          const x = (pdfWidth - finalWidth) / 2;
          const y = (pdfHeight - finalHeight) / 2;

          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
        }
      }
      pdf.save('Flight_to_Safety_Scorecard.pdf');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    fetchFredData();
    fetchSyncStatus();
  }, []);

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      <RecessionAlert onNavigate={setActiveModel} />

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#0f0f0f] border-r border-white/5 flex flex-col transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:transform-none"
      )}>
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white leading-tight">MacroPulse</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Models & Scorecards</p>
            </div>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-4">Applied Analytics</div>
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'scenario', label: 'Scenario Analysis', icon: Sparkles },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveModel(item.id); setIsMobileMenuOpen(false); }}
              className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === item.id ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
            >
              <item.icon className={cn("w-4 h-4", activeModel === item.id ? "text-emerald-400" : "")} />
              {item.label}
            </button>
          ))}

          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Monitors & Scorecards</div>
          {[
            { id: 'flight2safety', label: 'Flight to Safety', icon: Activity },
            { id: 'sector', label: 'Sector Rotation', icon: BarChart3 },
            { id: 'inflation', label: 'Inflation Tracker', icon: TrendingUp },
            { id: 'inflation-decomp', label: 'Inflation Decomp.', icon: Flame },
            { id: 'surprise', label: 'Economic Surprise', icon: Target },
            { id: 'liquidity', label: 'Liquidity Pulse', icon: Zap },
            { id: 'sentiment', label: 'Market Sentiment', icon: MessageSquare },
            { id: 'commodities', label: 'Commodity Monitor', icon: Package },
            { id: 'dollar', label: 'Dollar Monitor', icon: Globe },
            { id: 'correlations', label: 'Cross-Asset Corr.', icon: Network },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveModel(item.id); setIsMobileMenuOpen(false); }}
              className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === item.id ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
            >
              <item.icon className={cn("w-4 h-4", activeModel === item.id ? "text-emerald-400" : "")} />
              {item.label}
            </button>
          ))}

          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Predictive Models</div>
          {[
            { id: 'regime', label: 'Regime Model', icon: Cpu },
            { id: 'recession', label: 'Recession Probability', icon: ShieldAlert },
            { id: 'yield', label: 'Yield Curve Model', icon: ArrowRightLeft },
            { id: 'credit', label: 'Credit Cycle', icon: BookOpen },
            { id: 'cycles', label: 'Economic Cycles', icon: LineChart },
            { id: 'fed-policy', label: 'Fed Policy Tracker', icon: Landmark },
            { id: 'factors', label: 'Factor Dashboard', icon: Layers },
            { id: 'bond-scorecard', label: 'Bond Scorecard', icon: DollarSign },
            { id: 'fci', label: 'Financial Conditions', icon: Gauge },
            { id: 'erp', label: 'Equity Risk Premium', icon: PieChart },
            { id: 'hmm', label: 'HMM Regime Model', icon: Cpu },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveModel(item.id); setIsMobileMenuOpen(false); }}
              className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === item.id ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
            >
              <item.icon className={cn("w-4 h-4", activeModel === item.id ? "text-emerald-400" : "")} />
              {item.label}
            </button>
          ))}

          <div className="mt-8">
            <h3 className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Documentation</h3>
            <button
              onClick={() => { setActiveModel('methodology'); setIsMobileMenuOpen(false); }}
              className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'methodology' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
            >
              <BookOpen className={cn("w-4 h-4", activeModel === 'methodology' ? "text-emerald-400" : "")} />
              Methodology
            </button>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 space-y-2">
            <button
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md font-medium text-[11px] transition-colors",
                userApiKey ? "text-emerald-400 bg-emerald-500/5 border border-emerald-500/20" : "text-white/40 hover:text-white hover:bg-white/5"
              )}
            >
              <Key className="w-3.5 h-3.5" />
              {userApiKey ? 'Custom Key Active' : 'Personal AI Key'}
            </button>

            {showApiKeyInput && (
              <div className="px-1 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <input
                  type="password"
                  placeholder="Paste Google API Key..."
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                />
                <p className="text-[9px] text-white/30 leading-tight">
                  Saves to browser storage. Bypasses shared quota.
                </p>
                {userApiKey && (
                  <button
                    onClick={() => { setUserApiKey(''); setShowApiKeyInput(false); }}
                    className="text-[9px] text-red-400/60 hover:text-red-400 transition-colors uppercase tracking-widest font-bold"
                  >
                    Clear Key
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-white/10 bg-[#0a0a0a] sticky top-0 z-20 backdrop-blur-md bg-opacity-80">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button className="md:hidden p-2 -ml-2 text-white hover:bg-white/10 rounded-md transition-colors" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {activeModel === 'overview' ? 'Overview' :
                    activeModel === 'flight2safety' ? 'Flight to Safety' :
                      activeModel === 'sector' ? 'Sector Rotation' :
                        activeModel === 'inflation-decomp' ? 'Inflation Decomposition' :
                          activeModel === 'bond-scorecard' ? 'Bond Scorecard' :
                            activeModel === 'fed-policy' ? 'Fed Policy Tracker' :
                              activeModel === 'correlations' ? 'Cross-Asset Correlations' :
                                activeModel === 'commodities' ? 'Commodity Monitor' :
                                  activeModel === 'dollar' ? 'Dollar Monitor' :
                                    activeModel === 'factors' ? 'Factor Dashboard' :
                                      activeModel === 'hmm' ? 'HMM Regime Model' :
                                        activeModel.charAt(0).toUpperCase() + activeModel.slice(1).replace(/-/g, ' ')}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={handleFredSync}
                  disabled={isSyncing}
                  className={cn("text-xs font-medium uppercase tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors",
                    isSyncing ? "text-emerald-500/50 border-emerald-500/10 bg-emerald-500/5" :
                      syncStatus.isCurrent ? "text-emerald-400/60 border-emerald-500/20 bg-emerald-500/5" :
                        "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  )}
                >
                  <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
                  {isSyncing ? 'Syncing...' : syncStatus.isCurrent ? 'Up to date' : 'Sync FRED Data'}
                </button>
                <span className="text-[10px] text-white/30 ml-1">
                  {syncStatus.lastSyncDate
                    ? `Last: ${(() => { const diff = Date.now() - new Date(syncStatus.lastSyncDate).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; })()}`
                    : 'Never synced'}
                </span>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={cn("text-xs font-medium uppercase tracking-wider flex items-center gap-2 px-4 py-2 rounded-md border", isExporting ? "text-white/50 border-white/10 bg-white/5" : "text-white/70 hover:text-white border-white/20 hover:bg-white/10")}
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </header>

        <main className={cn("px-4 md:px-8 py-8 h-[calc(100vh-4rem)] overflow-y-auto")}>
          {activeModel === 'overview' && <Overview setActiveModel={setActiveModel} fredData={fredData} rawHistoryData={rawHistoryData} loading={loading} lastSynced={syncStatus.lastSyncDate} />}
          {activeModel === 'credit' && <CreditCycle />}
          {activeModel === 'liquidity' && <LiquidityPulse />}
          {activeModel === 'inflation' && <InflationTracker fredData={fredData} rawHistoryData={rawHistoryData} loading={loading} />}
          {activeModel === 'surprise' && <EconomicSurprise />}
          {activeModel === 'recession' && <RecessionProbability />}
          {activeModel === 'yield' && <YieldCurve />}
          {activeModel === 'sentiment' && <MarketSentiment />}
          {activeModel === 'cycles' && <EconomicCycles />}
          {activeModel === 'scenario' && <ScenarioAnalysis />}
          {activeModel === 'methodology' && <Methodology />}
          {activeModel === 'flight2safety' && <Flight2Safety fredData={fredData} rawHistoryData={rawHistoryData} loading={loading} lastSynced={syncStatus.lastSyncDate} />}
          {activeModel === 'sector' && <SectorScorecard />}
          {activeModel === 'regime' && <RegimeModel />}
          {activeModel === 'fed-policy' && <FedPolicyTracker />}
          {activeModel === 'factors' && <FactorDashboard />}
          {activeModel === 'bond-scorecard' && <BondScorecard />}
          {activeModel === 'fci' && <FCI />}
          {activeModel === 'erp' && <EquityRiskPremium />}
          {activeModel === 'inflation-decomp' && <InflationDecomposition />}
          {activeModel === 'commodities' && <CommodityMonitor />}
          {activeModel === 'dollar' && <DollarMonitor />}
          {activeModel === 'correlations' && <CorrelationMonitor />}
          {activeModel === 'hmm' && <HmmRegime />}
        </main>

        <Chatbot
          fredData={fredData}
          historyData={[]}
          scorecardConfig={scorecardConfig}
          appendixData={appendixData}
        />
      </div>
    </div>
  );
}
