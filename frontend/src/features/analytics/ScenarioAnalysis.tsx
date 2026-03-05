import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Zap,
  Target,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Gauge,
  BrainCircuit,
  Terminal,
  Signal,
  ShieldAlert,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

// ── Types ──

interface ScenarioInputs {
  inflation: number;
  yield10y: number;
  spxGrowth: number;
  creditSpread: number;
}

interface LiveBaseline {
  recession: { composite: number; riskLevel: string; trend: string; sahm?: { triggered: boolean; current: number } } | null;
  regime: { regimeName: string; assets: { equities: string; bonds: string; commodities: string; cash: string }; growthSignal: number | null; inflationYoY: number | null; confidence: number | null } | null;
  fed: { current: { gap: number | null; realRate: number | null; policyStance: string } } | null;
  bond: { score: number } | null;
}

// ── Pure functions ──

function detectScenarioRegime(inputs: ScenarioInputs): {
  name: string; color: 'emerald' | 'amber' | 'rose' | 'blue';
  description: string;
  assets: { equities: string; bonds: string; commodities: string; cash: string };
} {
  const growthUp = inputs.spxGrowth > 3;
  const inflationUp = inputs.inflation > 2.5;
  if (growthUp && !inflationUp) return {
    name: 'Goldilocks', color: 'emerald',
    description: 'Growth expanding, inflation contained — ideal equity environment.',
    assets: { equities: 'Overweight', bonds: 'Neutral', commodities: 'Underweight', cash: 'Underweight' },
  };
  if (growthUp && inflationUp) return {
    name: 'Reflation', color: 'amber',
    description: 'Growth expanding, inflation rising — commodities and value stocks outperform.',
    assets: { equities: 'Neutral', bonds: 'Underweight', commodities: 'Overweight', cash: 'Underweight' },
  };
  if (!growthUp && inflationUp) return {
    name: 'Stagflation', color: 'rose',
    description: 'Growth stalling, inflation persisting — the most challenging regime.',
    assets: { equities: 'Underweight', bonds: 'Underweight', commodities: 'Overweight', cash: 'Neutral' },
  };
  return {
    name: 'Deflation', color: 'blue',
    description: 'Growth contracting, inflation falling — long bonds and quality assets favored.',
    assets: { equities: 'Underweight', bonds: 'Overweight', commodities: 'Underweight', cash: 'Overweight' },
  };
}

function estimateBondScore(inputs: ScenarioInputs): number {
  let score = 0;
  if (inputs.yield10y < 3.5) score += 1;
  else if (inputs.yield10y > 5.5) score -= 1;
  if (inputs.inflation < 2.0) score += 1;
  else if (inputs.inflation > 4.5) score -= 1;
  if (inputs.creditSpread < 2.5) score += 1;
  else if (inputs.creditSpread > 5.5) score -= 1;
  const realRate = inputs.yield10y - inputs.inflation;
  if (realRate < 0) score += 1;
  else if (realRate > 2.5) score -= 1;
  return Math.max(-4, Math.min(4, score));
}

function estimateRecessionRisk(inputs: ScenarioInputs): number {
  let risk = 10;
  if (inputs.creditSpread > 6.0) risk += 35;
  else if (inputs.creditSpread > 4.5) risk += 20;
  else if (inputs.creditSpread > 3.0) risk += 8;
  if (inputs.spxGrowth < -15) risk += 30;
  else if (inputs.spxGrowth < -5) risk += 15;
  else if (inputs.spxGrowth < 0) risk += 5;
  if (inputs.inflation > 7.0) risk += 15;
  else if (inputs.inflation > 5.0) risk += 5;
  const realRate = inputs.yield10y - inputs.inflation;
  if (realRate > 3.0) risk += 10;
  return Math.min(95, Math.max(2, risk));
}

// ── Constants ──

