import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { db } from '../db/client.js';
import { logger } from '../logger.js';
import { lastYearLastMonth, getPercentileRank, pearsonCorrelation } from '../utils.js';
import { ESI_LOOKBACK_MONTHS, CORRELATION_WINDOWS, REGIME_THRESHOLDS, MIN_CORRELATION_OBSERVATIONS } from '../constants.js';

export const modelsRouter = Router();
const router = modelsRouter;
const yahooFinance = new YahooFinance();

/**
 * ESI Module Definitions — each module aggregates Z-scores of related FRED series.
 * Z-score = (latest - rolling_mean) / rolling_std
 * `invert: true` means lower values = positive surprise (e.g. jobless claims).
 */
const ESI_MODULES = {
  labor: {
    label: 'Labor',
    series: [
      { id: 'PAYEMS', name: 'Nonfarm Payrolls', invert: false },
      { id: 'ICSA', name: 'Initial Claims', invert: true },
      { id: 'UNRATE', name: 'Unemployment Rate', invert: true },
    ]
  },
  growth: {
    label: 'Growth',
    series: [
      { id: 'INDPRO', name: 'Industrial Production', invert: false },
      { id: 'RSAFS', name: 'Retail Sales', invert: false },
      { id: 'HOUST', name: 'Housing Starts', invert: false },
      { id: 'DGORDER', name: 'Durable Goods Orders', invert: false },
      { id: 'BOPGSTB', name: 'Trade Balance', invert: false },
    ]
  },
  inflation: {
    label: 'Inflation',
    series: [
      { id: 'CPIAUCSL', name: 'CPI All Urban', invert: false },
      { id: 'PCEPI', name: 'PCE Price Index', invert: false },
    ]
  }
};

const ESI_LOOKBACK = ESI_LOOKBACK_MONTHS;

