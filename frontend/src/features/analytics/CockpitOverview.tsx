import React, { useState, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  Cpu,
  TrendingUp,
  ShieldAlert,
  ArrowRightLeft,
  BookOpen,
  Zap,
  Target,
  ArrowRight,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Maximize2,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Search
} from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Configuration ---

const scorecardConfig = [
  { id: 'hy_spread', name: 'HY Spread', weight: 25, series: ['BAMLH0A0HYM2'], minRisk: 2.0, maxRisk: 5.0, unit: '%' },
  { id: 'yield_curve', name: 'Yield Curve', weight: 20, series: ['T10Y2Y'], minRisk: 1.0, maxRisk: -0.5, unit: '%' },
  { id: 'fin_stress', name: 'Fin. Stress', weight: 20, series: ['STLFSI4'], minRisk: -1.0, maxRisk: 1.0, unit: 'pts' },
  { id: 'macro_activity', name: 'Macro Activity', weight: 15, series: ['CFNAI'], minRisk: 0.5, maxRisk: -0.5, unit: 'pts' },
  { id: 'vix_term', name: 'VIX Term', weight: 10, series: ['VIXCLS', 'VXVCLS'], minRisk: 0.8, maxRisk: 1.0, unit: 'x' },
  { id: 'real_yield', name: 'Real Yield', weight: 10, series: ['DFII10'], minRisk: 0.0, maxRisk: 2.0, unit: '%' }
];

// --- Helper Functions ---

const getValue = (data: any[], id: string) => {
  const item = data.find(d => d.id === id);
  return item && item.value !== '.' && item.value !== null ? parseFloat(item.value) : null;
};

const calculateScore = (val: number | null, minRisk: number, maxRisk: number, weight: number) => {
  if (val === null || val === undefined || isNaN(val)) return 0;
  let pct = (val - minRisk) / (maxRisk - minRisk);
  pct = Math.max(0, Math.min(1, pct));
  return Math.round(pct * weight);
};

// --- Components ---

function VitalCard({ label, value, unit, trend, status = 'neutral' }: { label: string, value: string, unit: string, trend?: 'up' | 'down' | 'flat', status?: 'safe' | 'warning' | 'danger' | 'neutral' }) {
  const statusColor = {
    safe: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    warning: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    danger: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    neutral: 'text-white border-white/10 bg-white/5'
  }[status];

  return (
    <div className={cn("flex flex-col p-4 rounded-xl border transition-all", statusColor)}>
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-light tracking-tighter">{value}</span>
        <span className="text-xs font-mono opacity-50">{unit}</span>
      </div>
    </div>
  );
}

