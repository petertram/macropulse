import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { db } from '../db/client.js';
import { logger } from '../logger.js';

export const sectorsRouter = Router();
const router = sectorsRouter;
const yahooFinance = new YahooFinance();

const US_SECTOR_ETFS = [
  { id: 'xlk', sector: 'Technology', ticker: 'XLK', type: 'cyclical' },
  { id: 'xlf', sector: 'Financials', ticker: 'XLF', type: 'cyclical' },
  { id: 'xlv', sector: 'Healthcare', ticker: 'XLV', type: 'defensive' },
  { id: 'xly', sector: 'Consumer Discretionary', ticker: 'XLY', type: 'cyclical' },
  { id: 'xli', sector: 'Industrials', ticker: 'XLI', type: 'cyclical' },
  { id: 'xlc', sector: 'Communication Services', ticker: 'XLC', type: 'cyclical' },
  { id: 'xlp', sector: 'Consumer Staples', ticker: 'XLP', type: 'defensive' },
  { id: 'xle', sector: 'Energy', ticker: 'XLE', type: 'commodity' },
  { id: 'xlu', sector: 'Utilities', ticker: 'XLU', type: 'defensive' },
  { id: 'xlre', sector: 'Real Estate', ticker: 'XLRE', type: 'rate_sensitive' },
  { id: 'xlb', sector: 'Materials', ticker: 'XLB', type: 'cyclical' },
] as const;

const BENCHMARK_TICKER = 'SPY';

/**
 * Compute 3-month trend from FRED series.
 * Returns +1 (expanding), -1 (contracting), or 0 (stable).
 * Uses the last 4 monthly observations to detect a trend.
 */
function computeFredTrend(seriesId: string): { score: -1 | 0 | 1; value: string; detail: string } {
  // Try daily first (current year), then fall back to monthly
  const dailyRows = db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key DESC LIMIT 90').all() as FredDailyRow[];
  const values: { date: string; val: number }[] = [];

  for (const row of dailyRows) {
    const d = JSON.parse(row.data);
    if (d[seriesId] !== undefined && d[seriesId] !== null) {
      values.push({ date: row.date_key, val: d[seriesId] });
    }
    if (values.length >= 4) break;
  }

  // Fall back to monthly if not enough daily data
  if (values.length < 3) {
    const monthlyRows = db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key DESC LIMIT 6').all() as FredHistoryRow[];
    for (const row of monthlyRows) {
      const d = JSON.parse(row.data);
      if (d[seriesId] !== undefined && d[seriesId] !== null) {
        values.push({ date: row.month_key, val: d[seriesId] });
      }
      if (values.length >= 4) break;
    }
  }

  if (values.length < 2) {
    return { score: 0, value: 'N/A', detail: `No recent data for ${seriesId}` };
  }

  // values[0] = most recent, values[last] = oldest
  const latest = values[0].val;
  const oldest = values[values.length - 1].val;
  const pctChange = ((latest - oldest) / Math.abs(oldest)) * 100;

  let score: -1 | 0 | 1;
  let label: string;
  if (pctChange > 0.5) {
    score = 1;
    label = 'Expanding';
  } else if (pctChange < -0.5) {
    score = -1;
    label = 'Contracting';
  } else {
    score = 0;
    label = 'Stable';
  }

  return {
    score,
    value: label,
    detail: `${seriesId}: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}% (3m trend, ${latest.toFixed(1)} vs ${oldest.toFixed(1)})`
  };
}

/**
 * GET /api/sectors/us
 * Returns real-time sector scorecard for US S&P 500 sector ETFs.
 */