router.get('/economic-surprise', (req, res) => {
  try {
    // 1. Read all monthly history + daily data (same pattern as /api/fred/history)
    const lastMonth = lastYearLastMonth();
    const monthlyStmt = db.prepare('SELECT data FROM fred_history ORDER BY month_key ASC');
    const monthlyData = monthlyStmt.all().map((r: any) => JSON.parse(r.data));
    const dailyStmt = db.prepare('SELECT data FROM fred_daily ORDER BY date_key ASC');
    const dailyData = dailyStmt.all().map((r: any) => JSON.parse(r.data));

    // Combine into one sorted timeline
    const allData = [...monthlyData, ...dailyData];
    if (allData.length === 0) {
      return res.json({ current: 0, momentum: 'N/A', modules: {}, history: [] });
    }

    // 2. For each ESI series, extract its time series of values
    const allSeriesIds = Object.values(ESI_MODULES).flatMap(m => m.series);

    const seriesTimeline: Record<string, { date: string; value: number }[]> = {};
    for (const s of [...allSeriesIds, { id: 'STLENI' }]) {
      seriesTimeline[s.id] = [];
    }

    // Sort allData by date to ensure forward-filling works correctly
    const sortedData = [...allData].sort((a, b) => a.date.localeCompare(b.date));

    // Keep track of last seen value for each series to forward-fill gaps (e.g. for quarterly STLENI)
    const lastSeen: Record<string, number | null> = {};

    for (const row of sortedData) {
      const date = row.date || '';
      for (const s of [...allSeriesIds, { id: 'STLENI' }]) {
        const val = row[s.id];
        if (val !== undefined && val !== null && val !== '.') {
          lastSeen[s.id] = typeof val === 'string' ? parseFloat(val) : val;
        }

        // Always push the last seen value for every row to align timelines
        if (lastSeen[s.id] !== undefined && lastSeen[s.id] !== null) {
          seriesTimeline[s.id].push({ date, value: lastSeen[s.id] as number });
        }
      }
    }

    // 3. For each series, compute Z-score at each point (after enough lookback)
    function computeZScores(values: { date: string; value: number }[], invert: boolean): { date: string; z: number }[] {
      const result: { date: string; z: number }[] = [];
      for (let i = ESI_LOOKBACK; i < values.length; i++) {
        const window = values.slice(i - ESI_LOOKBACK, i);
        const mean = window.reduce((s, v) => s + v.value, 0) / window.length;
        const variance = window.reduce((s, v) => s + (v.value - mean) ** 2, 0) / window.length;
        const std = Math.sqrt(variance);
        if (std === 0) {
          result.push({ date: values[i].date, z: 0 });
          continue;
        }
        let z = (values[i].value - mean) / std;
        if (invert) z = -z;
        // Clamp to [-3, 3] to avoid outlier distortion
        z = Math.max(-3, Math.min(3, z));
        result.push({ date: values[i].date, z });
      }
      return result;
    }

    const seriesZScores: Record<string, { date: string; z: number }[]> = {};
    for (const s of allSeriesIds) {
      seriesZScores[s.id] = computeZScores(seriesTimeline[s.id], s.invert);
    }
    // Also Z-score the benchmark STLENI for alignment
    const benchmarkZ = seriesTimeline['STLENI'] ? computeZScores(seriesTimeline['STLENI'], false) : [];

    // 4. Build a date-aligned composite: for each unique date, average Z-scores per module, then across modules
    const dateSet = new Set<string>();
    for (const scores of Object.values(seriesZScores)) {
      for (const pt of scores) dateSet.add(pt.date);
    }
    for (const pt of benchmarkZ) dateSet.add(pt.date);
    const sortedDates = Array.from(dateSet).sort();

    // Build lookup
    const zLookup: Record<string, Record<string, number>> = {};
    for (const [sid, scores] of Object.entries(seriesZScores)) {
      for (const pt of scores) {
        if (!zLookup[pt.date]) zLookup[pt.date] = {};
        zLookup[pt.date][sid] = pt.z;
      }
    }
    const benchLookup: Record<string, number> = {};
    for (const pt of benchmarkZ) benchLookup[pt.date] = pt.z;

    // 5. Compute per-module and composite scores for each date
    const history: {
      date: string;
      composite: number;
      labor: number | null;
      growth: number | null;
      inflation: number | null;
      benchmark: number | null;
    }[] = [];

    for (const date of sortedDates) {
      const zs = zLookup[date] || {};
      const moduleScores: Record<string, number | null> = {};

      for (const [key, mod] of Object.entries(ESI_MODULES)) {
        const vals = mod.series.map(s => zs[s.id]).filter(v => v !== undefined);
        moduleScores[key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }

      const validModules = Object.values(moduleScores).filter(v => v !== null) as number[];
      const composite = validModules.length > 0 ? validModules.reduce((a, b) => a + b, 0) / validModules.length : 0;

      history.push({
        date,
        composite: Math.round(composite * 100) / 100,
        labor: moduleScores.labor !== null ? Math.round(moduleScores.labor * 100) / 100 : null,
        growth: moduleScores.growth !== null ? Math.round(moduleScores.growth * 100) / 100 : null,
        inflation: moduleScores.inflation !== null ? Math.round(moduleScores.inflation * 100) / 100 : null,
        benchmark: benchLookup[date] !== undefined ? Math.round(benchLookup[date] * 100) / 100 : null,
      });
    }

    // 6. Downsample: keep only monthly points (last observation per month) to avoid huge payloads
    const monthlyHistory: typeof history = [];
    const monthMap: Record<string, typeof history[number]> = {};
    for (const pt of history) {
      const monthKey = pt.date.substring(0, 7);
      monthMap[monthKey] = pt; // last write wins (latest observation in that month)
    }
    for (const mk of Object.keys(monthMap).sort()) {
      monthlyHistory.push(monthMap[mk]);
    }

    // 7. Current values & momentum
    const latest = monthlyHistory.length > 0 ? monthlyHistory[monthlyHistory.length - 1] : null;
    const prev = monthlyHistory.length > 3 ? monthlyHistory[monthlyHistory.length - 4] : null; // 3 months ago
    const momentumValue = latest && prev ? latest.composite - prev.composite : 0;
    const momentumLabel = momentumValue > 0.15 ? 'Accelerating' : momentumValue < -0.15 ? 'Decelerating' : 'Stable';

    // 8. Determine which module is driving the current reading
    let driver = 'Balanced';
    if (latest) {
      const mods = [
        { key: 'labor', val: latest.labor, label: 'Labor' },
        { key: 'growth', val: latest.growth, label: 'Growth' },
        { key: 'inflation', val: latest.inflation, label: 'Inflation' },
      ].filter(m => m.val !== null);
      if (mods.length > 0) {
        mods.sort((a, b) => Math.abs(b.val!) - Math.abs(a.val!));
        driver = mods[0].label;
      }
    }

    // 9. Generate dynamic analysis text
    const currentComposite = latest?.composite ?? 0;
    const direction = currentComposite > 0.2 ? 'positive' : currentComposite < -0.2 ? 'negative' : 'neutral';
    const pulse = currentComposite > 0.2 ? 'Expanding' : currentComposite < -0.2 ? 'Contracting' : 'In-Line';

    let analysis = '';
    if (direction === 'positive') {
      analysis = `The Economic Surprise Index is currently Positive (${currentComposite.toFixed(2)}σ) and ${momentumLabel.toLowerCase()}. Macro data releases are consistently beating the recent trend, primarily driven by ${driver} data. This signals economic resilience and may support "higher for longer" rate expectations.`;
    } else if (direction === 'negative') {
      analysis = `The Economic Surprise Index is currently Negative (${currentComposite.toFixed(2)}σ) and ${momentumLabel.toLowerCase()}. Macro releases are undershooting the recent trend, led by weakness in ${driver}. This may signal a growth slowdown and could support more accommodative monetary policy.`;
    } else {
      analysis = `The Economic Surprise Index is near Neutral (${currentComposite.toFixed(2)}σ). Macro releases are broadly in line with recent trends. The ${driver} module shows the most deviation. Watch for breakout above +0.5σ or below -0.5σ for a directional signal.`;
    }

    res.json({
      current: currentComposite,
      momentum: { value: Math.round(momentumValue * 100) / 100, label: momentumLabel },
      pulse,
      driver,
      analysis,
      modules: {
        labor: latest?.labor ?? 0,
        growth: latest?.growth ?? 0,
        inflation: latest?.inflation ?? 0,
      },
      history: monthlyHistory,
    });
  } catch (error) {
    logger.error('economic-surprise', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute Economic Surprise Index' });
  }
});

// ── Recession Probability Model ──────────────────────────────────────────────

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17, Horner's method).
 * Used for the Estrella-Mishkin yield curve probit model.
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

/**
 * GET /api/models/recession-probability
 * Computes the Sahm Rule real-time indicator and Estrella-Mishkin probit probability.
 */
router.get('/recession-probability', (req, res) => {
  try {
    // Load all monthly + daily data
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    // ── Sahm Rule ────────────────────────────────────────────────────────────
    // Build UNRATE monthly time series (forward-fill missing months)
    const unratePoints: { month: string; value: number }[] = [];
    let lastUnrate: number | null = null;
    for (const { key, data } of monthlyData) {
      const v = data['UNRATE'];
      if (v !== null && v !== undefined) lastUnrate = v;
      if (lastUnrate !== null) unratePoints.push({ month: key, value: lastUnrate });
    }

    // Compute 3-month MA and rolling 12-month min of 3MMA
    const sahmHistory: { month: string; sahm: number; unrate: number; u3ma: number }[] = [];
    for (let i = 2; i < unratePoints.length; i++) {
      const u3ma = (unratePoints[i].value + unratePoints[i - 1].value + unratePoints[i - 2].value) / 3;
      // Minimum 3MMA over the prior 12 months
      const windowStart = Math.max(0, i - 11); // goes back 12 months (i-11 to i)
      let minU3ma = u3ma;
      for (let j = windowStart; j <= i; j++) {
        if (j < 2) continue;
        const m = (unratePoints[j].value + unratePoints[j - 1].value + unratePoints[j - 2].value) / 3;
        if (m < minU3ma) minU3ma = m;
      }
      const sahm = Math.max(0, u3ma - minU3ma);
      sahmHistory.push({ month: unratePoints[i].month, sahm: Math.round(sahm * 1000) / 1000, unrate: unratePoints[i].value, u3ma: Math.round(u3ma * 100) / 100 });
    }
    const latestSahm = sahmHistory.length > 0 ? sahmHistory[sahmHistory.length - 1].sahm : 0;
    const sahmTriggered = latestSahm >= 0.50;

    // ── Yield Curve Probit (Estrella-Mishkin 1998) ───────────────────────────
    // T10Y3M spread: from daily data (most current) or monthly
    const spreadPoints: { date: string; spread: number; probit: number }[] = [];
    let lastSpread: number | null = null;

    // Pull T10Y3M from monthly history
    for (const { key, data } of monthlyData) {
      const v = data['T10Y3M'];
      if (v !== null && v !== undefined) {
        const probitIndex = -0.6045 + (-0.7374 * v);
        const prob = normalCDF(probitIndex) * 100;
        spreadPoints.push({ date: key + '-01', spread: v, probit: Math.round(prob * 10) / 10 });
        lastSpread = v;
      }
    }
    // Add daily data for current year (overrides last monthly values)
    for (const { key, data } of dailyData) {
      const v = data['T10Y3M'];
      if (v !== null && v !== undefined) {
        const probitIndex = -0.6045 + (-0.7374 * v);
        const prob = normalCDF(probitIndex) * 100;
        spreadPoints.push({ date: key, spread: v, probit: Math.round(prob * 10) / 10 });
        lastSpread = v;
      }
    }

    const latestProbit = spreadPoints.length > 0 ? spreadPoints[spreadPoints.length - 1].probit : 50;
    const latestSpread = lastSpread ?? 0;

    // ── Composite probability ─────────────────────────────────────────────────
    // Scale Sahm to 0-100: 0.50 = 100%, linear
    const sahmSignal = Math.min(100, Math.max(0, (latestSahm / 0.50) * 100));
    const composite = Math.round(0.4 * sahmSignal + 0.6 * latestProbit);

    // ── Build combined monthly history for chart ──────────────────────────────
    // Merge Sahm and probit by month key
    const probitByMonth: Record<string, number> = {};
    for (const pt of spreadPoints) {
      const mk = pt.date.substring(0, 7);
      probitByMonth[mk] = pt.probit;
    }
    const history = sahmHistory.slice(-60).map(pt => ({
      date: pt.month + '-01',
      probability: Math.round(0.4 * Math.min(100, (pt.sahm / 0.50) * 100) + 0.6 * (probitByMonth[pt.month] ?? 0)),
      sahm: pt.sahm,
    }));

    // ── Risk level ────────────────────────────────────────────────────────────
    const riskLevel = composite >= 50 ? 'Elevated' : composite >= 25 ? 'Moderate' : 'Low';
    const trend = history.length >= 4
      ? (history[history.length - 1].probability > history[history.length - 4].probability ? 'Rising' : 'Falling')
      : 'Stable';

    const analysis = composite >= 50
      ? `Composite recession probability is ${composite}%. The Sahm Rule indicator stands at ${latestSahm.toFixed(2)} (threshold: 0.50) and the 10Y-3M spread probit estimates a ${latestProbit.toFixed(1)}% probability of recession within 12 months. A defensive asset allocation posture is recommended.`
      : composite >= 25
        ? `Composite recession probability is ${composite}% — moderate but below the critical 50% threshold. The Sahm Rule indicator is ${latestSahm.toFixed(2)} (below the 0.50 trigger). Monitor the yield curve spread (currently ${latestSpread.toFixed(2)}%) for further deterioration.`
        : `Recession risk is Low (${composite}%). The Sahm Rule indicator (${latestSahm.toFixed(2)}) is well below the 0.50 recession threshold, and the 10Y-3M spread probit indicates only ${latestProbit.toFixed(1)}% 12-month recession probability.`;

    res.json({
      composite,
      riskLevel,
      trend,
      sahm: { current: latestSahm, triggered: sahmTriggered, threshold: 0.50 },
      probit: { current: latestProbit, spread: Math.round(latestSpread * 100) / 100 },
      history,
      analysis,
    });
  } catch (error) {
    logger.error('recession', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute recession probability' });
  }
});

// ── Yield Curve Model ─────────────────────────────────────────────────────────

/**
 * GET /api/models/yield-curve
 * Returns live 8-point Treasury yield curve + spread history + curve regime.
 */
router.get('/yield-curve', (req, res) => {
  try {
    const CURVE_SERIES = [
      { id: 'DGS1M', maturity: '1M' },
      { id: 'DGS3M', maturity: '3M' },
      { id: 'DGS6M', maturity: '6M' },
      { id: 'DGS1', maturity: '1Y' },
      { id: 'DGS2', maturity: '2Y' },
      { id: 'DGS5', maturity: '5Y' },
      { id: 'DGS10', maturity: '10Y' },
      { id: 'DGS30', maturity: '30Y' },
    ];

    // Get latest values from fred_latest (most current single observation)
    const latestRows = (db.prepare('SELECT id, value, date FROM fred_latest').all() as FredLatestRow[]);
    const latestMap: Record<string, number> = {};
    for (const row of latestRows) {
      if (row.value !== null) latestMap[row.id] = row.value;
    }

    // Build current 8-point curve
    const currentCurve = CURVE_SERIES.map(s => ({
      maturity: s.maturity,
      yield: latestMap[s.id] ?? null,
    })).filter(p => p.yield !== null);

    // Spread history: use T10Y2Y monthly from fred_history + daily from fred_daily
    const spreadMonthly = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ date: r.month_key + '-01', data: JSON.parse(r.data) }));
    const spreadDaily = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ date: r.date_key, data: JSON.parse(r.data) }));

    const spreadHistory: { date: string; spread: number }[] = [];
    for (const { date, data } of [...spreadMonthly, ...spreadDaily]) {
      const v = data['T10Y2Y'];
      if (v !== null && v !== undefined) {
        spreadHistory.push({ date, spread: Math.round(v * 100) / 100 });
      }
    }
    // Keep last 60 months
    const recentSpread = spreadHistory.slice(-60);

    // Current spreads
    const spread10y2y = latestMap['T10Y2Y'] ?? (latestMap['DGS10'] !== undefined && latestMap['DGS2'] !== undefined ? latestMap['DGS10'] - latestMap['DGS2'] : null);
    const spread10y3m = latestMap['T10Y3M'] ?? null;

    // Curve dynamic: compare 3-month change in DGS2 vs DGS10
    const allData = [...spreadMonthly, ...spreadDaily];
    const recentAll = allData.slice(-90); // ~3 months of daily
    let delta2: number | null = null, delta10: number | null = null;
    if (recentAll.length >= 60) {
      const old = recentAll[0].data;
      const now = recentAll[recentAll.length - 1].data;
      if (old['DGS2'] && now['DGS2']) delta2 = now['DGS2'] - old['DGS2'];
      if (old['DGS10'] && now['DGS10']) delta10 = now['DGS10'] - old['DGS10'];
    }

    let curveDynamic = 'Stable';
    if (delta2 !== null && delta10 !== null) {
      if (delta2 > 0 && delta10 > 0) {
        curveDynamic = delta10 > delta2 ? 'Bear Steepening' : 'Bear Flattening';
      } else if (delta2 < 0 && delta10 < 0) {
        curveDynamic = Math.abs(delta10) > Math.abs(delta2) ? 'Bull Flattening' : 'Bull Steepening';
      } else if (delta2 < 0 && delta10 > 0) {
        curveDynamic = 'Bear Steepening';
      } else if (delta2 > 0 && delta10 < 0) {
        curveDynamic = 'Bull Flattening';
      }
    }

    // Consecutive inversion days (T10Y3M < 0)
    const t10y3mSeries = [...spreadMonthly, ...spreadDaily]
      .map(r => r.data['T10Y3M'])
      .filter(v => v !== null && v !== undefined);
    let inversionDays = 0;
    for (let i = t10y3mSeries.length - 1; i >= 0; i--) {
      if (t10y3mSeries[i] < 0) inversionDays++;
      else break;
    }

    res.json({
      currentCurve,
      spread10y2y: spread10y2y !== null ? Math.round(spread10y2y * 100) / 100 : null,
      spread10y3m: spread10y3m !== null ? Math.round(spread10y3m * 100) / 100 : null,
      curveDynamic,
      inversionDays,
      history: recentSpread,
    });
  } catch (error) {
    logger.error('yield-curve', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute yield curve model' });
  }
});