const PRESETS: { name: string; color: 'emerald' | 'amber' | 'rose' | 'blue'; desc: string; inputs: ScenarioInputs }[] = [
  { name: 'Goldilocks', color: 'emerald', desc: 'Low inflation, strong growth', inputs: { inflation: 1.8, yield10y: 2.1, spxGrowth: 14, creditSpread: 2.8 } },
  { name: 'Reflation', color: 'amber', desc: 'Rising prices, expanding economy', inputs: { inflation: 4.2, yield10y: 5.0, spxGrowth: 10, creditSpread: 3.2 } },
  { name: 'Stagflation', color: 'rose', desc: 'High inflation, growth stalling', inputs: { inflation: 8.5, yield10y: 6.5, spxGrowth: -8, creditSpread: 6.5 } },
  { name: 'Deflation', color: 'blue', desc: 'Falling prices, contraction', inputs: { inflation: -0.5, yield10y: 1.5, spxGrowth: -18, creditSpread: 9.0 } },
];

const SIGNAL_COLOR: Record<string, string> = {
  Overweight: 'text-emerald-400',
  Neutral: 'text-amber-400',
  Underweight: 'text-rose-400',
};

const REGIME_COLORS = {
  emerald: { badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', preset: 'border-emerald-500/20 hover:border-emerald-500/40', label: 'text-emerald-400' },
  amber: { badge: 'text-amber-400 bg-amber-500/10 border-amber-500/25', preset: 'border-amber-500/20 hover:border-amber-500/40', label: 'text-amber-400' },
  rose: { badge: 'text-rose-400 bg-rose-500/10 border-rose-500/25', preset: 'border-rose-500/20 hover:border-rose-500/40', label: 'text-rose-400' },
  blue: { badge: 'text-blue-400 bg-blue-500/10 border-blue-500/25', preset: 'border-blue-500/20 hover:border-blue-500/40', label: 'text-blue-400' },
};

// ── Component ──

export default function ScenarioAnalysis() {
  const [inputs, setInputs] = useState<ScenarioInputs>({ inflation: 3.2, yield10y: 4.25, spxGrowth: 8.0, creditSpread: 3.5 });
  const [generating, setGenerating] = useState(false);
  const [aiCommentary, setAiCommentary] = useState<string>('');
  const [baseline, setBaseline] = useState<LiveBaseline>({ recession: null, regime: null, fed: null, bond: null });
  const [loadingBaseline, setLoadingBaseline] = useState(true);

  // Fetch live baseline on mount
  useEffect(() => {
    Promise.allSettled([
      fetch('/api/models/recession-probability').then(r => r.json()),
      fetch('/api/models/macro-regime').then(r => r.json()),
      fetch('/api/models/fed-policy').then(r => r.json()),
      fetch('/api/models/bond-scorecard').then(r => r.json()),
    ]).then(([recR, regR, fedR, bondR]) => {
      setBaseline({
        recession: recR.status === 'fulfilled' ? recR.value : null,
        regime: regR.status === 'fulfilled' ? regR.value : null,
        fed: fedR.status === 'fulfilled' ? fedR.value : null,
        bond: bondR.status === 'fulfilled' ? bondR.value : null,
      });
      setLoadingBaseline(false);
    });
  }, []);

  // Derived values
  const scenarioRegime = useMemo(() => detectScenarioRegime(inputs), [inputs]);
  const bondScoreEst = useMemo(() => estimateBondScore(inputs), [inputs]);
  const recessionRiskEst = useMemo(() => estimateRecessionRisk(inputs), [inputs]);
  const realRate = inputs.yield10y - inputs.inflation;

  const projections = useMemo(() => {
    const equityReturn = inputs.spxGrowth - (inputs.inflation > 4 ? (inputs.inflation - 4) * 1.5 : 0);
    const bondReturn = inputs.yield10y - (inputs.inflation > 3 ? (inputs.inflation - 3) * 0.6 : 0);
    const realEquity = equityReturn - inputs.inflation;
    const realBond = bondReturn - inputs.inflation;
    const commodityReturn = inputs.inflation * 0.9 + (inputs.inflation > 4 ? 4 : 0) - (inputs.spxGrowth < 0 ? 3 : 0);
    return [
      { name: 'Nom. Equity', value: parseFloat(equityReturn.toFixed(1)), color: '#818cf8' },
      { name: 'Nom. Bond', value: parseFloat(bondReturn.toFixed(1)), color: '#34d399' },
      { name: 'Real Equity', value: parseFloat(realEquity.toFixed(1)), color: '#6366f1' },
      { name: 'Real Bond', value: parseFloat(realBond.toFixed(1)), color: '#10b981' },
      { name: 'Commodity', value: parseFloat(commodityReturn.toFixed(1)), color: '#fbbf24' },
    ];
  }, [inputs]);

  const generateAICommentary = async () => {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '');
    if (!apiKey) {
      setAiCommentary('**Configure VITE_GEMINI_API_KEY** in your environment to enable AI analysis.');
      return;
    }
    setGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Act as a senior macro strategist at a top hedge fund. Analyze this hypothetical scenario and compare it to the current live environment.

SCENARIO PARAMETERS:
- CPI Inflation: ${inputs.inflation}%
- 10Y Treasury Yield: ${inputs.yield10y}%
- SPX Earnings Growth: ${inputs.spxGrowth}%
- HY Credit Spreads: ${inputs.creditSpread}%
- Real Yield (10Y - CPI): ${realRate.toFixed(2)}%

DERIVED SCENARIO OUTPUTS:
- Detected Regime: ${scenarioRegime.name} — ${scenarioRegime.description}
- Bond Score Estimate: ${bondScoreEst > 0 ? '+' : ''}${bondScoreEst} (${bondScoreEst >= 2 ? 'Bond-Friendly' : bondScoreEst <= -2 ? 'Bond-Hostile' : 'Neutral'})
- Recession Risk Estimate: ${recessionRiskEst}%

CURRENT LIVE ENVIRONMENT (for delta comparison):
- Recession Probability: ${baseline.recession?.composite ?? 'N/A'}% (${baseline.recession?.riskLevel ?? 'N/A'}, ${baseline.recession?.trend ?? 'N/A'})
- Sahm Rule: ${baseline.recession?.sahm?.triggered ? 'TRIGGERED' : `Clear (${baseline.recession?.sahm?.current?.toFixed(2) ?? 'N/A'})`}
- Live Regime: ${baseline.regime?.regimeName ?? 'N/A'} (CFNAI: ${baseline.regime?.growthSignal ?? 'N/A'}, CPI YoY: ${baseline.regime?.inflationYoY?.toFixed(1) ?? 'N/A'}%)
- Fed Policy Stance: ${baseline.fed?.current.policyStance ?? 'N/A'} (Gap: ${baseline.fed?.current.gap != null ? `${baseline.fed.current.gap > 0 ? '+' : ''}${baseline.fed.current.gap.toFixed(2)}%` : 'N/A'})
- Bond Scorecard: ${baseline.bond?.score != null ? `${baseline.bond.score > 0 ? '+' : ''}${baseline.bond.score}/±5` : 'N/A'}

Provide a concise 3-4 paragraph analysis covering:
1. How this scenario differs from the current live environment and what macro transition it implies.
2. Which asset class (Equities, Bonds, Commodities, or Cash) is most attractive and why.
3. The primary tail risk or policy constraint in this scenario.
4. A specific tactical positioning recommendation.

Format in clean Markdown.`;

      const response = await ai.models.generateContent({ model: 'gemini-1.5-flash', contents: prompt });
      setAiCommentary(response.text || 'Unable to generate commentary.');
    } catch (err) {
      console.error('AI generation failed:', err);
      setAiCommentary('Error generating AI commentary. Check your API configuration.');
    } finally {
      setGenerating(false);
    }
  };

  const rc = REGIME_COLORS[scenarioRegime.color];

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          Scenario Analysis
        </h2>
        <p className="text-sm text-white/40 mt-1">Model macro conditions across regimes and project asset returns</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-4 space-y-4">

          {/* Regime Presets */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-4">
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Bridgewater 4-Quadrant Presets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.name}
                  onClick={() => setInputs(p.inputs)}
                  className={`text-left p-3 rounded-xl border bg-white/[0.02] transition-all ${REGIME_COLORS[p.color].preset}`}
                >
                  <div className={`text-xs font-bold mb-0.5 ${REGIME_COLORS[p.color].label}`}>{p.name}</div>
                  <div className="text-[10px] text-white/35">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Parameter Sliders */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              Scenario Parameters
            </h3>
            <div className="space-y-5">
              {([
                { key: 'inflation', label: 'CPI Inflation', unit: '%', min: -3, max: 15, step: 0.1, textColor: 'text-amber-400', accent: 'accent-amber-500' },
                { key: 'yield10y', label: '10Y Treasury Yield', unit: '%', min: 0.5, max: 10, step: 0.05, textColor: 'text-blue-400', accent: 'accent-blue-500' },
                { key: 'spxGrowth', label: 'SPX Earnings Growth', unit: '%', min: -30, max: 40, step: 0.5, textColor: 'text-emerald-400', accent: 'accent-emerald-500' },
                { key: 'creditSpread', label: 'HY Credit Spreads', unit: '%', min: 1, max: 15, step: 0.1, textColor: 'text-rose-400', accent: 'accent-rose-500' },
              ] as const).map(({ key, label, unit, min, max, step, textColor, accent }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-white/50">{label}</label>
                    <span className={`text-xs font-mono font-bold ${textColor}`}>{inputs[key]}{unit}</span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={inputs[key]}
                    onChange={e => setInputs(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                    className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer ${accent}`}
                  />
                </div>
              ))}
            </div>

            {/* Real yield derived indicator */}
            <div className={`mt-4 flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-mono ${realRate < 0 ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : realRate > 2.5 ? 'border-rose-500/20 bg-rose-500/5 text-rose-400' : 'border-white/10 bg-white/3 text-white/50'}`}>
              <span>Real Yield (10Y − CPI)</span>
              <span className="font-bold">{realRate > 0 ? '+' : ''}{realRate.toFixed(2)}%</span>
            </div>

            <button
              onClick={generateAICommentary}
              disabled={generating}
              className="w-full mt-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-500/10"
            >
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate AI Analysis
            </button>
          </div>

          {/* Model Estimates */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
              Scenario Model Estimates
            </h3>

            {/* Detected regime */}
            <div className={`rounded-xl border p-3.5 ${rc.badge}`}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Detected Regime</div>
              <div className="font-bold text-sm">{scenarioRegime.name}</div>
              <div className="text-[11px] opacity-65 mt-1.5 leading-relaxed">{scenarioRegime.description}</div>
            </div>

            {/* Bond score + recession risk */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.04] rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> Bond Score
                </div>
                <div className={`text-2xl font-mono font-bold ${bondScoreEst >= 2 ? 'text-emerald-400' : bondScoreEst <= -2 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {bondScoreEst > 0 ? '+' : ''}{bondScoreEst}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">{bondScoreEst >= 2 ? 'Bond-Friendly' : bondScoreEst <= -2 ? 'Bond-Hostile' : 'Neutral'}</div>
              </div>
              <div className="bg-white/[0.04] rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Rec. Risk
                </div>
                <div className={`text-2xl font-mono font-bold ${recessionRiskEst >= 50 ? 'text-rose-400' : recessionRiskEst >= 25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {recessionRiskEst}%
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">{recessionRiskEst >= 50 ? 'Elevated' : recessionRiskEst >= 25 ? 'Moderate' : 'Low'}</div>
              </div>
            </div>

            {/* Asset signals */}
            <div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Regime Asset Signals</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(scenarioRegime.assets) as [string, string][]).map(([asset, signal]) => (
                  <div key={asset} className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                    <span className="text-[11px] text-white/50 capitalize">{asset}</span>
                    <span className={`text-[10px] font-bold ${SIGNAL_COLOR[signal] ?? 'text-white/50'}`}>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-8 space-y-5">

          {/* Projected Returns */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Projected Returns (1Y Forward)
            </h3>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projections} layout="vertical" margin={{ left: 10, right: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                  <XAxis type="number" stroke="#ffffff25" fontSize={11} unit="%" tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#ffffff25" fontSize={11} width={88} tickLine={false} axisLine={false} />
                  <ReferenceLine x={0} stroke="#ffffff20" strokeWidth={1} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #ffffff12', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                    formatter={(v: any) => [`${v}%`, 'Return']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => `${v}%`, fill: '#ffffff50', fontSize: 11 }}>
                    {projections.map((entry, i) => (
                      <Cell key={i} fill={entry.value >= 0 ? entry.color : '#ef4444'} fillOpacity={entry.value < 0 ? 0.7 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Live Baseline vs Scenario */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Signal className="w-3.5 h-3.5 text-blue-400" />
              Live Baseline vs Scenario
            </h3>
            {loadingBaseline ? (
              <div className="flex items-center gap-2 text-white/30 text-xs py-3">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading live model readings…
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  {
                    label: 'Recession Risk',
                    live: baseline.recession ? `${baseline.recession.composite}% · ${baseline.recession.riskLevel}` : '--',
                    scenario: `${recessionRiskEst}% · ${recessionRiskEst >= 50 ? 'Elevated' : recessionRiskEst >= 25 ? 'Moderate' : 'Low'}`,
                    worse: recessionRiskEst > (baseline.recession?.composite ?? 0),
                    icon: <ShieldAlert className="w-3 h-3" />,
                  },
                  {
                    label: 'Bond Score',
                    live: baseline.bond != null ? `${baseline.bond.score > 0 ? '+' : ''}${baseline.bond.score} / ±5` : '--',
                    scenario: `${bondScoreEst > 0 ? '+' : ''}${bondScoreEst} / ±4`,
                    worse: bondScoreEst < (baseline.bond?.score ?? 0),
                    icon: <Gauge className="w-3 h-3" />,
                  },
                  {
                    label: 'Fed Stance',
                    live: baseline.fed?.current.policyStance ?? '--',
                    scenario: realRate > 2 ? 'Restrictive' : realRate < 0 ? 'Accommodative' : 'Neutral',
                    worse: null,
                    icon: <Target className="w-3 h-3" />,
                  },
                  {
                    label: 'Regime',
                    live: baseline.regime?.regimeName ?? '--',
                    scenario: scenarioRegime.name,
                    worse: null,
                    icon: <Activity className="w-3 h-3" />,
                  },
                ] as const).map((item, i) => (
                  <div key={i} className="bg-white/[0.03] rounded-xl p-3.5 border border-white/5">
                    <div className="text-[10px] text-white/35 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                      {item.icon}{item.label}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-[9px] text-white/25 uppercase mb-0.5">Live</div>
                        <div className="text-[11px] text-white/60 font-mono">{item.live}</div>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-white/5">
                        <ArrowRight className="w-3 h-3 text-emerald-500/50 shrink-0" />
                        <div>
                          <div className="text-[9px] text-white/25 uppercase mb-0.5">Scenario</div>
                          <div className={`text-[11px] font-mono font-medium ${item.worse === true ? 'text-rose-400' : item.worse === false ? 'text-emerald-400' : 'text-white/70'}`}>
                            {item.scenario}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Strategic Analysis */}
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5 relative overflow-hidden min-h-[180px]">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-emerald-400" />
              AI Macro Strategist Analysis
            </h3>
            {aiCommentary ? (
              <div className="prose prose-invert prose-sm max-w-none text-white/70 leading-relaxed">
                <ReactMarkdown>{aiCommentary}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <Terminal className="w-7 h-7 text-white/12" />
                <p className="text-sm text-white/35">No analysis yet</p>
                <p className="text-xs text-white/20">Adjust parameters and click "Generate AI Analysis"</p>
              </div>
            )}
            {generating && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                  <p className="text-emerald-400 text-sm font-medium animate-pulse">Consulting Macro Strategist AI…</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/45 leading-relaxed">
          <span className="font-bold text-amber-400/70">Disclaimer:</span> Projections and model estimates use simplified heuristics for illustrative purposes only. Bond score range is ±4 (scenario estimate) vs ±5 (live model). Not investment advice.
        </p>
      </div>
    </div>
  );
}
