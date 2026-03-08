// MacroPulse Backend Server v3
import express from 'express';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';

import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from './logger.js';
import {
  todayStr,
  currentYearStart,
  lastYearEnd,
  lastYearLastMonth,
  isDateCurrent,
  getPercentileRank,
  pearsonCorrelation,
  toMonthKey,
} from './utils.js';
import {
  SERVER_PORT,
  HISTORY_START_DATE,
  SENTIMENT_LOOKBACK_MONTHS,
  SENTIMENT_DIVERGENCE_THRESHOLD,
  SENTIMENT_THRESHOLDS,
  SENTIMENT_MOMENTUM_THRESHOLD,
  ESI_LOOKBACK_MONTHS,
  CORRELATION_WINDOWS,
  REGIME_THRESHOLDS,
  MIN_CORRELATION_OBSERVATIONS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  MIN_PERCENTILE_OBSERVATIONS,
} from './constants.js';
import type {
  FredLatestRow,
  FredHistoryRow,
  FredDailyRow,
  CountRow,
  MetadataValueRow,
  LatestResult,
  DataPoint,
  YahooHistoricalObs,
} from './types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'market_data.db'));
const yahooFinance = new YahooFinance();
const app = express();
const PORT = SERVER_PORT;

const FRED_API_KEY = process.env.FRED_API_KEY;
if (!FRED_API_KEY) {
  throw new Error('FRED_API_KEY environment variable is required. Set it in your .env file.');
}

const FRED_SERIES_IDS = [
  'BAMLH0A0HYM2', 'T10Y2Y', 'VIXCLS', 'VXVCLS',
  'DGS10', 'STLFSI4', 'CFNAI', 'DFII10',
  'WALCL', 'WDTGAL', 'RRPONTSYD', 'M2SL',
  'INDPRO', 'PAYEMS',
  // Economic Surprise Index series
  'ICSA', 'RSAFS', 'HOUST', 'CPIAUCSL', 'STLENI',
  // Inflation Tracker series
  'T10YIE',            // 10-Year Breakeven Inflation Rate (daily)
  'STICKCPID160SFRBATL', // Atlanta Fed Sticky Price CPI (monthly)
  // Market Sentiment series
  'UMCSENT',          // U. Michigan Consumer Sentiment (monthly)
  'USEPUINDXD',       // Economic Policy Uncertainty (daily, news-based NLP)
  'NFCI',             // Chicago Fed National Financial Conditions (weekly)
  // --- Recession Probability Model ---
  'UNRATE',           // Unemployment Rate (monthly) — Sahm Rule
  'T10Y3M',           // 10Y-3M Treasury Spread (daily) — Probit model
  // --- Full Yield Curve (8-point) ---
  'DGS1M',            // 1-Month Treasury (daily)
  'DGS3M',            // 3-Month Treasury (daily)
  'DGS6M',            // 6-Month Treasury (daily)
  'DGS1',             // 1-Year Treasury (daily)
  'DGS2',             // 2-Year Treasury (daily)
  'DGS5',             // 5-Year Treasury (daily)
  'DGS30',            // 30-Year Treasury (daily)
  // --- Credit Cycle Model ---
  'DRTSCILM',         // C&I Lending Standards / SLOOS (quarterly, forward-fill)
  'BAA10YM',          // Baa Corporate Spread vs 10Y — IG credit proxy
  'BUSLOANS',         // Business Loans (weekly)
  'TOTALSL',          // Total Consumer Credit (monthly)
  // --- Fed Policy Tracker ---
  'FEDFUNDS',         // Effective Federal Funds Rate (monthly)
  'DFEDTARU',         // FOMC upper bound target (daily)
  'DFEDTARL',         // FOMC lower bound target (daily)
  // --- Inflation Decomposition ---
  'PCEPI',            // PCE Price Index (monthly) — Fed's preferred inflation measure
  'PCEPILFE',         // Core PCE (ex-food & energy) (monthly)
  'CORESTICKM159SFRBATL', // Core Sticky CPI (monthly)
  'FLEXCPIM157SFRBATL',   // Flexible CPI — transitory component (monthly)
  // --- Housing & Consumer Credit ---
  'CSUSHPISA',        // Case-Shiller Home Price Index (monthly)
  'MORTGAGE30US',     // 30-Year Fixed Mortgage Rate (weekly)
  // --- Dollar / External ---
  'DTWEXBGS',         // Trade-Weighted Dollar Index (daily)
  'DEXUSEU',          // USD/EUR Exchange Rate (daily)
  // --- ESI Expansion ---
  'DGORDER',          // Durable Goods Orders (monthly)
  'BOPGSTB',          // Trade Balance (monthly)
];