// ── Credit Cycle Model ────────────────────────────────────────────────────────

/**
 * GET /api/models/credit-cycle
 * Returns live HY/IG spreads, SLOOS lending standards, credit growth, cycle phase.
 */
router.get('/credit-cycle', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const latestRows = (db.prepare('SELECT id, value FROM fred_latest').all() as FredLatestRow[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    // Current readings
    const hySpread = latestMap['BAMLH0A0HYM2'] ?? null;
    const igSpread = latestMap['BAA10YM'] ?? null;
    const lendingStandards = latestMap['DRTSCILM'] ?? null; // net % tightening

    // Business loans YoY growth
    const busloansHistory: number[] = [];
    for (const { data } of monthlyData) {
      const v = data['BUSLOANS'];
      if (v !== null && v !== undefined) busloansHistory.push(v);
    }
    let creditGrowthYoY: number | null = null;
    if (busloansHistory.length >= 13) {
      const latest = busloansHistory[busloansHistory.length - 1];
      const yearAgo = busloansHistory[busloansHistory.length - 13];
      creditGrowthYoY = Math.round(((latest - yearAgo) / yearAgo) * 100 * 10) / 10;
    }

    // Build 60-month spread history (HY + IG overlaid, DRTSCILM forward-filled)
    let lastDRTSCILM: number | null = null;
    const history: { date: string; hy_spread: number | null; ig_spread: number | null; lending_standards: number | null }[] = [];
    for (const { key, data } of monthlyData) {
      const drtsc = data['DRTSCILM'];
      if (drtsc !== null && drtsc !== undefined) lastDRTSCILM = drtsc;
      history.push({
        date: key + '-01',
        hy_spread: data['BAMLH0A0HYM2'] ?? null,
        ig_spread: data['BAA10YM'] ?? null,
        lending_standards: lastDRTSCILM,
      });
    }
    const recentHistory = history.slice(-60);

    // Cycle phase classification
    let cyclePhase = 'Expansion';
    if (hySpread !== null && lendingStandards !== null) {
      if (hySpread > 500) {
        cyclePhase = 'Stress / Crisis';
      } else if (hySpread > 400 || lendingStandards > 20) {
        cyclePhase = 'Late Cycle / Contraction';
      } else if (hySpread < 300 && lendingStandards < 0) {
        cyclePhase = 'Expansion';
      } else if (hySpread < 400 && (creditGrowthYoY ?? 0) < 0) {
        cyclePhase = 'Recovery';
      } else {
        cyclePhase = 'Mid Cycle';
      }
    }

    // Spread change vs prior month
    const prevHY = recentHistory.length >= 2 ? recentHistory[recentHistory.length - 2].hy_spread : null;
    const spreadChangePct = hySpread !== null && prevHY !== null && prevHY > 0
      ? Math.round(((hySpread - prevHY) / prevHY) * 100 * 10) / 10
      : null;

    res.json({
      hySpread: hySpread !== null ? Math.round(hySpread * 100) / 100 : null,
      igSpread: igSpread !== null ? Math.round(igSpread * 100) / 100 : null,
      lendingStandards: lendingStandards !== null ? Math.round(lendingStandards * 10) / 10 : null,
      creditGrowthYoY,
      cyclePhase,
      spreadChangePct,
      history: recentHistory,
    });
  } catch (error) {
    logger.error('credit-cycle', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute credit cycle model' });
  }
});

// ── Economic Cycles Model ────────────────────────────────────────────────────

/**
 * GET /api/models/economic-cycles
 * Returns live SP500, bond price proxy, CPI, INDPRO indexed to 100 from 1990-01.
 * Bond price approximated using DGS10 duration: Bond_t = Bond_{t-1} * (1 + (-delta_DGS10 * 0.08))
 */
router.get('/economic-cycles', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    // NBER recession reference periods (hardcoded — official, immutable)
    const recessionPeriods = [
      { start: '1990-07', end: '1991-03', label: 'Early 90s Recession' },
      { start: '2001-03', end: '2001-11', label: 'Dot-Com Bust' },
      { start: '2007-12', end: '2009-06', label: 'Global Financial Crisis' },
      { start: '2020-02', end: '2020-04', label: 'COVID-19 Shock' },
    ];

    // Build indexed time series
    let sp500Base: number | null = null;
    let bondBase: number | null = null;
    let prevDGS10: number | null = null;
    let bondLevel = 100;

    const historicalData: { year: string; equities: number | null; bonds: number | null }[] = [];

    for (const { key, data } of monthlyData) {
      const sp500 = data['SP500'];
      const dgs10 = data['DGS10'];

      // Initialize base
      if (sp500Base === null && sp500 !== null && sp500 !== undefined) sp500Base = sp500;

      // Bond price proxy: duration approximation
      if (dgs10 !== null && dgs10 !== undefined && prevDGS10 !== null) {
        const delta = dgs10 - prevDGS10;
        bondLevel = bondLevel * (1 + (-delta * 0.08));
      }
      if (bondBase === null && dgs10 !== null && dgs10 !== undefined) bondBase = bondLevel;
      if (dgs10 !== null && dgs10 !== undefined) prevDGS10 = dgs10;

      const equitiesIdx = sp500Base !== null && sp500 !== null && sp500 !== undefined
        ? Math.round((sp500 / sp500Base) * 100 * 10) / 10
        : null;
      const bondsIdx = bondBase !== null ? Math.round((bondLevel / bondBase) * 100 * 10) / 10 : null;

      historicalData.push({ year: key, equities: equitiesIdx, bonds: bondsIdx });
    }

    // Rolling 36-month stock-bond correlation (Pearson)
    const CORR_WINDOW = 36;
    const correlationData: { year: string; correlation: number | null }[] = [];
    for (let i = CORR_WINDOW; i < historicalData.length; i++) {
      const window = historicalData.slice(i - CORR_WINDOW, i);
      const eq = window.map(d => d.equities).filter(v => v !== null) as number[];
      const bo = window.map(d => d.bonds).filter(v => v !== null) as number[];
      if (eq.length < 12 || bo.length < 12 || eq.length !== bo.length) {
        correlationData.push({ year: historicalData[i].year, correlation: null });
        continue;
      }
      const n = eq.length;
      const meanEq = eq.reduce((a, b) => a + b, 0) / n;
      const meanBo = bo.reduce((a, b) => a + b, 0) / n;
      const num = eq.reduce((s, v, j) => s + (v - meanEq) * (bo[j] - meanBo), 0);
      const denEq = Math.sqrt(eq.reduce((s, v) => s + (v - meanEq) ** 2, 0));
      const denBo = Math.sqrt(bo.reduce((s, v) => s + (v - meanBo) ** 2, 0));
      const corr = denEq > 0 && denBo > 0 ? num / (denEq * denBo) : 0;
      correlationData.push({ year: historicalData[i].year, correlation: Math.round(corr * 100) / 100 });
    }

    res.json({
      historicalData,
      correlationData,
      recessionPeriods,
    });
  } catch (error) {
    logger.error('economic-cycles', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute economic cycles' });
  }
});

