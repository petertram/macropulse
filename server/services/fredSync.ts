import YahooFinance from 'yahoo-finance2';
import { db } from '../db/client.js';
import { getLastFredDailyDate, getLastFredMonthlyDate } from '../db/queries.js';
import { FRED_API_KEY, FRED_SERIES_IDS } from './fredConfig.js';
import { HISTORY_START_DATE } from '../constants.js';
import { logger } from '../logger.js';
import { todayStr, currentYearStart, lastYearEnd, lastYearLastMonth, toMonthKey } from '../utils.js';
import type { LatestResult } from '../types.js';

const yahooFinance = new YahooFinance();

export async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      if ([429, 502, 503, 504].includes(response.status)) {
        logger.warn('fetch', `Retry ${i + 1}/${retries} for ${url} due to status ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// ── Core sync functions ──────────────────────────────────────────────────────

/**
 * Sync monthly FRED data (for historical, pre-current-year data).
 * Monthly data covers 1990-01-01 through end of last year.
 */
async function syncMonthlyData(startDate: string): Promise<number> {
  const endDate = lastYearEnd();
  logger.info('sync-monthly', `Fetching monthly data from ${startDate} to ${endDate}...`);

  // Fetch monthly FRED observations
  const historyResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      // Some series (like STLENI) don't support monthly frequency or require specific params
      const freqParam = id === 'STLENI' ? '' : '&frequency=m&aggregation_method=eop';
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json${freqParam}&observation_start=${startDate}&observation_end=${endDate}`;
      const data = await fetchWithRetry(url);
      const observations = data.observations || [];
      logger.info('sync-monthly', `${id}: ${observations.length} observations`);
      return { id, observations };
    } catch (err) {
      logger.warn('sync-monthly', `Error fetching history for ${id}:`, err);
      return { id, observations: [] };
    }
  }));

  // Build date map, merging with existing
  const dateMap: Record<string, any> = {};
  const existingRows = db.prepare('SELECT month_key, data FROM fred_history WHERE month_key >= ?')
    .all(startDate.substring(0, 7)) as FredHistoryRow[];
  for (const row of existingRows) {
    dateMap[row.month_key] = JSON.parse(row.data);
  }

  historyResults.forEach(series => {
    series.observations.forEach((obs: any) => {
      const monthKey = obs.date.substring(0, 7);
      if (!dateMap[monthKey]) dateMap[monthKey] = { date: obs.date };
      dateMap[monthKey][series.id] = obs.value !== '.' ? parseFloat(obs.value) : null;
    });
  });

  // SP500 + Sentiment ETFs + Commodities + Factor ETFs monthly from Yahoo Finance
  const YAHOO_MONTHLY_TICKERS = [
    { ticker: '^SPX', key: 'SP500' },
    { ticker: 'XLU', key: 'XLU' },   // Utilities (defensive)
    { ticker: 'XLY', key: 'XLY' },   // Consumer Discretionary (cyclical)
    // Commodities (macro cycle indicators)
    { ticker: 'CL=F', key: 'OIL' },
    { ticker: 'GC=F', key: 'GOLD' },
    { ticker: 'HG=F', key: 'COPPER' },
    // Dollar
    { ticker: 'DX-Y.NYB', key: 'DXY' },
    // EM proxy
    { ticker: 'EEM', key: 'EEM' },
    // Factor ETFs
    { ticker: 'IWD', key: 'VALUE' },
    { ticker: 'IWF', key: 'GROWTH' },
    { ticker: 'MTUM', key: 'MOMENTUM' },
    { ticker: 'QUAL', key: 'QUALITY' },
    { ticker: 'USMV', key: 'LOWVOL' },
    { ticker: 'SPY', key: 'SPY' },
  ];
  for (const { ticker, key } of YAHOO_MONTHLY_TICKERS) {
    try {
      const data: any[] = await yahooFinance.historical(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1mo'
      });
      data.forEach((obs: any) => {
        const dateObj = new Date(obs.date);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        if (!dateMap[monthKey]) dateMap[monthKey] = { date: monthKey + '-01' };
        dateMap[monthKey][key] = obs.close;
      });
      logger.info('sync-monthly', `${key}: ${data.length} monthly observations`);
    } catch (err: any) {
      logger.error('sync-monthly', `Yahoo Finance Error (${key}):`, err.message);
    }
  }

  // Persist
  const insertHistory = db.prepare('INSERT OR REPLACE INTO fred_history (month_key, data) VALUES (@month_key, @data)');
  const insertHistoryMany = db.transaction((entries: any) => {
    for (const [monthKey, data] of Object.entries(entries)) {
      insertHistory.run({ month_key: monthKey, data: JSON.stringify(data) });
    }
  });
  insertHistoryMany(dateMap);

  const count = Object.keys(dateMap).length;
  logger.info('sync-monthly', `Completed: ${count} months written to DB`);
  return count;
}