app.use(express.json());

// Rate limiter: max RATE_LIMIT_MAX_REQUESTS requests per minute per IP on all /api routes
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Initialize SQLite tables
db.exec(`
  CREATE TABLE IF NOT EXISTS fred_latest (
    id TEXT PRIMARY KEY,
    value REAL,
    date TEXT
  );
  CREATE TABLE IF NOT EXISTS fred_history (
    month_key TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS fred_daily (
    date_key TEXT PRIMARY KEY,
    data TEXT
  );
  CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      if ([429, 502, 503, 504].includes(response.status)) {
        console.warn(`Retry ${i + 1}/${retries} for ${url} due to status ${response.status}`);
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

/**
 * Find the last month_key in fred_history that contains actual FRED indicator data
 * (not just SP500 from Yahoo Finance). Returns null if no FRED data exists.
 */
function getLastFredMonthlyDate(): string | null {
  const rows = db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key DESC').all() as FredHistoryRow[];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const hasFredData = FRED_SERIES_IDS.some(id => data[id] !== undefined && data[id] !== null);
    if (hasFredData) {
      return row.month_key; // e.g. "2025-12"
    }
  }
  return null;
}

/**
 * Find the last date_key in fred_daily that contains actual FRED indicator data.
 * Returns null if no daily FRED data exists.
 */
function getLastFredDailyDate(): string | null {
  const rows = db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key DESC').all() as FredDailyRow[];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const hasFredData = FRED_SERIES_IDS.some(id => data[id] !== undefined && data[id] !== null);
    if (hasFredData) {
      return row.date_key; // e.g. "2026-02-28"
    }
  }
  return null;
}

/**
 * Check if the daily FRED data is considered "current"
 * (i.e. from today or up to DATA_CURRENCY_LOOKBACK_DAYS ago, covering weekends).
 */
function isDataCurrent(): boolean {
  const lastDailyDate = getLastFredDailyDate();
  if (!lastDailyDate) return false;
  return isDateCurrent(lastDailyDate);
}

/**
 * Check if a successful sync has already been performed today.
 */
function isSyncToday(): boolean {
  try {
    const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
    const lastSyncDateStr = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value;
    if (!lastSyncDateStr) return false;
    const lastSyncDate = lastSyncDateStr.split('T')[0];
    return lastSyncDate === todayStr();
  } catch (err) {
    return false;
  }
}

// ── Core sync functions ──────────────────────────────────────────────────────

/**
 * Sync monthly FRED data (for historical, pre-current-year data).
 * Monthly data covers 1990-01-01 through end of last year.
 */
async function syncMonthlyData(startDate: string): Promise<number> {
  const endDate = lastYearEnd();
  console.log(`[sync-monthly] Fetching monthly data from ${startDate} to ${endDate}...`);

  // Fetch monthly FRED observations
  const historyResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      // Some series (like STLENI) don't support monthly frequency or require specific params
      const freqParam = id === 'STLENI' ? '' : '&frequency=m&aggregation_method=eop';
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json${freqParam}&observation_start=${startDate}&observation_end=${endDate}`;
      const data = await fetchWithRetry(url);
      const observations = data.observations || [];
      console.log(`[sync-monthly] ${id}: ${observations.length} observations`);
      return { id, observations };
    } catch (err) {
      console.warn(`[sync-monthly] Error fetching history for ${id}:`, err);
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
      console.log(`[sync-monthly] ${key}: ${data.length} monthly observations`);
    } catch (err: any) {
      console.error(`[sync-monthly] Yahoo Finance Error (${key}):`, err.message);
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
  console.log(`[sync-monthly] Completed: ${count} months written to DB`);
  return count;
}

/**
 * Sync daily FRED data for the current year.
 * Daily data covers Jan 1 of current year through today.
 */
