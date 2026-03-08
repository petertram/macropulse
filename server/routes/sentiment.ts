import { Router } from 'express';
import { db } from '../db/client.js';
import { logger } from '../logger.js';
import { getPercentileRank } from '../utils.js';
import { SENTIMENT_LOOKBACK_MONTHS, SENTIMENT_THRESHOLDS, SENTIMENT_MOMENTUM_THRESHOLD } from '../constants.js';

export const sentimentRouter = Router();
const router = sentimentRouter;

/**
 * Sentiment component definitions.
 * Each component is normalized to a 1-year percentile rank (0-100).
 * "invert" means higher raw values = more fear (lower score).
 */
const SENTIMENT_COMPONENTS = [
  { id: 'VIXCLS', name: 'VIX (Volatility)', weight: 0.20, invert: true, source: 'fred' },
  { id: 'BAMLH0A0HYM2', name: 'HY Credit Spread', weight: 0.15, invert: true, source: 'fred' },
  { id: 'UMCSENT', name: 'Consumer Sentiment', weight: 0.15, invert: false, source: 'fred' },
  { id: 'USEPUINDXD', name: 'Policy Uncertainty', weight: 0.10, invert: true, source: 'fred' },
  { id: 'NFCI', name: 'Financial Conditions', weight: 0.15, invert: true, source: 'fred' },
  { id: 'STLFSI4', name: 'Financial Stress', weight: 0.15, invert: true, source: 'fred' },
  { id: 'XLU_XLY', name: 'Defensive/Cyclical Ratio', weight: 0.10, invert: true, source: 'derived' },
] as const;

