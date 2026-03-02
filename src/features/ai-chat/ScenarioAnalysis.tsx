import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap, 
  Target, 
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { GoogleGenAI } from "@google/genai";

interface ScenarioInputs {
  inflation: number;
  yield10y: number;
  spxGrowth: number;
  creditSpread: number;
}

export default function ScenarioAnalysis() {
  const [inputs, setInputs] = useState<ScenarioInputs>({
    inflation: 3.2,
    yield10y: 4.25,
    spxGrowth: 8.0,
    creditSpread: 1.5
  });
  const [loading, setLoading] = useState(false);
  const [aiCommentary, setAiCommentary] = useState<string>('');
  const [projections, setProjections] = useState<any[]>([]);

  const calculateProjections = () => {
    // Simplified projection logic
    // Equity return = SPX Growth - Inflation adjustment
    // Bond return = Yield - (Duration * Change in Yield) - Inflation adjustment
    // For simplicity, we'll assume these are "expected returns" based on inputs
    
    const equityReturn = inputs.spxGrowth - (inputs.inflation > 4 ? (inputs.inflation - 4) * 2 : 0);
    const bondReturn = inputs.yield10y - (inputs.inflation > 3 ? (inputs.inflation - 3) * 0.5 : 0);
    const realReturnEquity = equityReturn - inputs.inflation;
    const realReturnBond = bondReturn - inputs.inflation;

    setProjections([
      { name: 'Nominal Equity', value: parseFloat(equityReturn.toFixed(2)), color: '#10b981' },
      { name: 'Nominal Bond', value: parseFloat(bondReturn.toFixed(2)), color: '#3b82f6' },
      { name: 'Real Equity', value: parseFloat(realReturnEquity.toFixed(2)), color: '#059669' },
      { name: 'Real Bond', value: parseFloat(realReturnBond.toFixed(2)), color: '#2563eb' }
    ]);
  };

  useEffect(() => {
    calculateProjections();
  }, [inputs]);

  const generateAICommentary = async () => {
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `
        As a senior macro strategist, analyze this hypothetical economic scenario:
        - Annual Inflation (CPI): ${inputs.inflation}%
        - 10-Year Treasury Yield: ${inputs.yield10y}%
        - S&P 500 Projected Growth: ${inputs.spxGrowth}%
        - Credit Spreads (HY): ${inputs.creditSpread}%

        Provide a concise analysis (3-4 paragraphs) covering:
        1. The likely stock-bond correlation in this regime.
        2. Which asset class (Equities vs. Bonds) is more attractive on a risk-adjusted basis.
        3. The primary risk to this scenario (e.g., stagflation, overheating, or deflation).
        4. A specific tactical recommendation for the BEATS model.
        
        Format the output in clean Markdown.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiCommentary(response.text || 'Unable to generate commentary at this time.');
    } catch (error) {
      console.error('AI generation failed:', error);
      setAiCommentary('Error generating AI commentary. Please check your API configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Inputs Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Scenario Parameters
            </h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-white/60">Inflation (CPI %)</label>
                  <span className="text-sm font-mono text-emerald-400">{inputs.inflation}%</span>
                </div>
                <input 
                  type="range" min="-2" max="15" step="0.1"
                  value={inputs.inflation}
                  onChange={(e) => setInputs({...inputs, inflation: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-white/60">10Y Treasury Yield (%)</label>
                  <span className="text-sm font-mono text-blue-400">{inputs.yield10y}%</span>
                </div>
                <input 
                  type="range" min="0" max="10" step="0.05"
                  value={inputs.yield10y}
                  onChange={(e) => setInputs({...inputs, yield10y: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-white/60">SPX Earnings Growth (%)</label>
                  <span className="text-sm font-mono text-emerald-400">{inputs.spxGrowth}%</span>
                </div>
                <input 
                  type="range" min="-20" max="40" step="0.5"
                  value={inputs.spxGrowth}
                  onChange={(e) => setInputs({...inputs, spxGrowth: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm text-white/60">Credit Spreads (HY %)</label>
                  <span className="text-sm font-mono text-amber-400">{inputs.creditSpread}%</span>
                </div>
                <input 
                  type="range" min="1" max="15" step="0.1"
                  value={inputs.creditSpread}
                  onChange={(e) => setInputs({...inputs, creditSpread: parseFloat(e.target.value)})}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <button 
                onClick={generateAICommentary}
                disabled={loading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-500/20"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate AI Analysis
              </button>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6">
            <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Quick Presets
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setInputs({ inflation: 8.5, yield10y: 4.5, spxGrowth: -5, creditSpread: 6 })}
                className="text-[10px] py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition-colors"
              >
                Stagflation (1970s)
              </button>
              <button 
                onClick={() => setInputs({ inflation: 1.8, yield10y: 2.1, spxGrowth: 12, creditSpread: 3.5 })}
                className="text-[10px] py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition-colors"
              >
                Goldilocks (2010s)
              </button>
              <button 
                onClick={() => setInputs({ inflation: 4.2, yield10y: 5.5, spxGrowth: 15, creditSpread: 2.5 })}
                className="text-[10px] py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition-colors"
              >
                Late Cycle Heat
              </button>
              <button 
                onClick={() => setInputs({ inflation: -0.5, yield10y: 1.2, spxGrowth: -15, creditSpread: 8.5 })}
                className="text-[10px] py-2 px-3 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition-colors"
              >
                Deflationary Bust
              </button>
            </div>
          </div>
        </div>

        {/* Projections Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Projected Performance (1Y Fwd)
            </h3>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projections} layout="vertical" margin={{ left: 20, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                  <XAxis type="number" stroke="#ffffff40" fontSize={12} unit="%" />
                  <YAxis dataKey="name" type="category" stroke="#ffffff40" fontSize={12} width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #ffffff10', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {projections.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {projections.map((p, i) => (
                <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{p.name}</p>
                  <p className="text-xl font-bold text-white">{p.value}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights Section */}
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4">
              <Sparkles className="w-12 h-12 text-emerald-500/10" />
            </div>
            
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              AI Strategic Analysis
            </h3>

            {aiCommentary ? (
              <div className="prose prose-invert max-w-none text-sm text-white/70 leading-relaxed space-y-4">
                {aiCommentary.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white/20" />
                </div>
                <div>
                  <p className="text-white/60 font-medium">No analysis generated yet</p>
                  <p className="text-xs text-white/40">Adjust parameters and click "Generate AI Analysis" to begin.</p>
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-4">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-emerald-400 font-medium animate-pulse">Consulting Macro Strategist AI...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Methodology Note */}
      <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/60 leading-relaxed">
          <span className="font-bold text-amber-400">Disclaimer:</span> This scenario analysis tool uses simplified linear projections and AI-generated heuristics. It is intended for educational and strategic planning purposes only. Real-world market dynamics are non-linear and influenced by thousands of variables not captured in this model.
        </div>
      </div>
    </div>
  );
}
