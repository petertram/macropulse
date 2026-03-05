import React, { useState, useEffect, useMemo } from 'react';
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
    Terminal,
    AlertTriangle,
    CheckCircle2,
    ArrowDownRight,
    ArrowUpRight,
    LineChart,
    Layers,
    Gauge,
    PieChart,
    BrainCircuit,
    Crosshair,
    Signal,
    ChevronRight,
    ZoomIn,
    ZoomOut
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
    Cell,
    ZAxis,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    AreaChart,
    Area
} from 'recharts';
import { cn, calculateScore } from '../../shared/utils';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

// ── Configuration ──

const scorecardConfig = [
    { id: 'hy_spread', name: 'HY Spread', weight: 25, series: ['BAMLH0A0HYM2'], minRisk: 2.0, maxRisk: 5.0, unit: '%' },
    { id: 'yield_curve', name: 'Yield Curve', weight: 20, series: ['T10Y2Y'], minRisk: 1.0, maxRisk: -0.5, unit: '%' },
    { id: 'fin_stress', name: 'Fin. Stress', weight: 20, series: ['STLFSI4'], minRisk: -1.0, maxRisk: 1.0, unit: 'pts' },
    { id: 'macro_activity', name: 'Macro Activity', weight: 15, series: ['CFNAI'], minRisk: 0.5, maxRisk: -0.5, unit: 'pts' },
    { id: 'vix_term', name: 'VIX Term', weight: 10, series: ['VIXCLS', 'VXVCLS'], minRisk: 0.8, maxRisk: 1.0, unit: 'x' },
    { id: 'real_yield', name: 'Real Yield', weight: 10, series: ['DFII10'], minRisk: 0.0, maxRisk: 2.0, unit: '%' }
];

// Asset class definitions with allocation logic
const assetClasses = [
    { id: 'equities', name: 'Equities', color: '#818cf8', benchmark: 60 },
    { id: 'fixed_income', name: 'Fixed Income', color: '#34d399', benchmark: 25 },
    { id: 'commodities', name: 'Commodities', color: '#fbbf24', benchmark: 10 },
    { id: 'cash', name: 'Cash / MM', color: '#94a3b8', benchmark: 5 }
];

// ── Helpers ──

const getValue = (data: any[], id: string) => {
    const item = data.find(d => d.id === id);
    return item && item.value !== '.' && item.value !== null ? parseFloat(item.value) : null;
};

function getStatusColor(pct: number): string {
    if (pct >= 0.75) return 'text-rose-400';
    if (pct >= 0.4) return 'text-amber-400';
    return 'text-emerald-400';
}

function getStatusBg(pct: number): string {
    if (pct >= 0.75) return 'bg-rose-500';
    if (pct >= 0.4) return 'bg-amber-500';
    return 'bg-emerald-500';
}

// Derive tactical allocation from risk score
function deriveAllocation(f2sScore: number, finStress: number | null, hySpread: number | null, yieldCurve: number | null, inflationEstimate: number | null) {
    // Base: 60/25/10/5 benchmark
    let eq = 60, fi = 25, co = 10, cash = 5;

    // Risk-driven tilt
    if (f2sScore >= 70) {
        // Crisis: max defensive
        eq = 25; fi = 35; co = 10; cash = 30;
    } else if (f2sScore >= 55) {
        // Elevated: cautious
        eq = 40; fi = 30; co = 10; cash = 20;
    } else if (f2sScore >= 40) {
        // Moderate: slight de-risk
        eq = 50; fi = 28; co = 12; cash = 10;
    } else if (f2sScore <= 20) {
        // Goldilocks: max risk-on
        eq = 70; fi = 18; co = 10; cash = 2;
    }

    // Inflation tilt: if breakeven > 2.5%, shift from FI to commodities
    if (inflationEstimate && inflationEstimate > 2.5) {
        const shift = Math.min(5, Math.round((inflationEstimate - 2.5) * 5));
        fi -= shift;
        co += shift;
    }

    // Yield curve inversion tilt: if deeply inverted, more FI
    if (yieldCurve !== null && yieldCurve < -0.3) {
        const shift = Math.min(5, Math.round(Math.abs(yieldCurve) * 5));
        eq -= shift;
        fi += shift;
    }

    return [
        { ...assetClasses[0], tactical: eq, delta: eq - assetClasses[0].benchmark },
        { ...assetClasses[1], tactical: fi, delta: fi - assetClasses[1].benchmark },
        { ...assetClasses[2], tactical: co, delta: co - assetClasses[2].benchmark },
        { ...assetClasses[3], tactical: cash, delta: cash - assetClasses[3].benchmark }
    ];
}

