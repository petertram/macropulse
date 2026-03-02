import React from 'react';
import { 
  MessageSquare, 
  TrendingUp,
  TrendingDown,
  Info,
  Activity,
  Twitter,
  Search,
  Sparkles
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
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const mockHistory = Array.from({ length: 24 }).map((_, i) => ({
  date: new Date(2022, i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  alphasense: Math.sin(i / 3) * 40 + Math.random() * 20,
  twitter: Math.cos(i / 2) * 50 + Math.random() * 30,
}));

export function MarketSentiment() {
  const currentAlpha = 24.5;
  const currentTwitter = -15.2;
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Methodology Section */}
      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Info className="w-4 h-4 text-blue-400"/> Methodology</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Market Sentiment tracks the divergence between institutional and retail market participants. <strong>AlphaSense Macro</strong> aggregates sentiment from earnings calls, broker research, and SEC filings using NLP, representing "Smart Money". <strong>Twitter/X Sentiment</strong> aggregates retail sentiment via social media cashtag tracking. Divergences between these two metrics often signal contrarian trading opportunities.
        </p>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">AlphaSense Macro Sentiment</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentAlpha > 0 ? '+' : ''}{currentAlpha.toFixed(1)}</div>
            <div className="text-xs font-medium text-emerald-400 flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> Improving
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Institutional Transcripts & Filings</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Twitter/X Market Sentiment</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-light text-white font-mono">{currentTwitter > 0 ? '+' : ''}{currentTwitter.toFixed(1)}</div>
            <div className="text-xs font-medium text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-1" /> Deteriorating
            </div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Retail & FinTwit Chatter</p>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Combined Sentiment Regime</div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold uppercase tracking-widest rounded-lg">
              Divergent
            </div>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
          </div>
          <p className="text-[10px] text-white/30 mt-2">Institutional vs Retail Disconnect</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-400" />
            AlphaSense Sentiment Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockHistory}>
                <defs>
                  <linearGradient id="colorAlpha" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Area 
                  type="monotone" 
                  dataKey="alphasense" 
                  name="AlphaSense Score"
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorAlpha)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-6">
          <h3 className="text-sm font-medium text-white mb-6 flex items-center gap-2">
            <Twitter className="w-4 h-4 text-blue-400" />
            Twitter/X Sentiment Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="#444" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                <Line 
                  type="monotone" 
                  dataKey="twitter" 
                  name="Twitter Score"
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Analysis Card */}
      <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="flex items-start gap-4 relative">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shrink-0">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="space-y-4 w-full">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                AI Sentiment Synthesis
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">LIVE</span>
              </h3>
              <p className="text-xs text-white/40 mt-1">Automated NLP analysis of institutional vs. retail positioning</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <Search className="w-4 h-4 text-emerald-400"/> Institutional (Smart Money)
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  AlphaSense NLP models are detecting increased mentions of "margin expansion", "cost rationalization", and "resilient consumer" across recent earnings calls. Corporate tone is markedly more optimistic than previous quarters, driving the macro score to +24.5.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <Twitter className="w-4 h-4 text-rose-400"/> Retail (Social Chatter)
                </h4>
                <p className="text-sm text-white/60 leading-relaxed">
                  Social media sentiment has deteriorated to -15.2. Cashtag velocity shows high anxiety around keywords like "recession", "inflation", and "crash". Retail traders are heavily skewed towards put options and inverse ETFs, indicating peak fear.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
              <h4 className="text-sm font-medium text-indigo-300 mb-2">Actionable Takeaway</h4>
              <p className="text-sm text-white/70 leading-relaxed">
                Market sentiment is currently exhibiting a strong <strong>Divergence</strong>. Historically, institutional sentiment (AlphaSense) tends to lead major trend reversals, while extreme retail pessimism often marks a contrarian bottom. <strong>Recommendation:</strong> Fade the retail fear. Look for long entries in high-quality equities that are seeing institutional accumulation despite negative social media headlines.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