function CompactModelCard({ title, icon: Icon, status, score, active, onClick }: { title: string, icon: any, status: string, score?: string, active?: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border text-left transition-all group",
        active ? "bg-white/10 border-white/20" : "bg-[#141414] border-white/5 hover:bg-[#1a1a1a] hover:border-white/10"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-1.5 rounded-md", active ? "bg-white/10 text-white" : "bg-[#0a0a0a] text-white/40 group-hover:text-white/80")}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-medium text-white/90 group-hover:text-white">{title}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">{status}</div>
        </div>
      </div>
      {score && <div className="text-xs font-mono text-white/60">{score}</div>}
    </button>
  );
}

interface CockpitOverviewProps {
  setActiveModel: (model: string) => void;
  fredData: any[];
  loading: boolean;
}

export function CockpitOverview({ setActiveModel, fredData, loading }: CockpitOverviewProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Data Extraction ---
  const vix = getValue(fredData, 'VIXCLS');
  const yield10y = getValue(fredData, 'DGS10');
  const realYield = getValue(fredData, 'DFII10');
  const hySpread = getValue(fredData, 'BAMLH0A0HYM2');
  const yieldCurve = getValue(fredData, 'T10Y2Y');
  const finStress = getValue(fredData, 'STLFSI4');
  const macroActivity = getValue(fredData, 'CFNAI');

  // --- Score Calculation ---
  const liveScorecard = scorecardConfig.map(config => {
    const vals = config.series.map(id => getValue(fredData, id));
    const canCalc = vals.every(v => v !== null && !isNaN(v as number));
    const liveValue = canCalc ? (config.id === 'vix_term' ? vals[0]! / vals[1]! : vals[0]!) : null;
    const currentScore = canCalc ? calculateScore(liveValue, config.minRisk, config.maxRisk, config.weight) : 0;
    return { ...config, liveValue, currentScore };
  });

  const f2sScore = liveScorecard.reduce((acc, curr) => acc + curr.currentScore, 0);
  const riskLevel = f2sScore >= 70 ? 'CRITICAL' : f2sScore >= 40 ? 'ELEVATED' : 'NORMAL';
  const riskColor = f2sScore >= 70 ? 'text-rose-500' : f2sScore >= 40 ? 'text-amber-500' : 'text-emerald-500';

  // --- AI Analysis ---
  const generateInsight = async () => {
    if (!process.env.GEMINI_API_KEY) return;
    setIsAnalyzing(true);
    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `
        Act as a Chief Investment Officer. Analyze these market vitals and provide a concise, actionable "Cockpit Summary".
        
        Data:
        - VIX: ${vix}
        - 10Y Yield: ${yield10y}%
        - Real Yield (10Y): ${realYield}%
        - HY Spread: ${hySpread}%
        - Yield Curve (10Y-2Y): ${yieldCurve}%
        - Financial Stress Index: ${finStress}
        - Macro Activity (CFNAI): ${macroActivity}
        - Flight to Safety Risk Score: ${f2sScore}/100 (${riskLevel})

        Output Format (Markdown):
        **Regime**: [2-3 words, e.g. "Late Cycle Slowdown"]
        **Signal**: [Risk On / Risk Off / Neutral]
        
        **Analysis**:
        [2 sentences on the most critical driver]

        **Action**:
        - [Bullet 1: Specific trade idea]
        - [Bullet 2: Specific risk to hedge]
      `;

      // @ts-ignore
      const result = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      // @ts-ignore
      setAiAnalysis(result.text || result.response?.text() || "Analysis generated, but no text found.");
    } catch (error) {
      console.error("AI Error:", error);
      setAiAnalysis("**Error**: Failed to generate analysis. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-generate on first load if data is ready
  useEffect(() => {
    if (!loading && !aiAnalysis && vix !== null) {
      generateInsight();
    }
  }, [loading, vix]);

  // --- Chart Data ---
  const scatterData = [
    { x: finStress || 0, y: macroActivity || 0, z: 1 }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">

      {/* 1. Vitals Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <VitalCard
          label="Market Fear (VIX)"
          value={vix?.toFixed(2) ?? '--'}
          unit="pts"
          status={vix && vix > 20 ? 'warning' : 'neutral'}
        />
        <VitalCard
          label="Cost of Capital (10Y)"
          value={yield10y?.toFixed(2) ?? '--'}
          unit="%"
          status={yield10y && yield10y > 4.5 ? 'warning' : 'neutral'}
        />
        <VitalCard
          label="Credit Risk (HY Spread)"
          value={hySpread?.toFixed(2) ?? '--'}
          unit="bps"
          status={hySpread && hySpread > 4.0 ? 'danger' : 'safe'}
        />
        <VitalCard
          label="Real Yield (TIPS)"
          value={realYield?.toFixed(2) ?? '--'}
          unit="%"
          status={realYield && realYield > 2.0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* 2. Main Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: Regime Radar */}
        <div className="lg:col-span-4 bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              Regime Radar
            </h3>
            <div className="text-[10px] text-white/40 font-mono">CFNAI vs STLFSI</div>
          </div>

          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" dataKey="x" name="Fin Stress" domain={[-2, 2]} stroke="#666" tick={{ fontSize: 10 }} label={{ value: 'Stress', position: 'bottom', fill: '#666', fontSize: 10 }} />
                <YAxis type="number" dataKey="y" name="Activity" domain={[-2, 2]} stroke="#666" tick={{ fontSize: 10 }} label={{ value: 'Growth', angle: -90, position: 'left', fill: '#666', fontSize: 10 }} />
                <ReferenceLine x={0} stroke="#444" />
                <ReferenceLine y={0} stroke="#444" />

                {/* Quadrant Backgrounds (Implicit via logic or explicit areas) */}
                <ReferenceArea x1={-2} x2={0} y1={0} y2={2} fill="#10b981" fillOpacity={0.05} /> {/* Goldilocks */}
                <ReferenceArea x1={0} x2={2} y1={0} y2={2} fill="#f59e0b" fillOpacity={0.05} /> {/* Overheating */}
                <ReferenceArea x1={-2} x2={0} y1={-2} y2={0} fill="#3b82f6" fillOpacity={0.05} /> {/* Slowdown */}
                <ReferenceArea x1={0} x2={2} y1={-2} y2={0} fill="#f43f5e" fillOpacity={0.05} /> {/* Crisis */}

                <Scatter name="Current State" data={scatterData} fill="#fff">
                  <Cell fill={riskLevel === 'CRITICAL' ? '#f43f5e' : riskLevel === 'ELEVATED' ? '#f59e0b' : '#10b981'} />
                </Scatter>
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', borderColor: '#333', color: '#fff' }} />
              </ScatterChart>
            </ResponsiveContainer>

            {/* Labels */}
            <div className="absolute top-2 left-2 text-[10px] text-emerald-500/50 font-bold uppercase">Goldilocks</div>
            <div className="absolute top-2 right-2 text-[10px] text-amber-500/50 font-bold uppercase">Stagflation</div>
            <div className="absolute bottom-8 left-2 text-[10px] text-blue-500/50 font-bold uppercase">Recovery</div>
            <div className="absolute bottom-8 right-2 text-[10px] text-rose-500/50 font-bold uppercase">Crisis</div>
          </div>
        </div>

        {/* Center: AI Command Center */}
        <div className="lg:col-span-5 bg-[#0f0f0f] border border-white/10 rounded-2xl p-1 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-20"></div>

          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#141414]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-white/90">AI Analyst</span>
            </div>
            <button
              onClick={generateInsight}
              disabled={isAnalyzing}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isAnalyzing && "animate-spin")} />
            </button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto font-mono text-sm leading-relaxed relative">
            {isAnalyzing ? (
              <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 bg-[#0f0f0f]/80 backdrop-blur-sm z-10">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="text-xs text-blue-400 animate-pulse">SYNTHESIZING MARKET DATA...</div>
              </div>
            ) : aiAnalysis ? (
              <div className="markdown-body text-white/80 space-y-4">
                <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/30 gap-2">
                <Terminal className="w-8 h-8 opacity-50" />
                <span className="text-xs">Awaiting Analysis...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Risk Monitor */}
        <div className="lg:col-span-3 bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className={cn("w-4 h-4", riskColor)} />
              Risk Monitor
            </h3>
            <div className={cn("text-xs font-bold px-2 py-0.5 rounded-full bg-white/5", riskColor)}>
              {f2sScore}/100
            </div>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {liveScorecard.map((item) => (
              <div key={item.id} className="group">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-white/60 group-hover:text-white transition-colors">{item.name}</span>
                  <span className={cn(
                    "text-xs font-mono",
                    item.currentScore > item.weight * 0.6 ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {item.liveValue?.toFixed(2) ?? '--'}
                  </span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      item.currentScore > item.weight * 0.6 ? "bg-rose-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${(item.currentScore / item.weight) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. System Status / Navigation Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <CompactModelCard
          title="Asset Allocation"
          icon={BarChart3}
          status="Tactical"
          active={false}
          onClick={() => setActiveModel('allocation')}
        />
        <CompactModelCard
          title="Sector Rotation"
          icon={Activity}
          status="Tech Lead"
          active={false}
          onClick={() => setActiveModel('sector')}
        />
        <CompactModelCard
          title="Regime Model"
          icon={Cpu}
          status="Expansion"
          active={false}
          onClick={() => setActiveModel('regime')}
        />
        <CompactModelCard
          title="Inflation"
          icon={TrendingUp}
          status="Sticky"
          active={false}
          onClick={() => setActiveModel('inflation')}
        />
        <CompactModelCard
          title="Liquidity"
          icon={Zap}
          status="Draining"
          active={false}
          onClick={() => setActiveModel('liquidity')}
        />
        <CompactModelCard
          title="Recession"
          icon={ShieldAlert}
          status="Elevated"
          active={false}
          onClick={() => setActiveModel('recession')}
        />
      </div>
    </div>
  );
}