// Determine macro regime from CFNAI and STLFSI
function getRegime(macroActivity: number | null, finStress: number | null): { label: string; color: string; bgColor: string; description: string } {
    const growth = macroActivity ?? 0;
    const stress = finStress ?? 0;

    if (growth > 0 && stress < 0) return { label: 'Goldilocks', color: 'text-emerald-400', bgColor: 'bg-emerald-500', description: 'Above-trend growth with low financial stress. Favorable for risk assets.' };
    if (growth > 0 && stress >= 0) return { label: 'Overheating', color: 'text-amber-400', bgColor: 'bg-amber-500', description: 'Growth is strong but stress is rising. Late-cycle dynamics with inflation risk.' };
    if (growth <= 0 && stress < 0) return { label: 'Slowdown', color: 'text-blue-400', bgColor: 'bg-blue-500', description: 'Growth below trend but stress contained. Potential early recovery or decelerating expansion.' };
    return { label: 'Crisis', color: 'text-rose-400', bgColor: 'bg-rose-500', description: 'Contraction with elevated stress. Risk-off positioning recommended.' };
}

// ── Sub-Components ──

function VitalCard({ label, value, unit, status = 'neutral', subtext }: { label: string; value: string; unit: string; status?: 'safe' | 'warning' | 'danger' | 'neutral'; subtext?: string }) {
    const statusStyles = {
        safe: 'border-emerald-500/20 bg-emerald-500/5',
        warning: 'border-amber-500/20 bg-amber-500/5',
        danger: 'border-rose-500/20 bg-rose-500/5',
        neutral: 'border-white/10 bg-white/5'
    }[status];

    const textColor = {
        safe: 'text-emerald-400',
        warning: 'text-amber-400',
        danger: 'text-rose-400',
        neutral: 'text-white'
    }[status];

    return (
        <div className={cn("flex flex-col p-4 rounded-xl border transition-all hover:scale-[1.02] duration-300", statusStyles)}>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5 font-medium">{label}</div>
            <div className="flex items-baseline gap-1.5">
                <span className={cn("text-2xl font-mono font-light tracking-tighter", textColor)}>{value}</span>
                <span className="text-xs font-mono text-white/30">{unit}</span>
            </div>
            {subtext && <div className="text-[10px] text-white/30 mt-1 font-mono">{subtext}</div>}
        </div>
    );
}