// ── Macro Regime Model (Bridgewater 4-Quadrant) ───────────────────────────────

/**
 * GET /api/models/macro-regime
 * Classifies the macro regime using CFNAI (growth) and CPIAUCSL YoY% (inflation).
 * Four regimes: Goldilocks, Reflation, Stagflation, Deflation.
 */
router.get('/macro-regime', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    const REGIME_NAMES: Record<number, { name: string; description: string; assets: { equities: string; bonds: string; commodities: string; cash: string } }> = {
      0: {
        name: 'Goldilocks',
        description: 'Growth accelerating, inflation falling — ideal equity environment',
        assets: { equities: 'Overweight', bonds: 'Neutral', commodities: 'Underweight', cash: 'Underweight' }
      },
      1: {
        name: 'Reflation',
        description: 'Growth accelerating, inflation rising — commodities and value stocks outperform',
        assets: { equities: 'Neutral', bonds: 'Underweight', commodities: 'Overweight', cash: 'Underweight' }
      },
      2: {
        name: 'Stagflation',
        description: 'Growth decelerating, inflation rising — gold, cash, short bonds favored',
        assets: { equities: 'Underweight', bonds: 'Underweight', commodities: 'Overweight', cash: 'Neutral' }
      },
      3: {
        name: 'Deflation',
        description: 'Growth decelerating, inflation falling — long bonds and quality assets outperform',
        assets: { equities: 'Underweight', bonds: 'Overweight', commodities: 'Underweight', cash: 'Overweight' }
      },
    };

    const regimeHistory: { date: string; regime: number; regimeName: string; growthSignal: number; inflationYoY: number; confidence: number }[] = [];

    for (let i = 12; i < monthlyData.length; i++) {
      const current = monthlyData[i].data;
      const yearAgo = monthlyData[i - 12].data;

      const cfnai = current['CFNAI'];
      const cpiNow = current['CPIAUCSL'];
      const cpiYear = yearAgo['CPIAUCSL'];

      if (cfnai === null || cfnai === undefined || cpiNow === null || cpiNow === undefined || cpiYear === null || cpiYear === undefined) continue;

      const inflationYoY = ((cpiNow - cpiYear) / cpiYear) * 100;

      const growthUp = cfnai >= 0;
      const inflationUp = inflationYoY >= 2.5;

      let regime: number;
      if (growthUp && !inflationUp) regime = 0; // Goldilocks
      else if (growthUp && inflationUp) regime = 1; // Reflation
      else if (!growthUp && inflationUp) regime = 2; // Stagflation
      else regime = 3; // Deflation

      // Confidence: how strongly are both signals diverging from zero?
      const growthStrength = Math.min(1, Math.abs(cfnai) / 0.7);
      const inflationStrength = Math.min(1, Math.abs(inflationYoY - 2.5) / 1.5);
      const confidence = Math.round((growthStrength + inflationStrength) / 2 * 100);

      regimeHistory.push({
        date: monthlyData[i].key + '-01',
        regime,
        regimeName: REGIME_NAMES[regime].name,
        growthSignal: Math.round(cfnai * 100) / 100,
        inflationYoY: Math.round(inflationYoY * 10) / 10,
        confidence,
      });
    }

    const latest = regimeHistory.length > 0 ? regimeHistory[regimeHistory.length - 1] : null;
    const currentRegime = latest?.regime ?? 3;

    res.json({
      currentRegime,
      regimeName: REGIME_NAMES[currentRegime].name,
      description: REGIME_NAMES[currentRegime].description,
      assets: REGIME_NAMES[currentRegime].assets,
      growthSignal: latest?.growthSignal ?? null,
      inflationYoY: latest?.inflationYoY ?? null,
      confidence: latest?.confidence ?? null,
      history: regimeHistory.slice(-120), // 10 years
      regimeConfig: REGIME_NAMES,
    });
  } catch (error) {
    logger.error('macro-regime', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute macro regime' });
  }
});