router.get('/', (req, res) => {
  try {
    // 1. Load all history (monthly + daily)
    const monthlyStmt = db.prepare('SELECT data FROM fred_history ORDER BY month_key ASC');
    const monthlyData = monthlyStmt.all().map((r: any) => JSON.parse(r.data));
    const dailyStmt = db.prepare('SELECT data FROM fred_daily ORDER BY date_key ASC');
    const dailyData = dailyStmt.all().map((r: any) => JSON.parse(r.data));
    const allData = [...monthlyData, ...dailyData];

    if (allData.length === 0) {
      return res.json({
        composite: 50, regime: 'Neutral', components: [],
        institutional: 50, consumer: 50, history: [], analysis: 'No data available.'
      });
    }

    // 2. Derive XLU/XLY ratio for each data point
    for (const row of allData) {
      if (row.XLU && row.XLY && row.XLY > 0) {
        row['XLU_XLY'] = row.XLU / row.XLY;
      }
    }

    // 3. For each component, extract time series and compute percentile rank at each point
    // (getPercentileRank is imported from utils.ts)

    // Build per-component time series
    const componentTimelines: Record<string, { date: string; value: number }[]> = {};
    for (const comp of SENTIMENT_COMPONENTS) {
      componentTimelines[comp.id] = [];
    }
    for (const row of allData) {
      const date = row.date || '';
      for (const comp of SENTIMENT_COMPONENTS) {
        const val = row[comp.id];
        if (val !== undefined && val !== null && !isNaN(val)) {
          componentTimelines[comp.id].push({ date, value: val });
        }
      }
    }

    // 4. Compute composite score at each monthly point
    // We downsample to monthly for the history (last observation per month)
    const monthBuckets: Record<string, Record<string, number>> = {};
    for (const comp of SENTIMENT_COMPONENTS) {
      for (const pt of componentTimelines[comp.id]) {
        const mk = pt.date.substring(0, 7);
        if (!monthBuckets[mk]) monthBuckets[mk] = {};
        monthBuckets[mk][comp.id] = pt.value; // last-write-wins
      }
    }

    const sortedMonths = Object.keys(monthBuckets).sort();
    const history: { date: string; composite: number; institutional: number; consumer: number }[] = [];

    for (let mi = 0; mi < sortedMonths.length; mi++) {
      const mk = sortedMonths[mi];
      const current = monthBuckets[mk];

      // Lookback window: previous 12 months of data for percentile ranking
      const lookbackStart = Math.max(0, mi - SENTIMENT_LOOKBACK_MONTHS);

      let weightedSum = 0;
      let totalWeight = 0;
      let instSum = 0, instWeight = 0;
      let consSum = 0, consWeight = 0;

      for (const comp of SENTIMENT_COMPONENTS) {
        const currentVal = current[comp.id];
        if (currentVal === undefined || currentVal === null) continue;

        // Gather lookback values for this component
        const lookbackValues: number[] = [];
        for (let li = lookbackStart; li <= mi; li++) {
          const val = monthBuckets[sortedMonths[li]]?.[comp.id];
          if (val !== undefined && val !== null) lookbackValues.push(val);
        }

        if (lookbackValues.length < 3) continue; // Need minimum data

        let pctRank = getPercentileRank(lookbackValues, currentVal);
        // Invert: high VIX = low score (more fear)
        if (comp.invert) pctRank = 100 - pctRank;

        weightedSum += pctRank * comp.weight;
        totalWeight += comp.weight;

        // Categorize into Institutional vs Consumer sub-indices
        const instIds = ['VIXCLS', 'BAMLH0A0HYM2', 'NFCI', 'STLFSI4', 'XLU_XLY'];
        const consIds = ['UMCSENT', 'USEPUINDXD'];
        if (instIds.includes(comp.id)) { instSum += pctRank * comp.weight; instWeight += comp.weight; }
        if (consIds.includes(comp.id)) { consSum += pctRank * comp.weight; consWeight += comp.weight; }
      }

      const composite = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;
      const institutional = instWeight > 0 ? Math.round(instSum / instWeight) : 50;
      const consumer = consWeight > 0 ? Math.round(consSum / consWeight) : 50;

      history.push({ date: mk + '-01', composite, institutional, consumer });
    }

    // 5. Current values
    const latest = history.length > 0 ? history[history.length - 1] : { composite: 50, institutional: 50, consumer: 50 };
    const prev3m = history.length > 3 ? history[history.length - 4] : null;

    // 6. Component breakdown for the current reading
    const latestMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : null;
    const componentBreakdown: { id: string; name: string; score: number; weight: number; rawValue: number | null }[] = [];
    if (latestMonth) {
      const mi = sortedMonths.length - 1;
      const lookbackStart = Math.max(0, mi - SENTIMENT_LOOKBACK_MONTHS);
      for (const comp of SENTIMENT_COMPONENTS) {
        const currentVal = monthBuckets[latestMonth]?.[comp.id];
        if (currentVal === undefined || currentVal === null) {
          componentBreakdown.push({ id: comp.id, name: comp.name, score: 50, weight: comp.weight, rawValue: null });
          continue;
        }
        const lookbackValues: number[] = [];
        for (let li = lookbackStart; li <= mi; li++) {
          const val = monthBuckets[sortedMonths[li]]?.[comp.id];
          if (val !== undefined && val !== null) lookbackValues.push(val);
        }
        let pctRank = lookbackValues.length >= 3 ? getPercentileRank(lookbackValues, currentVal) : 50;
        if (comp.invert) pctRank = 100 - pctRank;
        componentBreakdown.push({ id: comp.id, name: comp.name, score: Math.round(pctRank), weight: comp.weight, rawValue: currentVal });
      }
    }

    // 7. Regime classification
    const composite = latest.composite;
    let regime = 'Neutral';
    if (composite <= 20) regime = 'Extreme Fear';
    else if (composite <= 35) regime = 'Fear';
    else if (composite >= 80) regime = 'Extreme Greed';
    else if (composite >= 65) regime = 'Greed';

    // 8. Divergence detection (institutional vs consumer)
    const divergence = Math.abs(latest.institutional - latest.consumer);
    const isDiverging = divergence > 20;

    // 9. Dynamic analysis text
    const momentum = prev3m ? latest.composite - prev3m.composite : 0;
    const momentumLabel = momentum > 5 ? 'improving' : momentum < -5 ? 'deteriorating' : 'stable';

    let analysis = '';
    if (composite <= 25) {
      analysis = `Market sentiment has reached Extreme Fear territory (${composite}/100). `
        + `Institutional positioning shows a ${latest.institutional}/100 risk appetite score, while consumer confidence reads ${latest.consumer}/100. `
        + `Historically, extreme fear readings have preceded significant market rallies within 3-6 months. `
        + `Contrarian signal: consider accumulating high-quality risk assets.`;
    } else if (composite >= 75) {
      analysis = `Market sentiment is in Extreme Greed territory (${composite}/100). `
        + `Institutional risk appetite is elevated at ${latest.institutional}/100, and consumer confidence is at ${latest.consumer}/100. `
        + `Extreme greed historically precedes corrections. `
        + `Contrarian signal: reduce risk exposure and build defensive hedges.`;
    } else if (isDiverging) {
      const leader = latest.institutional > latest.consumer ? 'Institutional' : 'Consumer';
      const laggard = latest.institutional > latest.consumer ? 'Consumer' : 'Institutional';
      analysis = `Market sentiment is ${regime} (${composite}/100) but showing a significant divergence. `
        + `${leader} sentiment (${Math.max(latest.institutional, latest.consumer)}/100) is materially higher than ${laggard} sentiment (${Math.min(latest.institutional, latest.consumer)}/100). `
        + `Institutional-led divergences tend to be forward-looking; consumer sentiment typically lags. `
        + `Watch for convergence as a confirmation signal.`;
    } else {
      analysis = `Market sentiment is ${regime} (${composite}/100) and ${momentumLabel}. `
        + `Institutional and consumer sub-indices are aligned at ${latest.institutional}/100 and ${latest.consumer}/100 respectively. `
        + `No significant contrarian signal at current levels. Monitor for moves toward extremes (<25 or >75) for actionable setups.`;
    }

    res.json({
      composite,
      regime,
      institutional: latest.institutional,
      consumer: latest.consumer,
      momentum: { value: Math.round(momentum), label: momentumLabel },
      divergence: { value: Math.round(divergence), isDiverging },
      components: componentBreakdown,
      history,
      analysis,
    });
  } catch (error) {
    logger.error('sentiment', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute sentiment index' });
  }
});
