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
  TrendingUp
} from 'lucide-react';

import { cn } from './shared/utils';
import { BeatsFeature } from './features/beats/BeatsFeature';
import { scorecardConfig, appendixData } from './features/beats/constants';

// Feature components
import { Chatbot } from './features/ai-chat/Chatbot';
import ScenarioAnalysis from './features/ai-chat/ScenarioAnalysis';
import { SectorScorecard } from './features/sector/SectorScorecard';
import { RegimeModel } from './features/regime/RegimeModel';
import { CockpitOverview } from './features/macro/CockpitOverview';
import { AssetAllocationDashboard } from './features/macro/AssetAllocationDashboard';
import { CreditCycle } from './features/macro/CreditCycle';
import { LiquidityPulse } from './features/macro/LiquidityPulse';
import { InflationTracker } from './features/macro/InflationTracker';
import { EconomicSurprise } from './features/macro/EconomicSurprise';
import { RecessionProbability } from './features/macro/RecessionProbability';
import { YieldCurve } from './features/macro/YieldCurve';
import { MarketSentiment } from './features/macro/MarketSentiment';
import { EconomicCycles } from './features/macro/EconomicCycles';
import { RecessionAlert } from './features/macro/RecessionAlert';
import Methodology from './features/documentation/Methodology';

export default function App() {
  const [activeModel, setActiveModel] = useState('overview');
  const [fredData, setFredData] = useState<any[]>([]);
  const [rawHistoryData, setRawHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
      pdf.save('BEATS_Scorecard.pdf');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
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
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden border border-[#073620]/50 shadow-[0_0_15px_rgba(7,54,32,0.4)]">
              <img src="/favicon.svg" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-white leading-tight">QuantDash</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Models & Scorecards</p>
            </div>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-4">Overview</div>
          <button
            onClick={() => { setActiveModel('overview'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'overview' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <Activity className={cn("w-4 h-4", activeModel === 'overview' ? "text-emerald-400" : "")} />
            Cockpit
          </button>
          <button
            onClick={() => { setActiveModel('allocation'); setIsMobileMenuOpen(false); }}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-md font-medium text-sm transition-colors", activeModel === 'allocation' ? "bg-[#1f1f1f] border border-white/5 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
          >
            <LineChart className={cn("w-4 h-4", activeModel === 'allocation' ? "text-emerald-400" : "")} />
            Asset Allocation
          </button>

          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Scorecards</div>
          {[
            { id: 'beats', label: 'BEATS Scorecard', icon: Activity },
            { id: 'sector', label: 'Sector Scorecard', icon: BarChart3 },
            { id: 'regime', label: 'Regime Model', icon: Cpu },
            { id: 'inflation', label: 'Inflation Tracker', icon: TrendingUp },
            { id: 'recession', label: 'Recession Probability', icon: ShieldAlert },
            { id: 'surprise', label: 'Economic Surprise', icon: Target },
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

          <div className="text-xs font-medium uppercase tracking-wider text-white/30 px-3 mb-2 mt-6">Models</div>
          {[
            { id: 'liquidity', label: 'Liquidity Pulse', icon: Zap },
            { id: 'yield', label: 'Yield Curve Model', icon: ArrowRightLeft },
            { id: 'credit', label: 'Credit Cycle', icon: BookOpen },
            { id: 'sentiment', label: 'Market Sentiment', icon: MessageSquare },
            { id: 'cycles', label: 'Economic Cycles', icon: LineChart },
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
                  {activeModel === 'overview' ? 'Cockpit Overview' :
                    activeModel === 'beats' ? 'BEATS Scorecard' :
                      activeModel.charAt(0).toUpperCase() + activeModel.slice(1).replace('-', ' ') + ' Dashboard'}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="hidden md:flex items-center gap-2 text-white/50 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                FRED_SYNC_ACTIVE
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
          {activeModel === 'overview' && <CockpitOverview setActiveModel={setActiveModel} fredData={fredData} loading={loading} />}
          {activeModel === 'allocation' && <AssetAllocationDashboard />}
          {activeModel === 'credit' && <CreditCycle />}
          {activeModel === 'liquidity' && <LiquidityPulse />}
          {activeModel === 'inflation' && <InflationTracker />}
          {activeModel === 'surprise' && <EconomicSurprise />}
          {activeModel === 'recession' && <RecessionProbability />}
          {activeModel === 'yield' && <YieldCurve />}
          {activeModel === 'sentiment' && <MarketSentiment />}
          {activeModel === 'cycles' && <EconomicCycles />}
          {activeModel === 'scenario' && <ScenarioAnalysis />}
          {activeModel === 'methodology' && <Methodology />}
          {activeModel === 'beats' && <BeatsFeature fredData={fredData} rawHistoryData={rawHistoryData} loading={loading} />}
          {activeModel === 'sector' && <SectorScorecard />}
          {activeModel === 'regime' && <RegimeModel />}
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
