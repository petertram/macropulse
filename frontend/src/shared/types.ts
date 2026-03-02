export interface FredObservation {
    id: string;
    value: string | number | null;
    date: string | null;
}

export interface ScorecardConfig {
    id: string;
    name: string;
    weight: number;
    series: string[];
    calc: (vals: number[]) => number;
    minRisk: number;
    maxRisk: number;
    unit: string;
    desc: string;
}

export interface AppendixItem {
    id: string;
    name: string;
    desc: string;
}

export interface HistoryDataPoint {
    date: string;
    raw_date: string;
    return_diff: number;
    hy_spread: number | null;
    yield_curve: number | null;
    fin_stress: number | null;
    macro_activity: number | null;
    vix_term: number | null;
    real_yield: number | null;
    spx_fwd: number;
    us10y_fwd: number;
    raw_inputs: Record<string, any>;
    [key: string]: any;
}