// ── Fed Policy Tracker (Taylor Rule) ─────────────────────────────────────────

/**
 * GET /api/models/fed-policy
 * Computes the Taylor Rule, policy gap, and real Fed Funds rate.
 * Taylor Rule: r* = 2.5 + π + 0.5*(π − 2.0) + 0.5*(CFNAI * 2.0)
 */
router.get('/fed-policy', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const latestRows = (db.prepare('SELECT id, value FROM fred_latest').all() as FredLatestRow[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    const history: { date: string; fedFunds: number | null; taylorRate: number | null; gap: number | null; realRate: number | null; inflationYoY: number | null }[] = [];

    for (let i = 12; i < monthlyData.length; i++) {
      const current = monthlyData[i].data;
      const yearAgo = monthlyData[i - 12].data;

      const fedfunds = current['FEDFUNDS'];
      const cpiNow = current['CPIAUCSL'];
      const cpiYear = yearAgo['CPIAUCSL'];
      const cfnai = current['CFNAI'];

      if (fedfunds === null || fedfunds === undefined) {
        history.push({ date: monthlyData[i].key + '-01', fedFunds: null, taylorRate: null, gap: null, realRate: null, inflationYoY: null });
        continue;
      }

      let taylorRate: number | null = null;
      let inflationYoY: number | null = null;

      if (cpiNow !== null && cpiNow !== undefined && cpiYear !== null && cpiYear !== undefined) {
        inflationYoY = ((cpiNow - cpiYear) / cpiYear) * 100;
        const pi = inflationYoY;
        const outputGap = (cfnai !== null && cfnai !== undefined) ? cfnai * 2.0 : 0;
        // Taylor Rule: r* = 2.5 + π + 0.5*(π - 2.0) + 0.5*outputGap
        taylorRate = 2.5 + pi + 0.5 * (pi - 2.0) + 0.5 * outputGap;
        taylorRate = Math.round(taylorRate * 100) / 100;
      }

      const gap = (taylorRate !== null) ? Math.round((fedfunds - taylorRate) * 100) / 100 : null;
      const realRate = inflationYoY !== null ? Math.round((fedfunds - inflationYoY) * 100) / 100 : null;

      history.push({
        date: monthlyData[i].key + '-01',
        fedFunds: Math.round(fedfunds * 100) / 100,
        taylorRate,
        gap,
        realRate,
        inflationYoY: inflationYoY !== null ? Math.round(inflationYoY * 10) / 10 : null,
      });
    }

    const recent = history.slice(-120); // 10 years
    const latest = recent.length > 0 ? recent[recent.length - 1] : null;

    // Current live readings (use DFEDTARU/DFEDTARL for current target bounds)
    const upperBound = latestMap['DFEDTARU'] ?? null;
    const lowerBound = latestMap['DFEDTARL'] ?? null;

    // Policy stance: based on gap (Fed vs Taylor Rule)
    const gap = latest?.gap ?? null;
    let policyStance = 'Neutral';
    if (gap !== null) {
      if (gap >= 2) policyStance = 'Extremely Restrictive';
      else if (gap >= 0.5) policyStance = 'Restrictive';
      else if (gap <= -2) policyStance = 'Extremely Accommodative';
      else if (gap <= -0.5) policyStance = 'Accommodative';
    }

    res.json({
      current: {
        fedFunds: latest?.fedFunds ?? null,
        taylorRate: latest?.taylorRate ?? null,
        gap,
        realRate: latest?.realRate ?? null,
        inflationYoY: latest?.inflationYoY ?? null,
        upperBound,
        lowerBound,
        policyStance,
      },
      history: recent,
    });
  } catch (error) {
    logger.error('fed-policy', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute fed policy model' });
  }
});

// ── Factor Dashboard ──────────────────────────────────────────────────────────

/**
 * GET /api/models/factors
 * Returns 1M, 3M, 12M excess returns for Value/Growth/Momentum/Quality/Low-Vol
 * versus SPY benchmark, with macro regime alignment.
 */
router.get('/factors', async (req, res) => {
  try {
    const FACTOR_ETFS = [
      { ticker: 'IWD', key: 'VALUE', name: 'Value', description: 'iShares Russell 1000 Value' },
      { ticker: 'IWF', key: 'GROWTH', name: 'Growth', description: 'iShares Russell 1000 Growth' },
      { ticker: 'MTUM', key: 'MOMENTUM', name: 'Momentum', description: 'iShares MSCI USA Momentum' },
      { ticker: 'QUAL', key: 'QUALITY', name: 'Quality', description: 'iShares MSCI USA Quality' },
      { ticker: 'USMV', key: 'LOWVOL', name: 'Low Volatility', description: 'iShares MSCI Min Vol' },
    ];
    const BENCHMARK = { ticker: 'SPY', key: 'SPY', name: 'S&P 500' };

    const allTickers = [...FACTOR_ETFS.map(f => f.ticker), BENCHMARK.ticker];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const period1 = oneYearAgo.toISOString().split('T')[0];
    const period2 = new Date().toISOString().split('T')[0];

    const historicalResults = await Promise.all(
      allTickers.map(async (ticker) => {
        try {
          const data: any[] = await yahooFinance.historical(ticker, { period1, period2, interval: '1mo' });
          return { ticker, data };
        } catch (err: any) {
          logger.warn('factors', `Error fetching ${ticker}:`, err.message);
          return { ticker, data: [] };
        }
      })
    );

    // Compute returns over 1M, 3M, 12M windows
    function computeReturn(data: any[], monthsBack: number): number | null {
      if (data.length < monthsBack + 1) return null;
      const base = data[data.length - 1 - monthsBack]?.close;
      const current = data[data.length - 1]?.close;
      if (!base || !current) return null;
      return Math.round(((current - base) / base) * 100 * 10) / 10;
    }

    const dataMap: Record<string, any[]> = {};
    for (const { ticker, data } of historicalResults) dataMap[ticker] = data;

    const benchmarkReturns = {
      r1m: computeReturn(dataMap[BENCHMARK.ticker] ?? [], 1),
      r3m: computeReturn(dataMap[BENCHMARK.ticker] ?? [], 3),
      r12m: computeReturn(dataMap[BENCHMARK.ticker] ?? [], 12),
    };

    const factors = FACTOR_ETFS.map(f => {
      const d = dataMap[f.ticker] ?? [];
      const r1m = computeReturn(d, 1);
      const r3m = computeReturn(d, 3);
      const r12m = computeReturn(d, 12);
      return {
        key: f.key,
        name: f.name,
        description: f.description,
        r1m,
        r3m,
        r12m,
        excess1m: r1m !== null && benchmarkReturns.r1m !== null ? Math.round((r1m - benchmarkReturns.r1m) * 10) / 10 : null,
        excess3m: r3m !== null && benchmarkReturns.r3m !== null ? Math.round((r3m - benchmarkReturns.r3m) * 10) / 10 : null,
        excess12m: r12m !== null && benchmarkReturns.r12m !== null ? Math.round((r12m - benchmarkReturns.r12m) * 10) / 10 : null,
      };
    });

    // Regime-factor alignment (empirical, educational lookup)
    const REGIME_LEADERS: Record<string, string[]> = {
      'Goldilocks': ['MOMENTUM', 'GROWTH'],
      'Reflation': ['VALUE', 'MOMENTUM'],
      'Stagflation': ['QUALITY', 'LOWVOL'],
      'Deflation': ['QUALITY', 'LOWVOL'],
    };

    res.json({
      factors,
      benchmark: { ...BENCHMARK, ...benchmarkReturns },
      regimeLeaders: REGIME_LEADERS,
    });
  } catch (error) {
    logger.error('factors', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute factor dashboard' });
  }
});

// ── Bond Scorecard ────────────────────────────────────────────────────────────

/**
 * GET /api/models/bond-scorecard
 * Returns 5-component bond environment score: term premium, real yield,
 * breakeven inflation, curve dynamic, and duration risk.
 */
router.get('/bond-scorecard', (req, res) => {
  try {
    const latestRows = (db.prepare('SELECT id, value, date FROM fred_latest').all() as FredLatestRow[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    // ── Term Premium (DGS10 - DGS3M)
    const termPremium = (latestMap['DGS10'] != null && latestMap['DGS3M'] != null)
      ? Math.round((latestMap['DGS10'] - latestMap['DGS3M']) * 100) / 100 : null;
    const termScore: -1 | 0 | 1 = termPremium === null ? 0 : termPremium > 1.5 ? 1 : termPremium < 0 ? -1 : 0;

    // ── Real Yield (DFII10 — 10Y TIPS)
    const realYield = latestMap['DFII10'] ?? null;
    // Forward-looking: high real yield = attractive entry point for bonds
    const realScore: -1 | 0 | 1 = realYield === null ? 0 : realYield > 2.0 ? 1 : realYield < 0 ? -1 : 0;

    // ── Breakeven Inflation (T10YIE)
    const breakeven = latestMap['T10YIE'] ?? null;
    const breakevenScore: -1 | 0 | 1 = breakeven === null ? 0 : breakeven < 1.5 ? 1 : breakeven > 2.5 ? -1 : 0;

    // ── Curve Dynamic (3-month delta in DGS10 vs DGS2)
    const recent90 = dailyData.slice(-90);
    let delta2: number | null = null, delta10: number | null = null;
    if (recent90.length >= 60) {
      const old = recent90[0].data; const now = recent90[recent90.length - 1].data;
      if (old['DGS2'] && now['DGS2']) delta2 = now['DGS2'] - old['DGS2'];
      if (old['DGS10'] && now['DGS10']) delta10 = now['DGS10'] - old['DGS10'];
    }
    let curveDynamic = 'Stable';
    let curveScore: -1 | 0 | 1 = 0;
    if (delta2 !== null && delta10 !== null) {
      if (delta2 > 0 && delta10 > 0) {
        curveDynamic = delta10 > delta2 ? 'Bear Steepening' : 'Bear Flattening';
        curveScore = -1;
      } else if (delta2 < 0 && delta10 < 0) {
        curveDynamic = Math.abs(delta10) > Math.abs(delta2) ? 'Bull Flattening' : 'Bull Steepening';
        curveScore = 1;
      } else if (delta2 < 0 && delta10 > 0) {
        curveDynamic = 'Bear Steepening'; curveScore = -1;
      } else if (delta2 > 0 && delta10 < 0) {
        curveDynamic = 'Bull Flattening'; curveScore = 1;
      }
    }

    // ── Duration Risk (is DGS10 rising over last 3M?)
    const dgs10_3m_ago = recent90.length >= 60 ? recent90[0].data['DGS10'] : null;
    const dgs10_now = latestMap['DGS10'] ?? null;
    const durationRising = dgs10_3m_ago && dgs10_now ? dgs10_now > dgs10_3m_ago + 0.1 : null;
    const durationScore: -1 | 0 | 1 = durationRising === null ? 0 : durationRising ? -1 : 1;

    const totalScore = termScore + realScore + breakevenScore + curveScore + durationScore;

    // Build 60-month history of DGS10 + DFII10 + T10YIE from monthly data
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) })).slice(-60);
    const history = monthlyData.map(({ key, data }) => ({
      date: key + '-01',
      dgs10: data['DGS10'] ?? null,
      realYield: data['DFII10'] ?? null,
      breakeven: data['T10YIE'] ?? null,
    }));

    res.json({
      score: totalScore,
      components: [
        { name: 'Term Premium (10Y-3M)', value: termPremium, score: termScore, description: termPremium === null ? 'N/A' : termPremium > 1.5 ? 'Steep — historically favorable for bond buyers' : termPremium < 0 ? 'Inverted — near-term bonds at risk' : 'Flat — transitional environment' },
        { name: 'Real Yield (TIPS 10Y)', value: realYield, score: realScore, description: realYield === null ? 'N/A' : realYield > 2.0 ? 'Elevated — attractive entry for long-duration bonds' : realYield < 0 ? 'Negative — financial repression; bonds unattractive in real terms' : 'Moderate — fair value territory' },
        { name: 'Breakeven Inflation', value: breakeven, score: breakevenScore, description: breakeven === null ? 'N/A' : breakeven < 1.5 ? 'Below target — deflationary signal, bonds favored' : breakeven > 2.5 ? 'Elevated — inflation premium increases rate risk' : 'Anchored — inflation expectations well-controlled' },
        { name: 'Curve Dynamic', value: curveDynamic, score: curveScore, description: curveScore === 1 ? 'Bull trend — falling rates support bond prices' : curveScore === -1 ? 'Bear trend — rising rates pressure bond prices' : 'Stable — range-bound rate environment' },
        { name: 'Duration Risk (DGS10 trend)', value: dgs10_now, score: durationScore, description: durationRising === null ? 'N/A' : durationRising ? '10Y yield rising — duration exposure is a headwind' : '10Y yield stable/falling — duration risk is contained' },
      ],
      current: { dgs10: dgs10_now, realYield, breakeven, termPremium, curveDynamic },
      history,
    });
  } catch (error) {
    logger.error('bond-scorecard', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute bond scorecard' });
  }
});

// ── Inflation Decomposition ───────────────────────────────────────────────────

/**
 * GET /api/models/inflation-decomposition
 * Returns CPI, PCE, Core PCE, Sticky/Flexible CPI, market breakeven, housing.
 */
router.get('/inflation-decomposition', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as FredHistoryRow[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const latestMap: Record<string, number> = {};
    for (const r of (db.prepare('SELECT id, value FROM fred_latest').all() as FredLatestRow[])) {
      if (r.value !== null) latestMap[r.id] = r.value;
    }

    // YoY helper for monthly series
    function computeYoY(seriesId: string): number | null {
      const vals: number[] = [];
      for (const { data } of monthlyData) {
        const v = data[seriesId];
        if (v !== null && v !== undefined) vals.push(v);
      }
      if (vals.length < 13) return null;
      const latest = vals[vals.length - 1];
      const yearAgo = vals[vals.length - 13];
      return Math.round(((latest / yearAgo) - 1) * 100 * 10) / 10;
    }

    const cpiYoY = computeYoY('CPIAUCSL');
    const pceYoY = computeYoY('PCEPI');
    const corePCEYoY = computeYoY('PCEPILFE');
    const stickyCPI = latestMap['CORESTICKM159SFRBATL'] ?? null;   // already a % change series
    const flexCPI = latestMap['FLEXCPIM157SFRBATL'] ?? null;
    const cshYoY = computeYoY('CSUSHPISA');

    // Market-implied breakeven from daily (latest T10YIE)
    const breakeven = latestMap['T10YIE'] ?? (() => {
      for (let i = dailyData.length - 1; i >= 0; i--) {
        const v = dailyData[i].data['T10YIE'];
        if (v !== null && v !== undefined) return v;
      }
      return null;
    })();

    // Regime classification
    let regime = 'Anchored';
    if (cpiYoY !== null && corePCEYoY !== null) {
      const cfnai = latestMap['CFNAI'] ?? 0;
      if (cpiYoY > 3.5 && cfnai < 0) regime = 'Stagflation';
      else if (cpiYoY > 3.0) regime = 'Reflation';
      else if (cpiYoY < 1.5) regime = 'Disinflation';
      else if (cpiYoY <= 2.5 && corePCEYoY <= 2.5) regime = 'Anchored';
      else regime = 'Reflation';
    }

    // Build 36-month history for chart
    const history = monthlyData.slice(-36).map(({ key, data }) => ({
      date: key + '-01',
      cpi: data['CPIAUCSL'] ?? null,
      pce: data['PCEPI'] ?? null,
      corePCE: data['PCEPILFE'] ?? null,
      stickyCPI: data['CORESTICKM159SFRBATL'] ?? null,
      flexCPI: data['FLEXCPIM157SFRBATL'] ?? null,
    }));

    // Compute YoY for each series in history
    const yoyHistory = history.map((h, i) => {
      if (i < 12) return { date: h.date, cpiYoY: null, pceYoY: null, corePCEYoY: null };
      const prev = history[i - 12];
      return {
        date: h.date,
        cpiYoY: h.cpi && prev.cpi ? Math.round(((h.cpi / prev.cpi) - 1) * 1000) / 10 : null,
        pceYoY: h.pce && prev.pce ? Math.round(((h.pce / prev.pce) - 1) * 1000) / 10 : null,
        corePCEYoY: h.corePCE && prev.corePCE ? Math.round(((h.corePCE / prev.corePCE) - 1) * 1000) / 10 : null,
        stickyCPI: h.stickyCPI,
        flexCPI: h.flexCPI,
      };
    });

    res.json({
      current: { cpiYoY, pceYoY, corePCEYoY, stickyCPI, flexCPI, breakeven, cshYoY },
      regime,
      history: yoyHistory.filter(h => h.cpiYoY !== null),
    });
  } catch (error) {
    logger.error('inflation-decomposition', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute inflation decomposition' });
  }
});

// ── Commodity Cycle Monitor ───────────────────────────────────────────────────

/**
 * GET /api/models/commodities
 * Returns OIL, GOLD, COPPER levels, returns, ratios, and macro signals.
 */
router.get('/commodities', async (req, res) => {
  try {
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    function latestVal(key: string): number | null {
      for (let i = dailyData.length - 1; i >= 0; i--) {
        const v = dailyData[i].data[key];
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }

    function nReturn(key: string, months: number): number | null {
      const days = months * 21;
      const series: number[] = [];
      for (const { data } of dailyData) {
        const v = data[key];
        if (v != null) series.push(v);
      }
      if (series.length < days + 1) return null;
      const now = series[series.length - 1];
      const ago = series[series.length - 1 - days];
      return Math.round(((now / ago) - 1) * 1000) / 10;
    }

    const oilPrice = latestVal('OIL');
    const goldPrice = latestVal('GOLD');
    const copperPrice = latestVal('COPPER');

    const copperGoldRatio = oilPrice && goldPrice && copperPrice && goldPrice > 0
      ? Math.round((copperPrice / goldPrice) * 10000) / 10000 : null;
    const goldOilRatio = goldPrice && oilPrice && oilPrice > 0
      ? Math.round((goldPrice / oilPrice) * 100) / 100 : null;

    const copper12m = nReturn('COPPER', 12);
    const copperSignal = copper12m === null ? 'Insufficient data'
      : copper12m > 10 ? 'Strong Growth'
        : copper12m > 0 ? 'Moderate Growth'
          : copper12m > -10 ? 'Slowing'
            : 'Contraction';

    // 60-day ratio history
    const recentDaily = dailyData.slice(-300);
    const ratioHistory = recentDaily.map(({ key, data }) => {
      const oil = data['OIL']; const gold = data['GOLD']; const copper = data['COPPER'];
      return {
        date: key,
        copperGold: copper && gold && gold > 0 ? Math.round((copper / gold) * 10000) / 10000 : null,
        goldOil: gold && oil && oil > 0 ? Math.round((gold / oil) * 100) / 100 : null,
      };
    }).filter(d => d.copperGold !== null || d.goldOil !== null);

    res.json({
      current: {
        oil: { price: oilPrice, r1m: nReturn('OIL', 1), r3m: nReturn('OIL', 3), r12m: nReturn('OIL', 12) },
        gold: { price: goldPrice, r1m: nReturn('GOLD', 1), r3m: nReturn('GOLD', 3), r12m: nReturn('GOLD', 12) },
        copper: { price: copperPrice, r1m: nReturn('COPPER', 1), r3m: nReturn('COPPER', 3), r12m: nReturn('COPPER', 12) },
        copperGoldRatio, goldOilRatio, copperSignal,
      },
      ratioHistory,
    });
  } catch (error) {
    logger.error('commodities', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute commodity monitor' });
  }
});

// ── Dollar Strength Monitor ───────────────────────────────────────────────────

/**
 * GET /api/models/dollar
 * Returns DXY level, 52W percentile rank, returns, USD/EUR, and rolling correlations.
 */
router.get('/dollar', (req, res) => {
  try {
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    // Build DTWEXBGS and DXY series (prefer DXY from Yahoo, fallback to DTWEXBGS)
    const series: { date: string; dxy: number | null; sp500: number | null; gold: number | null }[] = [];
    for (const { key, data } of dailyData) {
      const dxy = data['DXY'] ?? data['DTWEXBGS'] ?? null;
      series.push({ date: key, dxy, sp500: data['SP500'] ?? null, gold: data['GOLD'] ?? null });
    }

    const dxyVals = series.map(s => s.dxy).filter((v): v is number => v !== null);
    const latestDxy = dxyVals[dxyVals.length - 1] ?? null;

    // 52-week percentile rank
    const last252 = dxyVals.slice(-252);
    const rank52w = last252.length > 0 && latestDxy !== null
      ? Math.round((last252.filter(v => v <= latestDxy).length / last252.length) * 100) : null;

    // Returns
    function rtn(n: number): number | null {
      if (dxyVals.length < n + 1 || !latestDxy) return null;
      const ago = dxyVals[dxyVals.length - 1 - n];
      return Math.round(((latestDxy / ago) - 1) * 1000) / 10;
    }

    // DEXUSEU (USD/EUR) — latest from fred_latest
    const latestMap: Record<string, number> = {};
    for (const r of (db.prepare('SELECT id, value FROM fred_latest').all() as FredLatestRow[])) {
      if (r.value !== null) latestMap[r.id] = r.value;
    }
    const usdEur = latestMap['DEXUSEU'] ?? null;

    // 60-day rolling Pearson correlation DXY vs SP500 and DXY vs GOLD
    const corr60 = series.slice(-60).filter(s => s.dxy !== null && s.sp500 !== null);
    const corrGold60 = series.slice(-60).filter(s => s.dxy !== null && s.gold !== null);

    function pearson(xs: number[], ys: number[]): number | null {
      const n = xs.length;
      if (n < 10) return null;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
      const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
      return den === 0 ? null : Math.round((num / den) * 100) / 100;
    }

    const corrSP500 = pearson(corr60.map(s => s.dxy!), corr60.map(s => s.sp500!));
    const corrGold = pearson(corrGold60.map(s => s.dxy!), corrGold60.map(s => s.gold!));

    const regime = rank52w === null ? 'Unknown'
      : rank52w >= 75 ? 'Trending Stronger'
        : rank52w <= 25 ? 'Trending Weaker'
          : 'Neutral';

    const history = series.slice(-252).map(s => ({ date: s.date, dxy: s.dxy }));

    res.json({
      current: { dxy: latestDxy, rank52w, r3m: rtn(63), r6m: rtn(126), r12m: rtn(252), usdEur, regime },
      correlations: { sp500: corrSP500, gold: corrGold },
      history,
    });
  } catch (error) {
    logger.error('dollar', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute dollar monitor' });
  }
});

// ── Cross-Asset Correlation Monitor ──────────────────────────────────────────

/**
 * GET /api/models/correlations
 * Returns 5×5 Pearson correlation matrices for 60D / 6M / 1Y windows.
 * Assets: SP500, 10Y Treasury (price proxy), Gold, Oil, DXY.
 */
router.get('/correlations', (req, res) => {
  try {
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as FredDailyRow[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    const ASSETS = [
      { key: 'SP500', label: 'S&P 500' },
      { key: 'DGS10', label: '10Y Treasury', invert: true },
      { key: 'GOLD', label: 'Gold' },
      { key: 'OIL', label: 'Oil (WTI)' },
      { key: 'DXY', label: 'US Dollar (DXY)' },
    ];

    // Build daily returns for each asset
    const rawSeries: Record<string, number[]> = {};
    const rawDates: string[] = [];
    for (const { key, data } of dailyData) {
      let anyValue = false;
      for (const a of ASSETS) {
        let v = data[a.key];
        // For DGS10: convert yield to price proxy using duration
        if (a.invert && v != null) v = -v; // invert yield so positive = price up
        if (v != null) {
          if (!rawSeries[a.key]) rawSeries[a.key] = [];
          rawSeries[a.key].push(v);
          anyValue = true;
        }
      }
      if (anyValue) rawDates.push(key);
    }

    // Compute daily % returns
    function toReturns(vals: number[]): number[] {
      const r: number[] = [];
      for (let i = 1; i < vals.length; i++) {
        r.push(vals[i] - vals[i - 1]); // use diff for yields/inverted, % for others
      }
      return r;
    }

    // pearsonCorrelation is imported from utils.ts
    function buildMatrix(windowDays: number) {
      const matrix: Record<string, Record<string, number>> = {};
      const returns: Record<string, number[]> = {};
      for (const a of ASSETS) {
        const vals = rawSeries[a.key] ?? [];
        const recent = vals.slice(-windowDays);
        returns[a.key] = a.invert
          ? recent.map((v, i, arr) => i === 0 ? 0 : arr[i] - arr[i - 1])
          : recent.map((v, i, arr) => i === 0 ? 0 : arr[i - 1] !== 0 ? (arr[i] - arr[i - 1]) / Math.abs(arr[i - 1]) : 0);
      }
      for (const a of ASSETS) {
        matrix[a.key] = {};
        for (const b of ASSETS) {
          const xs = returns[a.key].slice(1);
          const ys = returns[b.key].slice(1);
          matrix[a.key][b.key] = a.key === b.key ? 1.0 : pearsonCorrelation(xs, ys, MIN_CORRELATION_OBSERVATIONS);
        }
      }
      return matrix;
    }

    // Key regime signal: stock-bond correlation
    const corr60 = buildMatrix(60);
    const stockBondCorr = corr60['SP500']?.['DGS10'] ?? 0;
    const regime = stockBondCorr < -0.2 ? 'Classic Hedge (Negative Stock-Bond Corr.)'
      : stockBondCorr > 0.2 ? 'Inflation Regime (Positive Stock-Bond Corr.)'
        : 'Transitional';

    res.json({
      assets: ASSETS,
      matrices: {
        '60D': buildMatrix(60),
        '6M': buildMatrix(126),
        '1Y': buildMatrix(252),
      },
      stockBondCorr,
      regime,
    });
  } catch (error) {
    logger.error('correlations', 'Error:', error);
    res.status(500).json({ error: 'Failed to compute correlation monitor' });
  }
});

