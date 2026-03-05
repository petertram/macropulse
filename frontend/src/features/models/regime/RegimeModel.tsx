import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';
import { AlertTriangle, Activity, Cpu, ShieldAlert, TrendingUp, Zap } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Configuration ---
const REGIME_CONFIG: Record<number, { name: string; color: string; bg: string; posture: string; textClass: string; bgClass: string; borderClass: string }> = {
  0: {
    name: 'Green Light',
    color: '#34d399', // emerald-400
    bg: 'rgba(52, 211, 153, 0.15)',
    posture: 'Aggressive',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/20',
    borderClass: 'border-emerald-500/30'
  },
  1: {
    name: 'Rollercoaster',
    color: '#38bdf8', // sky-400
    bg: 'rgba(56, 189, 248, 0.15)',
    posture: 'Tactical',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/20',
    borderClass: 'border-sky-500/30'
  },
  2: {
    name: 'Warning Sign',
    color: '#fb923c', // orange-400
    bg: 'rgba(251, 146, 60, 0.15)',
    posture: 'Defensive',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
    borderClass: 'border-orange-500/30'
  },
  3: {
    name: 'Fire Sale',
    color: '#ef4444', // red-500
    bg: 'rgba(239, 68, 68, 0.15)',
    posture: 'Contrarian',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
    borderClass: 'border-red-500/30'
  }
};

// --- Mock Data Generator ---
const generateMockData = () => {
  const data = [];
  let price = 4200;
  let currentState = 0;
  const now = new Date();

  for (let i = 120; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Random walk for price
    price = price * (1 + (Math.random() - 0.48) * 0.03);

    // State transitions (sticky)
    if (Math.random() < 0.08) {
      currentState = Math.floor(Math.random() * 4);
    }

    // Pulse calculation mock: (Close - Open) / (High - Low)
    const pulse = (Math.random() * 2) - 1;

    data.push({
      date: date.toISOString().split('T')[0],
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Math.round(price),
      state: currentState,
      pulse: Number(pulse.toFixed(2)),
    });
  }

  // Force current state to 0 and pulse < -0.3 for divergence demo
  data[data.length - 1].state = 0;
  data[data.length - 1].pulse = -0.65;

  return data;
};