/**
 * Sync daily FRED data for the current year.
 * Daily data covers Jan 1 of current year through today.
 */
async function syncDailyData(startDate?: string): Promise<number> {
  const dailyStart = startDate || currentYearStart();
  const dailyEnd = todayStr();
  logger.info('sync-daily', `Fetching daily data from ${dailyStart} to ${dailyEnd}...`);

  // Fetch daily FRED observations (no frequency param = native frequency)
  const dailyResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${dailyStart}&observation_end=${dailyEnd}`;
      const data = await fetchWithRetry(url);
      const observations = data.observations || [];
      logger.info('sync-daily', `${id}: ${observations.length} daily observations`);
      return { id, observations };
    } catch (err) {
      logger.warn('sync-daily', `Error fetching daily for ${id}:`, err);
      return { id, observations: [] };
    }
  }));

  // Build daily date map, merging with existing
  const dailyMap: Record<string, any> = {};
  const existingDaily = db.prepare('SELECT date_key, data FROM fred_daily WHERE date_key >= ?')
    .all(dailyStart) as FredDailyRow[];
  for (const row of existingDaily) {
    dailyMap[row.date_key] = JSON.parse(row.data);
  }

  dailyResults.forEach(series => {
    series.observations.forEach((obs: any) => {
      const dateKey = obs.date; // YYYY-MM-DD
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey };
      dailyMap[dateKey][series.id] = obs.value !== '.' ? parseFloat(obs.value) : null;
    });
  });

  // SP500 + Sentiment ETFs + Commodities + Factor ETFs daily from Yahoo Finance
  const YAHOO_DAILY_TICKERS = [
    { ticker: '^SPX', key: 'SP500' },
    { ticker: 'XLU', key: 'XLU' },
    { ticker: 'XLY', key: 'XLY' },
    // Commodities (macro cycle indicators)
    { ticker: 'CL=F', key: 'OIL' },       // WTI Crude Oil
    { ticker: 'GC=F', key: 'GOLD' },      // Gold
    { ticker: 'HG=F', key: 'COPPER' },    // Copper (Dr. Copper indicator)
    { ticker: 'NG=F', key: 'NATGAS' },    // Natural Gas
    // Dollar
    { ticker: 'DX-Y.NYB', key: 'DXY' },  // DXY Dollar Index
    // Emerging Markets proxy
    { ticker: 'EEM', key: 'EEM' },        // iShares MSCI Emerging Markets ETF
    // Factor ETFs (vs SPY benchmark)
    { ticker: 'IWD', key: 'VALUE' },     // iShares Russell 1000 Value
    { ticker: 'IWF', key: 'GROWTH' },    // iShares Russell 1000 Growth
    { ticker: 'MTUM', key: 'MOMENTUM' },  // iShares MSCI USA Momentum Factor
    { ticker: 'QUAL', key: 'QUALITY' },   // iShares MSCI USA Quality Factor
    { ticker: 'USMV', key: 'LOWVOL' },   // iShares MSCI USA Min Vol Factor
    { ticker: 'SPY', key: 'SPY' },       // S&P 500 ETF (factor benchmark)
  ];
  for (const { ticker, key } of YAHOO_DAILY_TICKERS) {
    try {
      const data: any[] = await yahooFinance.historical(ticker, {
        period1: dailyStart,
        period2: dailyEnd,
        interval: '1d'
      });
      data.forEach((obs: any) => {
        const dateKey = new Date(obs.date).toISOString().split('T')[0];
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { date: dateKey };
        dailyMap[dateKey][key] = obs.close;
      });
      logger.info('sync-daily', `${key}: ${data.length} daily observations`);
    } catch (err: any) {
      logger.error('sync-daily', `Yahoo Finance Error (${key}):`, err.message);
    }
  }

  // Filter out days with no actual data (only keep days that have at least one value)
  const filteredMap: Record<string, any> = {};
  for (const [dateKey, data] of Object.entries(dailyMap)) {
    const hasAnyValue = Object.keys(data).some(k => k !== 'date' && (data as DataPoint)[k] !== null);
    if (hasAnyValue) {
      filteredMap[dateKey] = data;
    }
  }

  // Persist
  const insertDaily = db.prepare('INSERT OR REPLACE INTO fred_daily (date_key, data) VALUES (@date_key, @data)');
  const insertDailyMany = db.transaction((entries: any) => {
    for (const [dateKey, data] of Object.entries(entries)) {
      insertDaily.run({ date_key: dateKey, data: JSON.stringify(data) });
    }
  });
  insertDailyMany(filteredMap);

  const count = Object.keys(filteredMap).length;
  logger.info('sync-daily', `Completed: ${count} daily records written to DB`);
  return count;
}

/**
 * Full sync: latest observations + monthly history + daily current year.
 */
export async function syncFredData(monthlyStartDate: string): Promise<{ success: boolean; message: string }> {
  logger.info('sync', `Starting full sync...`);

  // 1. Sync Latest Observations
  const latestResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const data = await fetchWithRetry(url);
      return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
    } catch (err) {
      logger.warn('sync', `Error fetching latest ${id}:`, err);
      return { id, value: null, date: null };
    }
  }));

  const insertLatest = db.prepare('INSERT OR REPLACE INTO fred_latest (id, value, date) VALUES (@id, @value, @date)');
  const insertLatestMany = db.transaction((items: any[]) => {
    for (const item of items) {
      if (item.value !== null && item.value !== '.') {
        insertLatest.run({ id: item.id, value: parseFloat(item.value), date: item.date });
      }
    }
  });
  insertLatestMany(latestResults);
  logger.info('sync', `Updated ${latestResults.filter(r => r.value !== null).length} latest observations`);

  // 2. Sync Monthly History (1990 through end of last year)
  const monthCount = await syncMonthlyData(monthlyStartDate);

  // 3. Sync Daily Data (current year)
  const dailyCount = await syncDailyData();

  // 4. Update sync metadata
  const now = new Date().toISOString();
  const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
  upsertMeta.run('last_sync_date', now);
  upsertMeta.run('last_sync_status', 'success');

  logger.info('sync', `Full sync complete: ${monthCount} months + ${dailyCount} daily records`);
  return { success: true, message: `Synced ${monthCount} months + ${dailyCount} daily records` };
}

/**
 * Incremental sync: only updates daily data from last daily date to today.
 */
export async function syncIncrementalDaily(): Promise<{ success: boolean; message: string }> {
  const lastDailyDate = getLastFredDailyDate();
  const startDate = lastDailyDate || currentYearStart();
  logger.info('sync-incremental', `Incremental daily sync from ${startDate}...`);

  // Update latest observations
  const latestResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const data = await fetchWithRetry(url);
      return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
    } catch (err) {
      logger.warn('sync', `Error fetching latest ${id}:`, err);
      return { id, value: null, date: null };
    }
  }));

  const insertLatest = db.prepare('INSERT OR REPLACE INTO fred_latest (id, value, date) VALUES (@id, @value, @date)');
  const insertLatestMany = db.transaction((items: any[]) => {
    for (const item of items) {
      if (item.value !== null && item.value !== '.') {
        insertLatest.run({ id: item.id, value: parseFloat(item.value), date: item.date });
      }
    }
  });
  insertLatestMany(latestResults);

  // Sync daily data from last known date
  const dailyCount = await syncDailyData(startDate);

  // Update sync metadata
  const now = new Date().toISOString();
  const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
  upsertMeta.run('last_sync_date', now);
  upsertMeta.run('last_sync_status', 'success');

  return { success: true, message: `Synced ${dailyCount} daily records` };
}


export async function autoSeed() {
  const lastMonthly = getLastFredMonthlyDate();
  const lastDaily = getLastFredDailyDate();

  if (!lastMonthly) {
    logger.info('startup', 'No FRED monthly data found. Auto-seeding full history from 1990...');
    try {
      await syncFredData(HISTORY_START_DATE);
      logger.info('startup', 'Auto-seed complete!');
    } catch (err) {
      logger.error('startup', 'Auto-seed failed:', err);
    }
  } else if (!lastDaily) {
    logger.info('startup', `Monthly data found up to ${lastMonthly}, but no daily data. Seeding daily for current year...`);
    try {
      await syncIncrementalDaily();
      logger.info('startup', 'Daily seed complete!');
    } catch (err) {
      logger.error('startup', 'Daily seed failed:', err);
    }
  } else {
    logger.info('startup', `Data found: monthly up to ${lastMonthly}, daily up to ${lastDaily}`);
  }
}
