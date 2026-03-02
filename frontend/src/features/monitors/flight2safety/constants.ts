import { ScorecardConfig, AppendixItem } from '../../../shared/types';

export const scorecardConfig: ScorecardConfig[] = [
    {
        id: 'hy_spread',
        name: 'HY Spread Widening',
        weight: 25,
        series: ['BAMLH0A0HYM2'],
        calc: (vals: number[]) => vals[0],
        minRisk: 2.0,
        maxRisk: 5.0,
        unit: '%',
        desc: 'ICE BofA US High Yield Spread'
    },
    {
        id: 'yield_curve',
        name: 'Yield Curve Inversion',
        weight: 20,
        series: ['T10Y2Y'],
        calc: (vals: number[]) => vals[0],
        minRisk: 1.0,
        maxRisk: -0.5,
        unit: '%',
        desc: '10Y-2Y Treasury Spread'
    },
    {
        id: 'fin_stress',
        name: 'Financial Stress Index',
        weight: 20,
        series: ['STLFSI4'],
        calc: (vals: number[]) => vals[0],
        minRisk: -1.0,
        maxRisk: 1.0,
        unit: 'pts',
        desc: 'St. Louis Fed Financial Stress Index'
    },
    {
        id: 'macro_activity',
        name: 'Macro Contraction',
        weight: 15,
        series: ['CFNAI'],
        calc: (vals: number[]) => vals[0],
        minRisk: 0.5,
        maxRisk: -0.5,
        unit: 'pts',
        desc: 'Chicago Fed National Activity Index'
    },
    {
        id: 'vix_term',
        name: 'VIX Term Structure',
        weight: 10,
        series: ['VIXCLS', 'VXVCLS'],
        calc: (vals: number[]) => vals[0] / vals[1],
        minRisk: 0.8,
        maxRisk: 1.0,
        unit: 'x',
        desc: 'VIX 1M / VIX 3M Ratio'
    },
    {
        id: 'real_yield',
        name: 'Real Yields > 2.0%',
        weight: 10,
        series: ['DFII10'],
        calc: (vals: number[]) => vals[0],
        minRisk: 0.0,
        maxRisk: 2.0,
        unit: '%',
        desc: '10-Year Treasury Inflation-Indexed Security'
    }
];

export const appendixData: AppendixItem[] = [
    { id: 'hy_spread', name: 'High-Yield (HY) Spread', desc: 'The difference in yield between high-yield corporate bonds and treasury bonds. Widening spreads indicate growing default risk and economic stress, often preceding equity sell-offs. The model tracks the ICE BofA US High Yield Index Option-Adjusted Spread.' },
    { id: 'yield_curve', name: 'Yield Curve Inversion (10Y-2Y)', desc: 'The spread between the 10-Year and 2-Year Treasury yields. An inverted curve (below 0%) is a classic leading indicator of recession, signaling tight near-term monetary policy and poor long-term growth expectations.' },
    { id: 'fin_stress', name: 'Financial Stress Index', desc: 'The St. Louis Fed Financial Stress Index measures the degree of financial stress in the markets. A value above zero indicates above-average financial market stress. Values approaching 1.0 signal systemic risk.' },
    { id: 'macro_activity', name: 'Macro Contraction (CFNAI)', desc: 'The Chicago Fed National Activity Index is a monthly index designed to gauge overall economic activity and related inflationary pressure. A value below -0.5 historically signals an increasing likelihood of a recession.' },
    { id: 'vix_term', name: 'VIX Term Structure (1M/3M)', desc: 'The relationship between short-term (1M) and long-term (3M) volatility expectations. An inversion (ratio > 1.0) indicates acute near-term panic and backwardation, often marking a capitulation point in equities.' },
    { id: 'real_yield', name: 'Real Yields (10Y TIPS)', desc: 'The yield on 10-Year Treasury Inflation-Protected Securities. High real yields (approaching 2.0%) tighten financial conditions significantly, making bonds highly attractive relative to equities and slowing economic growth.' },
];