router.get('/us', async (req, res) => {
  try {
    const allTickers = [...US_SECTOR_ETFS.map(s => s.ticker), BENCHMARK_TICKER];

    // 1. Fetch 12-month historical prices for all ETFs + benchmark
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const period1 = oneYearAgo.toISOString().split('T')[0];
    const period2 = new Date().toISOString().split('T')[0];

    const historicalResults = await Promise.all(
      allTickers.map(async (ticker) => {
        try {
          const data: any[] = await yahooFinance.historical(ticker, {
            period1,
            period2,
            interval: '1mo'
          });
          return { ticker, data };
        } catch (err: any) {
          logger.warn('sectors', `Error fetching historical for ${ticker}:`, err.message);
          return { ticker, data: [] };
        }
      })
    );

    // Calculate 12m returns
    const returnsMap: Record<string, number | null> = {};
    for (const { ticker, data } of historicalResults) {
      if (data.length >= 2) {
        const oldest = data[0].close;
        const newest = data[data.length - 1].close;
        returnsMap[ticker] = ((newest - oldest) / oldest) * 100;
      } else {
        returnsMap[ticker] = null;
      }
    }

    // 2. Fetch trailingPE for all ETFs + benchmark via quoteSummary
    const peResults = await Promise.all(
      allTickers.map(async (ticker) => {
        try {
          const summary = await yahooFinance.quoteSummary(ticker, {
            modules: ['summaryDetail']
          });
          const pe = (summary as any)?.summaryDetail?.trailingPE ?? null;
          return { ticker, pe };
        } catch (err: any) {
          logger.warn('sectors', `Error fetching PE for ${ticker}:`, err.message);
          return { ticker, pe: null };
        }
      })
    );

    const peMap: Record<string, number | null> = {};
    for (const { ticker, pe } of peResults) {
      peMap[ticker] = pe;
    }

    const benchmarkPE = peMap[BENCHMARK_TICKER];

    // 3. Compute momentum scores: rank by 12m return, top 3 get +1, bottom 3 get -1
    const sectorReturns = US_SECTOR_ETFS.map(s => ({
      ...s,
      return12m: returnsMap[s.ticker] ?? null
    })).filter(s => s.return12m !== null);

    sectorReturns.sort((a, b) => (b.return12m ?? 0) - (a.return12m ?? 0));

    const momentumScores: Record<string, { score: -1 | 0 | 1; value: string; breakdown: string }> = {};
    sectorReturns.forEach((s, i) => {
      let score: -1 | 0 | 1;
      let breakdown: string;
      if (i < 3) {
        score = 1;
        breakdown = `Top 3 in region (12m return, rank #${i + 1})`;
      } else if (i >= sectorReturns.length - 3) {
        score = -1;
        breakdown = `Bottom 3 in region (12m return, rank #${i + 1})`;
      } else {
        score = 0;
        breakdown = `Middle tier in region (12m return, rank #${i + 1})`;
      }
      momentumScores[s.id] = {
        score,
        value: `${s.return12m! >= 0 ? '+' : ''}${s.return12m!.toFixed(1)}%`,
        breakdown
      };
    });

    // 4. Compute fundamental scores: compare sector PE to benchmark PE
    const fundamentalScores: Record<string, { score: -1 | 0 | 1; value: string; breakdown: string }> = {};
    for (const s of US_SECTOR_ETFS) {
      const sectorPE = peMap[s.ticker];
      if (sectorPE === null || sectorPE === undefined || benchmarkPE === null || benchmarkPE === undefined) {
        fundamentalScores[s.id] = {
          score: 0,
          value: 'N/A',
          breakdown: 'P/E data unavailable'
        };
        continue;
      }
      const ratio = sectorPE / benchmarkPE;
      let score: -1 | 0 | 1;
      let breakdown: string;
      if (ratio < 0.85) {
        score = 1; // cheap relative to market
        breakdown = `Trailing P/E ${sectorPE.toFixed(1)}x vs SPY ${benchmarkPE.toFixed(1)}x (${((ratio - 1) * 100).toFixed(0)}% discount)`;
      } else if (ratio > 1.15) {
        score = -1; // expensive relative to market
        breakdown = `Trailing P/E ${sectorPE.toFixed(1)}x vs SPY ${benchmarkPE.toFixed(1)}x (${((ratio - 1) * 100).toFixed(0)}% premium)`;
      } else {
        score = 0;
        breakdown = `Trailing P/E ${sectorPE.toFixed(1)}x vs SPY ${benchmarkPE.toFixed(1)}x (in-line)`;
      }
      fundamentalScores[s.id] = { score, value: `${sectorPE.toFixed(1)}x`, breakdown };
    }

    // 5. Compute macro scores based on sector type
    const indproTrend = computeFredTrend('INDPRO');
    const payemsTrend = computeFredTrend('PAYEMS');

    const macroScores: Record<string, { score: -1 | 0 | 1; value: string; breakdown: string }> = {};
    for (const s of US_SECTOR_ETFS) {
      let macroResult: { score: -1 | 0 | 1; value: string; breakdown: string };
      switch (s.type) {
        case 'cyclical': {
          // Cyclicals benefit from expanding economy
          const driver = s.id === 'xlf' ? payemsTrend : indproTrend;
          const driverName = s.id === 'xlf' ? 'Employment (PAYEMS)' : 'Industrial Production (INDPRO)';
          macroResult = {
            score: driver.score,
            value: driver.value,
            breakdown: `${driverName}: ${driver.detail}`
          };
          break;
        }
        case 'defensive': {
          // Defensives benefit from a cooling economy (inverse of cyclical)
          const driver = indproTrend;
          const invertedScore = (driver.score * -1) as -1 | 0 | 1;
          macroResult = {
            score: invertedScore,
            value: driver.score === 1 ? 'Headwind' : driver.score === -1 ? 'Tailwind' : 'Stable',
            breakdown: `Defensive sector: inverse of INDPRO trend. ${driver.detail}`
          };
          break;
        }
        case 'rate_sensitive': {
          // Real Estate is rate-sensitive — rising rates hurt
          const dgs10Trend = computeFredTrend('DGS10');
          const invertedScore = (dgs10Trend.score * -1) as -1 | 0 | 1;
          macroResult = {
            score: invertedScore,
            value: dgs10Trend.score === 1 ? 'Rising Rates' : dgs10Trend.score === -1 ? 'Falling Rates' : 'Stable Rates',
            breakdown: `Rate-sensitive: inverse of 10Y yield trend. ${dgs10Trend.detail}`
          };
          break;
        }
        case 'commodity': {
          // Energy tied to industrial production
          macroResult = {
            score: indproTrend.score,
            value: indproTrend.value,
            breakdown: `Commodity-linked: INDPRO trend. ${indproTrend.detail}`
          };
          break;
        }
        default:
          macroResult = { score: 0, value: 'N/A', breakdown: 'Unknown sector type' };
      }
      macroScores[s.id] = macroResult;
    }

    // 6. Compute relative strength scores: sector 12m return vs benchmark
    const benchmarkReturn = returnsMap[BENCHMARK_TICKER] ?? 0;
    const relativeStrengthScores: Record<string, { score: -1 | 0 | 1; value: string; breakdown: string }> = {};
    for (const s of US_SECTOR_ETFS) {
      const sectorReturn = returnsMap[s.ticker] ?? null;
      if (sectorReturn === null) {
        relativeStrengthScores[s.id] = { score: 0, value: 'N/A', breakdown: 'Return data unavailable' };
        continue;
      }
      const alpha = sectorReturn - benchmarkReturn;
      let score: -1 | 0 | 1;
      if (alpha > 5) score = 1;
      else if (alpha < -5) score = -1;
      else score = 0;
      relativeStrengthScores[s.id] = {
        score,
        value: `${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}%`,
        breakdown: `12m relative return vs SPY: ${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}% (sector: ${sectorReturn >= 0 ? '+' : ''}${sectorReturn.toFixed(1)}%, SPY: ${benchmarkReturn >= 0 ? '+' : ''}${benchmarkReturn.toFixed(1)}%)`
      };
    }

    // 7. Compute final score (sum of 4 pillars, clamped to [-3, +3])
    const results = US_SECTOR_ETFS.map(s => {
      const mom = momentumScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const fun = fundamentalScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const mac = macroScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const rs = relativeStrengthScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const rawScore = mom.score + fun.score + mac.score + rs.score;
      const finalScore = Math.max(-3, Math.min(3, rawScore));

      return {
        id: s.id,
        sector: s.sector,
        ticker: s.ticker,
        momentum: mom,
        fundamental: fun,
        macro: mac,
        relativeStrength: rs,
        finalScore
      };
    });

    res.json(results);
  } catch (error: any) {
    logger.error('sectors', 'Error computing sector scorecard:', error.message);
    res.status(500).json({ error: 'Failed to compute sector scorecard' });
  }
});