export function RegimeModel() {
  const data = useMemo(() => generateMockData(), []);
  const currentData = data[data.length - 1];
  const currentStateConfig = REGIME_CONFIG[currentData.state];

  // Calculate contiguous blocks for ReferenceAreas
  const referenceAreas = useMemo(() => {
    const areas = [];
    let startIdx = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i].state !== data[i - 1].state || i === data.length - 1) {
        areas.push({
          start: data[startIdx].displayDate,
          end: data[i].displayDate,
          state: data[startIdx].state,
          color: REGIME_CONFIG[data[startIdx].state].bg
        });
        startIdx = i;
      }
    }
    return areas;
  }, [data]);

  // Mock probabilities for the grid
  const probabilities = [
    { state: 0, prob: currentData.state === 0 ? 0.65 : 0.10 },
    { state: 1, prob: currentData.state === 1 ? 0.55 : 0.20 },
    { state: 2, prob: currentData.state === 2 ? 0.70 : 0.10 },
    { state: 3, prob: currentData.state === 3 ? 0.80 : 0.05 },
  ];

  const isDivergence = currentData.state === 0 && currentData.pulse < -0.3;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0f0f0f] p-5 rounded-xl border border-white/10 shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white/70" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                HMM Regime Model
                <span className="text-xs font-mono px-2 py-0.5 bg-white/10 text-white/50 rounded border border-white/10">v2.1</span>
              </h2>
              <p className="text-xs text-white/40">4-State Hidden Markov Model</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Active Regime</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-lg font-bold", currentStateConfig.textClass)}>
                {currentStateConfig.name}
              </span>
            </div>
          </div>
          <div className="h-10 w-px bg-white/10"></div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Trading Posture</span>
            <div className={cn(
              "px-3 py-1 rounded-md text-sm font-semibold border",
              currentStateConfig.bgClass,
              currentStateConfig.textClass,
              currentStateConfig.borderClass
            )}>
              {currentStateConfig.posture}
            </div>
          </div>
        </div>
      </div>

      {/* Divergence Alert */}
      {isDivergence && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-4 shrink-0">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-400 mb-1 flex items-center gap-2">
              Bearish Divergence Detected
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-red-500/20 rounded border border-red-500/30">PULSE: {currentData.pulse}</span>
            </h3>
            <p className="text-xs text-red-400/80 leading-relaxed">
              The macro regime is currently <strong className="text-red-400">Green Light</strong>, but the intraday pulse is deeply negative (<strong className="text-red-400">{currentData.pulse}</strong>). This indicates strong intraday selling pressure despite the broader bullish context. Consider tightening stops or reducing aggressive long exposure.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Chart Area */}
        <div className="flex-1 bg-[#0f0f0f] rounded-xl border border-white/10 p-5 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-white/40" />
              Regime History & Price Action
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400"></div><span className="text-white/60">Green Light</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-sky-400"></div><span className="text-white/60">Rollercoaster</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400"></div><span className="text-white/60">Warning Sign</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div><span className="text-white/60">Fire Sale</span></div>
            </div>
          </div>

          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="displayDate"
                  stroke="rgba(255,255,255,0.4)"
                  tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }}
                  tickMargin={10}
                  minTickGap={30}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="rgba(255,255,255,0.4)"
                  tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#141414', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'price') return [`$${value}`, 'Price'];
                    return [value, name];
                  }}
                />

                {/* Background Regime Areas */}
                {referenceAreas.map((area, idx) => (
                  <ReferenceArea
                    key={idx}
                    x1={area.start}
                    x2={area.end}
                    fill={area.color}
                    fillOpacity={1}
                    strokeOpacity={0}
                  />
                ))}

                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#ffffff"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full xl:w-80 flex-shrink-0 flex flex-col gap-6">
          {/* Probability Grid */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-white/40" />
              State Probabilities
            </h3>

            <div className="flex flex-col gap-3">
              {probabilities.map((item) => {
                const config = REGIME_CONFIG[item.state];
                const isCurrent = currentData.state === item.state;

                return (
                  <div key={item.state} className={cn(
                    "p-3 rounded-lg border transition-colors",
                    isCurrent ? config.bgClass + " " + config.borderClass : "bg-[#141414] border-white/5"
                  )}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn("text-xs font-medium", isCurrent ? config.textClass : "text-white/60")}>
                        {config.name}
                      </span>
                      <span className={cn("text-xs font-mono", isCurrent ? config.textClass : "text-white/40")}>
                        {(item.prob * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${item.prob * 100}%`,
                          backgroundColor: config.color,
                          opacity: isCurrent ? 1 : 0.3
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Intraday Pulse Widget */}
          <div className="bg-[#0f0f0f] rounded-xl border border-white/10 p-5 flex-1">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-white/40" />
              Intraday Pulse
            </h3>

            <div className="flex flex-col items-center justify-center py-6">
              <div className="text-4xl font-mono font-bold tracking-tighter mb-2" style={{ color: currentData.pulse > 0 ? '#34d399' : '#ef4444' }}>
                {currentData.pulse > 0 ? '+' : ''}{currentData.pulse}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-6">Current Reading</div>

              {/* Gauge */}
              <div className="w-full relative h-2 bg-white/10 rounded-full">
                <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-white/40 -translate-x-1/2 -translate-y-1/2 z-10"></div>
                <div
                  className="absolute top-0 h-full rounded-full transition-all duration-500"
                  style={{
                    left: currentData.pulse < 0 ? `${50 + (currentData.pulse * 50)}%` : '50%',
                    width: `${Math.abs(currentData.pulse * 50)}%`,
                    backgroundColor: currentData.pulse > 0 ? '#34d399' : '#ef4444'
                  }}
                />
              </div>
              <div className="w-full flex justify-between mt-2 text-[10px] text-white/40 font-mono">
                <span>-1.0</span>
                <span>0.0</span>
                <span>+1.0</span>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-white/10">
              <p className="text-[10px] text-white/50 leading-relaxed">
                Pulse measures intraday buying/selling pressure: <code className="bg-white/5 px-1 py-0.5 rounded">(Close - Open) / (High - Low)</code>. Values below -0.3 in a Green Light regime trigger a divergence warning.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