async function syncDailyData(startDate?: string): Promise<number> {
  const dailyStart = startDate || currentYearStart();
  const dailyEnd = todayStr();
  console.log(`[sync-daily] Fetching daily data from ${dailyStart} to ${dailyEnd}...`);

  // Fetch daily FRED observations (no frequency param = native frequency)
  const dailyResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${dailyStart}&observation_end=${dailyEnd}`;
      const data = await fetchWithRetry(url);
      const observations = data.observations || [];
      console.log(`[sync-daily] ${id}: ${observations.length} daily observations`);
      return { id, observations };
    } catch (err) {
      console.warn(`[sync-daily] Error fetching daily for ${id}:`, err);
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
      console.log(`[sync-daily] ${key}: ${data.length} daily observations`);
    } catch (err: any) {
      console.error(`[sync-daily] Yahoo Finance Error (${key}):`, err.message);
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
  console.log(`[sync-daily] Completed: ${count} daily records written to DB`);
  return count;
}

/**
 * Full sync: latest observations + monthly history + daily current year.
 */
async function syncFredData(monthlyStartDate: string): Promise<{ success: boolean; message: string }> {
  console.log(`[sync] Starting full sync...`);

  // 1. Sync Latest Observations
  const latestResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const data = await fetchWithRetry(url);
      return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
    } catch (err) {
      console.warn(`[sync] Error fetching latest ${id}:`, err);
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
  console.log(`[sync] Updated ${latestResults.filter(r => r.value !== null).length} latest observations`);

  // 2. Sync Monthly History (1990 through end of last year)
  const monthCount = await syncMonthlyData(monthlyStartDate);

  // 3. Sync Daily Data (current year)
  const dailyCount = await syncDailyData();

  // 4. Update sync metadata
  const now = new Date().toISOString();
  const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
  upsertMeta.run('last_sync_date', now);
  upsertMeta.run('last_sync_status', 'success');

  console.log(`[sync] Full sync complete: ${monthCount} months + ${dailyCount} daily records`);
  return { success: true, message: `Synced ${monthCount} months + ${dailyCount} daily records` };
}

/**
 * Incremental sync: only updates daily data from last daily date to today.
 */
async function syncIncrementalDaily(): Promise<{ success: boolean; message: string }> {
  const lastDailyDate = getLastFredDailyDate();
  const startDate = lastDailyDate || currentYearStart();
  console.log(`[sync-incremental] Incremental daily sync from ${startDate}...`);

  // Update latest observations
  const latestResults = await Promise.all(FRED_SERIES_IDS.map(async (id) => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const data = await fetchWithRetry(url);
      return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
    } catch (err) {
      console.warn(`[sync] Error fetching latest ${id}:`, err);
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

// ── API Endpoints ────────────────────────────────────────────────────────────

app.get('/api/fred', (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, value, date FROM fred_latest');
    const results = stmt.all();
    res.json(results);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Failed to read from local database' });
  }
});

/**
 * Combined history endpoint:
 * Returns monthly data (1990 → end of last year) + daily data (current year → today)
 */
app.get('/api/fred/history', (req, res) => {
  try {
    const lastMonth = lastYearLastMonth();

    // Monthly data up to end of last year
    const monthlyStmt = db.prepare('SELECT data FROM fred_history WHERE month_key <= ? ORDER BY month_key ASC');
    const monthlyData = monthlyStmt.all(lastMonth).map((r: any) => JSON.parse(r.data));

    // Daily data for current year
    const dailyStmt = db.prepare('SELECT data FROM fred_daily ORDER BY date_key ASC');
    const dailyData = dailyStmt.all().map((r: any) => JSON.parse(r.data));

    // Combine: monthly history followed by daily current year
    const combined = [...monthlyData, ...dailyData];
    res.json(combined);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Failed to read from local database' });
  }
});

// Sync Status Endpoint
app.get('/api/fred/sync-status', (req, res) => {
  try {
    const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
    const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
    const lastSyncStatus = (getMeta.get('last_sync_status') as MetadataValueRow | undefined)?.value ?? null;
    const hasData = (db.prepare('SELECT COUNT(*) as count FROM fred_latest').get() as CountRow).count > 0;
    const lastFredMonthly = getLastFredMonthlyDate();
    const lastFredDaily = getLastFredDailyDate();
    const monthlyCount = (db.prepare('SELECT COUNT(*) as count FROM fred_history').get() as CountRow).count;
    const dailyCount = (db.prepare('SELECT COUNT(*) as count FROM fred_daily').get() as CountRow).count;
    const isCurrent = isDataCurrent();
    res.json({
      lastSyncDate, lastSyncStatus, hasData, isCurrent,
      lastFredMonthly, lastFredDaily,
      monthlyCount, dailyCount
    });
  } catch (error) {
    console.error('Sync Status Error:', error);
    res.status(500).json({ error: 'Failed to read sync status' });
  }
});

/**
 * Check if any FRED_SERIES_IDS are missing from the latest observations table.
 * This catches cases where new series were added to the config but never fetched.
 */
function hasMissingSeries(): boolean {
  const existingIds = (db.prepare('SELECT id FROM fred_latest').all() as FredLatestRow[]).map(r => r.id);
  return FRED_SERIES_IDS.some(id => !existingIds.includes(id));
}

// Manual Sync Endpoint — smart incremental sync
app.post('/api/fred/sync', async (req, res) => {
  try {
    const forceFull = req.body?.forceFull === true;
    const missingSeries = hasMissingSeries();
    const syncToday = isSyncToday();

    // If already synced today AND no new series are missing AND not forced, skip sync
    if (!forceFull && syncToday && !missingSeries) {
      console.log('[sync] Sync has already been performed today, skipping re-sync');
      const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
      const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
      return res.json({
        success: true,
        message: 'Data is already up to date',
        lastSyncDate,
        skipped: true
      });
    }

    if (forceFull || missingSeries) {
      // New series or forced — full sync from 1990
      console.log(`[sync] ${forceFull ? 'Forced' : 'Missing series'} full re-sync from 1990...`);
      const result = await syncFredData('1990-01-01');
      const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
      const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
      res.json({ ...result, lastSyncDate, skipped: false });
    } else {
      const lastMonthly = getLastFredMonthlyDate();

      if (!lastMonthly) {
        // No data at all: full sync from 1990
        console.log('[sync] No FRED data found. Full sync from 1990...');
        const result = await syncFredData('1990-01-01');
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
        res.json({ ...result, lastSyncDate, skipped: false });
      } else {
        // Monthly data exists — just do incremental daily sync
        console.log('[sync] Monthly data exists. Doing incremental daily sync...');
        const result = await syncIncrementalDaily();
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
        res.json({ ...result, lastSyncDate, skipped: false });
      }
    }
  } catch (error) {
    console.error('Sync Error:', error);
    try {
      const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
      upsertMeta.run('last_sync_status', 'error');
    } catch (metaErr) { logger.error('sync', 'Failed to update sync status metadata', metaErr); }
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

// ── Market Sentiment Composite ───────────────────────────────────────────────

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

app.get('/api/sentiment', (req, res) => {
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
    console.error('[sentiment] Error:', error);
    res.status(500).json({ error: 'Failed to compute sentiment index' });
  }
});

// ── Economic Surprise Index ──────────────────────────────────────────────────

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

app.get('/api/models/economic-surprise', (req, res) => {
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
    console.error('[economic-surprise] Error:', error);
    res.status(500).json({ error: 'Failed to compute Economic Surprise Index' });
  }
});

// ── Sector Rotation Scorecard ────────────────────────────────────────────────

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
app.get('/api/sectors/us', async (req, res) => {
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
          console.warn(`[sectors] Error fetching historical for ${ticker}:`, err.message);
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
          console.warn(`[sectors] Error fetching PE for ${ticker}:`, err.message);
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
    console.error('[sectors] Error computing sector scorecard:', error.message);
    res.status(500).json({ error: 'Failed to compute sector scorecard' });
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
app.get('/api/models/recession-probability', (req, res) => {
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
    console.error('[recession] Error:', error);
    res.status(500).json({ error: 'Failed to compute recession probability' });
  }
});

// ── Yield Curve Model ─────────────────────────────────────────────────────────

/**
 * GET /api/models/yield-curve
 * Returns live 8-point Treasury yield curve + spread history + curve regime.
 */
app.get('/api/models/yield-curve', (req, res) => {
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
    console.error('[yield-curve] Error:', error);
    res.status(500).json({ error: 'Failed to compute yield curve model' });
  }
});

// ── Credit Cycle Model ────────────────────────────────────────────────────────

/**
 * GET /api/models/credit-cycle
 * Returns live HY/IG spreads, SLOOS lending standards, credit growth, cycle phase.
 */
app.get('/api/models/credit-cycle', (req, res) => {
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
    console.error('[credit-cycle] Error:', error);
    res.status(500).json({ error: 'Failed to compute credit cycle model' });
  }
});

// ── Economic Cycles Model ────────────────────────────────────────────────────

/**
 * GET /api/models/economic-cycles
 * Returns live SP500, bond price proxy, CPI, INDPRO indexed to 100 from 1990-01.
 * Bond price approximated using DGS10 duration: Bond_t = Bond_{t-1} * (1 + (-delta_DGS10 * 0.08))
 */
app.get('/api/models/economic-cycles', (req, res) => {
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
    console.error('[economic-cycles] Error:', error);
    res.status(500).json({ error: 'Failed to compute economic cycles' });
  }
});

// ── Macro Regime Model (Bridgewater 4-Quadrant) ───────────────────────────────

/**
 * GET /api/models/macro-regime
 * Classifies the macro regime using CFNAI (growth) and CPIAUCSL YoY% (inflation).
 * Four regimes: Goldilocks, Reflation, Stagflation, Deflation.
 */
app.get('/api/models/macro-regime', (req, res) => {
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
    console.error('[macro-regime] Error:', error);
    res.status(500).json({ error: 'Failed to compute macro regime' });
  }
});

// ── Fed Policy Tracker (Taylor Rule) ─────────────────────────────────────────

/**
 * GET /api/models/fed-policy
 * Computes the Taylor Rule, policy gap, and real Fed Funds rate.
 * Taylor Rule: r* = 2.5 + π + 0.5*(π − 2.0) + 0.5*(CFNAI * 2.0)
 */
app.get('/api/models/fed-policy', (req, res) => {
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
    console.error('[fed-policy] Error:', error);
    res.status(500).json({ error: 'Failed to compute fed policy model' });
  }
});

// ── Factor Dashboard ──────────────────────────────────────────────────────────

/**
 * GET /api/models/factors
 * Returns 1M, 3M, 12M excess returns for Value/Growth/Momentum/Quality/Low-Vol
 * versus SPY benchmark, with macro regime alignment.
 */
app.get('/api/models/factors', async (req, res) => {
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
          console.warn(`[factors] Error fetching ${ticker}:`, err.message);
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
    console.error('[factors] Error:', error);
    res.status(500).json({ error: 'Failed to compute factor dashboard' });
  }
});

// ── Bond Scorecard ────────────────────────────────────────────────────────────

/**
 * GET /api/models/bond-scorecard
 * Returns 5-component bond environment score: term premium, real yield,
 * breakeven inflation, curve dynamic, and duration risk.
 */
app.get('/api/models/bond-scorecard', (req, res) => {
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
    console.error('[bond-scorecard] Error:', error);
    res.status(500).json({ error: 'Failed to compute bond scorecard' });
  }
});

// ── Inflation Decomposition ───────────────────────────────────────────────────

/**
 * GET /api/models/inflation-decomposition
 * Returns CPI, PCE, Core PCE, Sticky/Flexible CPI, market breakeven, housing.
 */
app.get('/api/models/inflation-decomposition', (req, res) => {
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
    console.error('[inflation-decomposition] Error:', error);
    res.status(500).json({ error: 'Failed to compute inflation decomposition' });
  }
});

// ── Commodity Cycle Monitor ───────────────────────────────────────────────────

/**
 * GET /api/models/commodities
 * Returns OIL, GOLD, COPPER levels, returns, ratios, and macro signals.
 */
app.get('/api/models/commodities', async (req, res) => {
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
    console.error('[commodities] Error:', error);
    res.status(500).json({ error: 'Failed to compute commodity monitor' });
  }
});

// ── Dollar Strength Monitor ───────────────────────────────────────────────────

/**
 * GET /api/models/dollar
 * Returns DXY level, 52W percentile rank, returns, USD/EUR, and rolling correlations.
 */
app.get('/api/models/dollar', (req, res) => {
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
    console.error('[dollar] Error:', error);
    res.status(500).json({ error: 'Failed to compute dollar monitor' });
  }
});

// ── Cross-Asset Correlation Monitor ──────────────────────────────────────────

/**
 * GET /api/models/correlations
 * Returns 5×5 Pearson correlation matrices for 60D / 6M / 1Y windows.
 * Assets: SP500, 10Y Treasury (price proxy), Gold, Oil, DXY.
 */
app.get('/api/models/correlations', (req, res) => {
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
    console.error('[correlations] Error:', error);
    res.status(500).json({ error: 'Failed to compute correlation monitor' });
  }
});

// ── Server startup ──────────────────────────────────────────────────────────

async function autoSeed() {
  const lastMonthly = getLastFredMonthlyDate();
  const lastDaily = getLastFredDailyDate();

  if (!lastMonthly) {
    console.log('[startup] No FRED monthly data found. Auto-seeding full history from 1990...');
    try {
      await syncFredData('1990-01-01');
      console.log('[startup] Auto-seed complete!');
    } catch (err) {
      console.error('[startup] Auto-seed failed:', err);
    }
  } else if (!lastDaily) {
    console.log(`[startup] Monthly data found up to ${lastMonthly}, but no daily data. Seeding daily for current year...`);
    try {
      await syncIncrementalDaily();
      console.log('[startup] Daily seed complete!');
    } catch (err) {
      console.error('[startup] Daily seed failed:', err);
    }
  } else {
    console.log(`[startup] Data found: monthly up to ${lastMonthly}, daily up to ${lastDaily}`);
  }
}

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('../frontend/dist'));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Auto-seed runs AFTER server is listening (non-blocking)
  autoSeed();
});