function AllocationBar({ name, benchmark, tactical, delta, color }: { name: string; benchmark: number; tactical: number; delta: number; color: string }) {
    const isPositive = delta >= 0;
    return (
        <div className="group">
            <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-white/70 group-hover:text-white transition-colors">{name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-white/30">{benchmark}%</span>
                    <ArrowRight className="w-3 h-3 text-white/20" />
                    <span className="text-white/80 font-medium">{tactical}%</span>
                    <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                        isPositive ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10"
                    )}>
                        {isPositive ? '+' : ''}{delta}%
                    </span>
                </div>
            </div>
            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                {/* Benchmark marker */}
                <div
                    className="absolute top-0 h-full w-px bg-white/30 z-10"
                    style={{ left: `${benchmark}%` }}
                />
                {/* Tactical fill */}
                <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${tactical}%`, backgroundColor: color, boxShadow: `0 0 12px ${color}40` }}
                />
            </div>
        </div>
    );
}

function MacroSenseCard({ title, status, statusColor, indicators, eqSignal, fiSignal, coSignal, onClick }: {
    title: string; status: string; statusColor: string;
    indicators: { label: string; value: string; trend: 'up' | 'down' | 'flat' }[];
    eqSignal: 'OW' | 'N' | 'UW'; fiSignal: 'OW' | 'N' | 'UW'; coSignal: 'OW' | 'N' | 'UW';
    onClick?: () => void;
}) {
    const signalColor = (s: string) => s === 'OW' ? 'text-emerald-400' : s === 'UW' ? 'text-rose-400' : 'text-amber-400';
    const barColor = statusColor === 'rose' ? 'bg-rose-500' : statusColor === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
    const badgeBg = statusColor === 'rose' ? 'bg-rose-400/10 text-rose-400' : statusColor === 'amber' ? 'bg-amber-400/10 text-amber-400' : 'bg-emerald-400/10 text-emerald-400';

    return (
        <button onClick={onClick} className="bg-[#0f0f0f] rounded-xl border border-white/10 p-4 relative overflow-hidden text-left w-full group hover:border-white/20 transition-all">
            <div className={cn("absolute top-0 right-0 w-1 h-full", barColor)} />
            <h3 className="text-sm font-medium text-white mb-2.5 flex items-center justify-between">
                {title}
                <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded", badgeBg)}>{status}</span>
            </h3>
            <div className="space-y-1.5 mb-3">
                {indicators.map((ind, i) => (
                    <div key={i} className="flex justify-between items-end">
                        <span className="text-xs text-white/40">{ind.label}</span>
                        <span className={cn("text-xs font-mono", ind.trend === 'up' ? 'text-emerald-400' : ind.trend === 'down' ? 'text-rose-400' : 'text-white/60')}>
                            {ind.value}
                            {ind.trend === 'up' && <ArrowUpRight className="w-3 h-3 inline ml-0.5" />}
                            {ind.trend === 'down' && <ArrowDownRight className="w-3 h-3 inline ml-0.5" />}
                        </span>
                    </div>
                ))}
            </div>
            <div className="pt-2.5 border-t border-white/5 flex justify-between text-[10px] uppercase tracking-wider">
                <span className="text-white/40">EQ: <span className={signalColor(eqSignal)}>{eqSignal}</span></span>
                <span className="text-white/40">FI: <span className={signalColor(fiSignal)}>{fiSignal}</span></span>
                <span className="text-white/40">CO: <span className={signalColor(coSignal)}>{coSignal}</span></span>
            </div>
        </button>
    );
}

function NavigationCard({ title, icon: Icon, statusLabel, onClick }: { title: string; icon: any; statusLabel: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-between p-3 rounded-xl border bg-[#0f0f0f] border-white/5 hover:bg-[#161616] hover:border-white/15 text-left transition-all group"
        >
            <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-[#0a0a0a] text-white/40 group-hover:text-white/80 transition-colors">
                    <Icon className="w-4 h-4" />
                </div>
                <div>
                    <div className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">{title}</div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider">{statusLabel}</div>
                </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
        </button>
    );
}

// ── Main Component ──

interface OverviewProps {
    setActiveModel: (model: string) => void;
    fredData: any[];
    rawHistoryData: any;
    loading: boolean;
    lastSynced: string | null;
}

export function Overview({ setActiveModel, fredData, rawHistoryData, loading, lastSynced }: OverviewProps) {
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(0.5);
    const [recessionData, setRecessionData] = useState<{ composite: number; riskLevel: string; trend: string; sahm?: { triggered: boolean; current: number } } | null>(null);
    const [fedData, setFedData] = useState<{ current: { gap: number | null; realRate: number | null; policyStance: string } } | null>(null);

    // ── Data Extraction ──
    const vix = getValue(fredData, 'VIXCLS');
    const vxv = getValue(fredData, 'VXVCLS');
    const yield10y = getValue(fredData, 'DGS10');
    const realYield = getValue(fredData, 'DFII10');
    const hySpread = getValue(fredData, 'BAMLH0A0HYM2');
    const yieldCurve = getValue(fredData, 'T10Y2Y');
    const finStress = getValue(fredData, 'STLFSI4');
    const macroActivity = getValue(fredData, 'CFNAI');
    const breakeven10y = getValue(fredData, 'T10YIE');

    // ── Score Calculation ──
    const liveScorecard = useMemo(() => scorecardConfig.map(config => {
        const vals = config.series.map(id => getValue(fredData, id));
        const canCalc = vals.every(v => v !== null && !isNaN(v as number));
        let liveValue: number | null = null;
        if (canCalc) {
            liveValue = config.id === 'vix_term' ? vals[0]! / vals[1]! : vals[0]!;
        }
        const currentScore = canCalc ? calculateScore(liveValue, config.minRisk, config.maxRisk, config.weight) : 0;
        const pct = currentScore / config.weight;
        return { ...config, liveValue, currentScore, pct };
    }), [fredData]);

    const f2sScore = liveScorecard.reduce((acc, curr) => acc + curr.currentScore, 0);
    const riskLevel = f2sScore >= 70 ? 'CRITICAL' : f2sScore >= 55 ? 'ELEVATED' : f2sScore >= 40 ? 'MODERATE' : 'NORMAL';
    const riskColor = f2sScore >= 70 ? 'text-rose-500' : f2sScore >= 55 ? 'text-amber-500' : f2sScore >= 40 ? 'text-amber-400' : 'text-emerald-500';

    // ── Regime ──
    const regime = getRegime(macroActivity, finStress);

    // ── Tactical Allocation ──
    const allocation = useMemo(() =>
        deriveAllocation(f2sScore, finStress, hySpread, yieldCurve, breakeven10y),
        [f2sScore, finStress, hySpread, yieldCurve, breakeven10y]
    );

    // Divergence detection
    const isDivergence = regime.label === 'Goldilocks' && f2sScore >= 40;
    const isStagflation = regime.label === 'Overheating' && (breakeven10y ?? 0) > 2.5 && (macroActivity ?? 0) < 0;

    const radarData = liveScorecard.map(item => ({
        factor: item.name,
        score: Math.round(item.pct * 100),
        fullMark: 100
    }));

    // ── Macro Path (Quarterly Breadcrumbs) ──
    const pathData = useMemo(() => {
        if (!rawHistoryData || !Array.isArray(rawHistoryData) || rawHistoryData.length === 0) return [];

        const quarterlyBins: Record<string, { growth: number[]; stress: number[] }> = {};

        rawHistoryData.slice(-100).forEach((d: any) => {
            const dateObj = new Date(d.date);
            const quarter = Math.ceil((dateObj.getMonth() + 1) / 3);
            const qKey = `${dateObj.getFullYear()}-Q${quarter}`;

            const growth = d.CFNAI;
            const stress = d.STLFSI4 || d.STLFSI || d.STLFSI2;

            if (growth !== undefined && growth !== null && !isNaN(growth)) {
                if (!quarterlyBins[qKey]) quarterlyBins[qKey] = { growth: [], stress: [] };
                quarterlyBins[qKey].growth.push(growth);
            }
            if (stress !== undefined && stress !== null && !isNaN(stress)) {
                if (!quarterlyBins[qKey]) quarterlyBins[qKey] = { growth: [], stress: [] };
                quarterlyBins[qKey].stress.push(stress);
            }
        });

        return Object.entries(quarterlyBins)
            .map(([qKey, vals]) => ({
                date: qKey,
                y: vals.growth.reduce((a, b) => a + b, 0) / vals.growth.length,
                x: vals.stress.reduce((a, b) => a + b, 0) / vals.stress.length,
                isPath: true
            }))
            .filter(d => !isNaN(d.x) && !isNaN(d.y))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-8) // Last 8 quarters
            .map((d, i, arr) => ({
                ...d,
                z: (i + 1) * 4, // More refined size progression
                opacity: 0.15 + (i / arr.length) * 0.45 // Fade in effect
            }));
    }, [rawHistoryData]);

    const nowData = [{ x: finStress || 0, y: macroActivity || 0, z: 40, date: 'LATEST' }];

    // ── AI Analysis ──
    const generateInsight = async () => {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined);
        if (!apiKey) {
            setAiAnalysis("**Configure GEMINI_API_KEY** in your environment to enable AI analysis.");
            return;
        }
        setIsAnalyzing(true);
        try {
            const genAI = new GoogleGenAI({ apiKey });

            const allocationSummary = allocation.map(a => `${a.name}: ${a.tactical}% (${a.delta >= 0 ? '+' : ''}${a.delta}% vs benchmark)`).join('\n');

            const prompt = `
        Act as a Chief Investment Officer at a top macro hedge fund. You are reviewing the morning cockpit brief. Analyze these vitals and provide a concise, actionable summary.
        
        MARKET VITALS:
        - VIX: ${vix?.toFixed(2) ?? 'N/A'}
        - 10Y Yield: ${yield10y?.toFixed(2) ?? 'N/A'}%
        - Real Yield (10Y TIPS): ${realYield?.toFixed(2) ?? 'N/A'}%
        - HY Spread: ${hySpread?.toFixed(2) ?? 'N/A'}%
        - Yield Curve (10Y-2Y): ${yieldCurve?.toFixed(2) ?? 'N/A'}%
        - Financial Stress (STLFSI): ${finStress?.toFixed(2) ?? 'N/A'}
        - Macro Activity (CFNAI): ${macroActivity?.toFixed(2) ?? 'N/A'}
        - 10Y Breakeven Inflation: ${breakeven10y?.toFixed(2) ?? 'N/A'}%
        - VIX Term Structure: ${vix && vxv ? (vix / vxv).toFixed(2) : 'N/A'}
        
        COMPOSITE SCORES:
        - Flight to Safety Risk Score: ${f2sScore}/100 (${riskLevel})
        - Current Macro Regime: ${regime.label}

        PREDICTIVE MODELS:
        - Recession Probability: ${recessionData?.composite ?? 'N/A'}% (${recessionData?.riskLevel ?? 'N/A'}, ${recessionData?.trend ?? 'N/A'})
        - Sahm Rule: ${recessionData?.sahm?.triggered ? 'TRIGGERED' : `Clear (${recessionData?.sahm?.current?.toFixed(2) ?? 'N/A'})`}
        - Fed Policy Stance: ${fedData?.current.policyStance ?? 'N/A'}
        - Taylor Rule Gap: ${fedData?.current.gap != null ? `${fedData.current.gap > 0 ? '+' : ''}${fedData.current.gap.toFixed(2)}%` : 'N/A'}
        - Real Policy Rate: ${fedData?.current.realRate?.toFixed(2) ?? 'N/A'}%

        TACTICAL ALLOCATION (Model Output):
        ${allocationSummary}

        Output strictly in this Markdown format:
        **Regime**: [2-3 words max, e.g. "Late Cycle Caution"]
        **Signal**: [RISK ON / RISK OFF / NEUTRAL]
        **Conviction**: [HIGH / MEDIUM / LOW]
        
        **Key Insight**: [1-2 sentences on the single most important driver right now]
        
        **Positioning**:
        - [Specific trade or tilt #1]
        - [Specific trade or tilt #2]
        - [Key risk to monitor]
      `;

            // @ts-ignore
            const result = await genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt
            });
            // @ts-ignore
            setAiAnalysis(result.text || result.response?.text() || "Analysis generated.");
        } catch (error) {
            console.error("AI Error:", error);
            setAiAnalysis("**Error**: Failed to generate analysis. Check your API key and try again.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        if (!loading && !aiAnalysis && vix !== null) {
            generateInsight();
        }
    }, [loading, vix]);

    useEffect(() => {
        if (!loading) {
            fetch('/api/models/recession-probability').then(r => r.json()).then(d => setRecessionData(d)).catch(() => { });
            fetch('/api/models/fed-policy').then(r => r.json()).then(d => setFedData(d)).catch(() => { });
        }
    }, [loading]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">

            {/* ── Row 0: Divergence Alert ── */}
            {(isDivergence || isStagflation) && (
                <div className={cn(
                    "rounded-2xl p-5 flex items-start gap-4 border animate-in slide-in-from-top-4 duration-500",
                    isStagflation ? "bg-rose-500/10 border-rose-500/20" : "bg-amber-500/10 border-amber-500/20"
                )}>
                    <div className={cn("p-2.5 rounded-xl shrink-0", isStagflation ? "bg-rose-500/20" : "bg-amber-500/20")}>
                        <AlertTriangle className={cn("w-5 h-5", isStagflation ? "text-rose-500" : "text-amber-500")} />
                    </div>
                    <div>
                        <h3 className={cn("text-sm font-semibold mb-1", isStagflation ? "text-rose-400" : "text-amber-400")}>
                            {isStagflation ? '⚠ Stagflationary Trap Detected' : '⚠ Silent Macro Divergence'}
                        </h3>
                        <p className={cn("text-xs leading-relaxed", isStagflation ? "text-rose-400/70" : "text-amber-400/70")}>
                            {isStagflation
                                ? `Regime reads "${regime.label}" but breakeven inflation is at ${breakeven10y?.toFixed(2)}% while macro activity is contracting. Classic stagflationary setup — consider reducing duration and adding commodity hedges.`
                                : `Regime reads "${regime.label}" but the Flight2Safety risk score is ${f2sScore}/100. Underlying stress indicators are diverging from the growth picture. Consider fading the risk-on signal.`
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* ── Row 1: Vitals Strip ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <VitalCard
                    label="Market Fear"
                    value={vix?.toFixed(1) ?? '--'}
                    unit="VIX"
                    status={vix ? (vix > 25 ? 'danger' : vix > 18 ? 'warning' : 'safe') : 'neutral'}
                    subtext={vix && vxv ? `Term: ${(vix / vxv).toFixed(2)}x` : undefined}
                />
                <VitalCard
                    label="Cost of Capital"
                    value={yield10y?.toFixed(2) ?? '--'}
                    unit="10Y %"
                    status={yield10y ? (yield10y > 4.5 ? 'warning' : 'neutral') : 'neutral'}
                    subtext={fedData?.current.gap != null ? `Gap: ${fedData.current.gap > 0 ? '+' : ''}${fedData.current.gap.toFixed(1)}%` : undefined}
                />
                <VitalCard
                    label="Credit Risk"
                    value={hySpread ? (hySpread * 100).toFixed(0) : '--'}
                    unit="bps"
                    status={hySpread ? (hySpread > 5.0 ? 'danger' : hySpread > 3.5 ? 'warning' : 'safe') : 'neutral'}
                />
                <VitalCard
                    label="Real Yield"
                    value={realYield?.toFixed(2) ?? '--'}
                    unit="TIPS"
                    status={realYield ? (realYield > 2.0 ? 'danger' : realYield > 1.5 ? 'warning' : 'neutral') : 'neutral'}
                />
                <VitalCard
                    label="Yield Curve"
                    value={yieldCurve?.toFixed(2) ?? '--'}
                    unit="10Y-2Y"
                    status={yieldCurve !== null ? (yieldCurve < 0 ? 'danger' : yieldCurve < 0.3 ? 'warning' : 'safe') : 'neutral'}
                />
                <VitalCard
                    label="Macro Activity"
                    value={macroActivity?.toFixed(2) ?? '--'}
                    unit="CFNAI"
                    status={macroActivity !== null ? (macroActivity < -0.5 ? 'danger' : macroActivity < 0 ? 'warning' : 'safe') : 'neutral'}
                    subtext={recessionData ? `Rec.Risk: ${recessionData.composite}%` : undefined}
                />
            </div>

            {/* ── Row 2: Main Grid (3 columns) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT: Regime Radar + Risk Factors */}
                <div className="lg:col-span-3 space-y-5">
                    {/* Regime Box */}
                    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                                <Crosshair className="w-3.5 h-3.5 text-white/40" />
                                Macro Regime
                            </h3>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setZoomLevel(prev => prev === 0.5 ? 1.0 : 0.5)}
                                    className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                                    title={zoomLevel === 0.5 ? "Zoom Out" : "Zoom In"}
                                >
                                    {zoomLevel === 0.5 ? <ZoomIn className="w-3.5 h-3.5" /> : <ZoomOut className="w-3.5 h-3.5" />}
                                </button>
                                <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded", regime.color, `${regime.bgColor}/10`)}>{regime.label}</span>
                            </div>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed mb-4">{regime.description}</p>

                        {/* Mini Scatter */}
                        <div className="h-[250px] relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 15 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={true} horizontal={true} />
                                    <XAxis
                                        type="number"
                                        dataKey="x"
                                        name="Stress"
                                        domain={[-zoomLevel, zoomLevel]}
                                        stroke="#666"
                                        tick={{ fontSize: 9, fill: '#888' }}
                                        ticks={zoomLevel === 0.5 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-1.0, -0.5, 0, 0.5, 1.0]}
                                        label={{ value: 'Stress →', position: 'bottom', fill: '#888', fontSize: 9, offset: 0 }}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="y"
                                        name="Growth"
                                        domain={[-zoomLevel, zoomLevel]}
                                        stroke="#666"
                                        tick={{ fontSize: 9, fill: '#888' }}
                                        ticks={zoomLevel === 0.5 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-1.0, -0.5, 0, 0.5, 1.0]}
                                        label={{ value: 'Growth →', angle: -90, position: 'left', fill: '#888', fontSize: 9, offset: 5 }}
                                    />
                                    <ZAxis type="number" dataKey="z" range={[4, 50]} />
                                    <ReferenceLine x={0} stroke="#222" strokeWidth={1} />
                                    <ReferenceLine y={0} stroke="#222" strokeWidth={1} />
                                    <ReferenceArea x1={-5} x2={0} y1={0} y2={5} fill="#10b981" fillOpacity={0.02} />
                                    <ReferenceArea x1={0} x2={5} y1={0} y2={5} fill="#f59e0b" fillOpacity={0.02} />
                                    <ReferenceArea x1={-5} x2={0} y1={-5} y2={0} fill="#3b82f6" fillOpacity={0.02} />
                                    <ReferenceArea x1={0} x2={5} y1={-5} y2={0} fill="#f43f5e" fillOpacity={0.02} />

                                    <Scatter name="Path" data={pathData} line={{ stroke: '#818cf8', strokeWidth: 1, strokeDasharray: '4 4' }} lineType="joint">
                                        {pathData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill="#818cf8" fillOpacity={entry.opacity} stroke="#818cf8" strokeWidth={1} />
                                        ))}
                                    </Scatter>

                                    <Scatter name="Now" data={nowData}>
                                        <Cell
                                            fill={riskLevel === 'CRITICAL' ? '#f43f5e' : riskLevel === 'ELEVATED' ? '#f59e0b' : '#10b981'}
                                            className="animate-pulse"
                                            style={{ filter: 'drop-shadow(0 0 8px currentColor)', stroke: '#fff', strokeWidth: 1.5 }}
                                        />
                                    </Scatter>

                                    <Tooltip content={({ active, payload }: any) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-[#050505] border border-white/10 p-2.5 rounded-lg shadow-2xl text-[10px] font-mono backdrop-blur-md">
                                                    <div className="text-white/40 mb-1.5 flex items-center gap-2 border-b border-white/5 pb-1">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full", d.date === 'LATEST' ? "bg-emerald-500" : "bg-indigo-400")} />
                                                        {d.date} {d.date === 'LATEST' ? '' : '(Avg)'}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between gap-6">
                                                            <span className="text-white/20">GROWTH (Y)</span>
                                                            <span className="text-white/90 font-bold">{d.y?.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between gap-6">
                                                            <span className="text-white/20">STRESS (X)</span>
                                                            <span className="text-white/90 font-bold">{d.x?.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }} />
                                </ScatterChart>
                            </ResponsiveContainer>
                            <div className="absolute top-1 left-2 text-[9px] text-emerald-500/60 font-bold uppercase tracking-widest">Goldilocks</div>
                            <div className="absolute top-1 right-2 text-[9px] text-amber-500/60 font-bold uppercase tracking-widest">Overheating</div>
                            <div className="absolute bottom-6 left-2 text-[9px] text-blue-500/60 font-bold uppercase tracking-widest">Slowdown</div>
                            <div className="absolute bottom-6 right-2 text-[9px] text-rose-500/60 font-bold uppercase tracking-widest">Crisis</div>
                        </div>
                    </div>

                    {/* Risk Factor Bars */}
                    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                                <ShieldAlert className={cn("w-3.5 h-3.5", riskColor)} />
                                Flight to Safety Score
                            </h3>
                            <div className={cn("text-sm font-bold font-mono px-2 py-0.5 rounded bg-white/5", riskColor)}>
                                {loading ? '--' : f2sScore}<span className="text-white/30 font-normal">/100</span>
                            </div>
                        </div>
                        <div className={cn("text-[10px] font-bold uppercase tracking-widest mb-4 text-center py-1.5 rounded-md bg-white/5", riskColor)}>
                            {loading ? 'CALCULATING...' : riskLevel}
                        </div>
                        <div className="space-y-3">
                            {liveScorecard.map(item => (
                                <div key={item.id} className="group">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={cn("text-[10px] font-mono", getStatusColor(item.pct))}>
                                                {item.liveValue?.toFixed(2) ?? '--'}{item.unit}
                                            </span>
                                            <span className="text-[10px] font-mono text-white/25">{item.currentScore}/{item.weight}</span>
                                        </div>
                                    </div>
                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className={cn("h-full rounded-full transition-all duration-1000", getStatusBg(item.pct))}
                                            style={{ width: `${item.pct * 100}%`, boxShadow: item.pct > 0.6 ? `0 0 8px ${item.pct > 0.75 ? 'rgba(244,63,94,0.5)' : 'rgba(245,158,11,0.5)'}` : undefined }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* CENTER: AI Analyst + Allocation */}
                <div className="lg:col-span-5 space-y-5">
                    {/* AI Command Center */}
                    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#111]">
                            <div className="flex items-center gap-2">
                                <BrainCircuit className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-medium text-white/90">AI CIO Briefing</span>
                                {lastSynced && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] text-white/30 font-mono ml-2">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500/50" />
                                        {new Date(lastSynced).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={generateInsight}
                                disabled={isAnalyzing}
                                className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", isAnalyzing && "animate-spin")} />
                            </button>
                        </div>

                        <div className="p-5 min-h-[220px] max-h-[320px] overflow-y-auto font-mono text-[13px] leading-relaxed relative custom-scrollbar">
                            {isAnalyzing ? (
                                <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 bg-[#0f0f0f]/80 backdrop-blur-sm z-10">
                                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                    <div className="text-xs text-blue-400 animate-pulse">SYNTHESIZING MARKET DATA...</div>
                                </div>
                            ) : aiAnalysis ? (
                                <div className="markdown-body text-white/75 space-y-3 prose-sm">
                                    <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-white/25 gap-2">
                                    <Terminal className="w-8 h-8 opacity-50" />
                                    <span className="text-xs">Awaiting data for analysis...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tactical Asset Allocation */}
                    <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider flex items-center gap-2">
                                <PieChart className="w-3.5 h-3.5 text-indigo-400" />
                                Tactical Asset Allocation
                            </h3>
                            <div className="text-[10px] text-white/30 font-mono">BENCHMARK → TACTICAL</div>
                        </div>
                        <div className="space-y-4">
                            {allocation.map(a => (
                                <AllocationBar key={a.id} {...a} />
                            ))}
                        </div>
                        <div className="mt-5 pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2 text-[10px] text-white/30">
                                <Signal className="w-3 h-3" />
                                <span>Allocation driven by Flight to Safety score ({f2sScore}/100), yield curve ({yieldCurve?.toFixed(2)}%), breakeven ({breakeven10y?.toFixed(2)}%)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Macro Sensing Cards */}
                <div className="lg:col-span-4 space-y-4">
                    <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider flex items-center gap-2 px-1">
                        <Layers className="w-3.5 h-3.5" />
                        Macro Sensing Modules
                    </h3>

                    <MacroSenseCard
                        title="Credit Cycle"
                        status={hySpread !== null ? (hySpread > 4.5 ? 'Contracting' : hySpread > 3.0 ? 'Late Cycle' : 'Expanding') : 'Loading'}
                        statusColor={hySpread !== null ? (hySpread > 4.5 ? 'rose' : hySpread > 3.0 ? 'amber' : 'emerald') : 'amber'}
                        indicators={[
                            { label: 'HY Spreads (OAS)', value: hySpread ? `${hySpread.toFixed(2)}%` : '--', trend: hySpread && hySpread > 3.5 ? 'up' : 'flat' },
                            { label: 'Fin. Stress (STLFSI)', value: finStress?.toFixed(2) ?? '--', trend: finStress && finStress > 0 ? 'up' : 'down' }
                        ]}
                        eqSignal={hySpread && hySpread > 4.0 ? 'UW' : 'OW'}
                        fiSignal={hySpread && hySpread > 4.0 ? 'OW' : 'UW'}
                        coSignal={hySpread && hySpread > 4.0 ? 'UW' : 'N'}
                        onClick={() => setActiveModel('credit')}
                    />

                    <MacroSenseCard
                        title="Recession Risk"
                        status={recessionData?.riskLevel ?? 'Loading'}
                        statusColor={recessionData?.riskLevel === 'Elevated' ? 'rose' : recessionData?.riskLevel === 'Low' ? 'emerald' : 'amber'}
                        indicators={[
                            { label: 'Composite Probability', value: recessionData ? `${recessionData.composite}%` : '--', trend: recessionData?.trend === 'Rising' ? 'up' : recessionData?.trend === 'Falling' ? 'down' : 'flat' },
                            { label: 'Sahm Rule', value: recessionData?.sahm ? (recessionData.sahm.triggered ? 'TRIGGERED' : `${recessionData.sahm.current.toFixed(2)}`) : '--', trend: recessionData?.sahm?.triggered ? 'up' : 'flat' }
                        ]}
                        eqSignal={recessionData?.riskLevel === 'Elevated' ? 'UW' : recessionData?.riskLevel === 'Low' ? 'OW' : 'N'}
                        fiSignal={recessionData?.riskLevel === 'Elevated' ? 'OW' : 'N'}
                        coSignal={recessionData?.riskLevel === 'Elevated' ? 'UW' : 'N'}
                        onClick={() => setActiveModel('recession')}
                    />

                    <MacroSenseCard
                        title="Inflation Regime"
                        status={breakeven10y ? (breakeven10y > 2.5 ? 'Elevated' : breakeven10y > 2.0 ? 'Stable' : 'Low') : 'Loading'}
                        statusColor={breakeven10y ? (breakeven10y > 2.5 ? 'amber' : 'emerald') : 'amber'}
                        indicators={[
                            { label: '10Y Breakeven', value: breakeven10y ? `${breakeven10y.toFixed(2)}%` : '--', trend: breakeven10y && breakeven10y > 2.3 ? 'up' : 'flat' },
                            { label: 'Cost of Capital', value: yield10y ? `${yield10y.toFixed(2)}%` : '--', trend: yield10y && yield10y > 4.0 ? 'up' : 'flat' }
                        ]}
                        eqSignal={breakeven10y && breakeven10y > 2.5 ? 'UW' : 'N'}
                        fiSignal={breakeven10y && breakeven10y > 2.5 ? 'UW' : 'OW'}
                        coSignal={breakeven10y && breakeven10y > 2.5 ? 'OW' : 'N'}
                        onClick={() => setActiveModel('inflation')}
                    />

                    <MacroSenseCard
                        title="Fed Policy"
                        status={fedData?.current.policyStance ?? 'Loading'}
                        statusColor={fedData?.current.policyStance?.includes('Restrictive') ? 'rose' : fedData?.current.policyStance?.includes('Accommodative') ? 'emerald' : 'amber'}
                        indicators={[
                            { label: 'Taylor Rule Gap', value: fedData?.current.gap != null ? `${fedData.current.gap > 0 ? '+' : ''}${fedData.current.gap.toFixed(2)}%` : '--', trend: fedData?.current.gap != null ? (fedData.current.gap > 0.5 ? 'up' : fedData.current.gap < -0.5 ? 'down' : 'flat') : 'flat' },
                            { label: 'Real Rate (TIPS)', value: fedData?.current.realRate != null ? `${fedData.current.realRate.toFixed(2)}%` : '--', trend: fedData?.current.realRate != null ? (fedData.current.realRate > 1.5 ? 'up' : 'flat') : 'flat' }
                        ]}
                        eqSignal={fedData?.current.gap != null ? (fedData.current.gap > 1.0 ? 'UW' : fedData.current.gap < -1.0 ? 'OW' : 'N') : 'N'}
                        fiSignal={fedData?.current.gap != null ? (fedData.current.gap > 1.0 ? 'OW' : 'N') : 'N'}
                        coSignal="N"
                        onClick={() => setActiveModel('fed-policy')}
                    />
                </div>
            </div>

            {/* ── Row 3: Quick Navigation ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <NavigationCard title="Flight to Safety" icon={ShieldAlert} statusLabel={`Score: ${f2sScore}`} onClick={() => setActiveModel('flight2safety')} />
                <NavigationCard title="Sector Rotation" icon={BarChart3} statusLabel="Scorecard" onClick={() => setActiveModel('sector')} />
                <NavigationCard title="Regime Model" icon={Cpu} statusLabel={regime.label} onClick={() => setActiveModel('regime')} />
                <NavigationCard title="Recession Prob." icon={Activity} statusLabel={recessionData ? `${recessionData.composite}% · ${recessionData.riskLevel}` : 'Monitor'} onClick={() => setActiveModel('recession')} />
                <NavigationCard title="Fed Policy" icon={Target} statusLabel={fedData?.current.policyStance ?? 'Taylor Rule'} onClick={() => setActiveModel('fed-policy')} />
                <NavigationCard title="Bond Scorecard" icon={Gauge} statusLabel="Environment" onClick={() => setActiveModel('bond-scorecard')} />
                <NavigationCard title="Market Sentiment" icon={MessageSquare} statusLabel="Pulse" onClick={() => setActiveModel('sentiment')} />
                <NavigationCard title="Scenario Analysis" icon={Sparkles} statusLabel="Simulator" onClick={() => setActiveModel('scenario')} />
            </div>
        </div>
    );
}
