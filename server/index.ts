// MacroPulse Backend Server v3
import express from 'express';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import Database from 'better-sqlite3';

import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current directory, root directory, or frontend directory
dotenv.config(); // default (server/ or root if run from root)
dotenv.config({ path: path.join(__dirname, '../.env') }); // Parent dir (root)
dotenv.config({ path: path.join(__dirname, '../../frontend/.env') }); // Frontend folder inside monorepo
dotenv.config({ path: path.join(__dirname, '../frontend/.env') }); // Alternative frontend path

const db = new Database(path.join(__dirname, 'market_data.db'));
const yahooFinance = new YahooFinance();
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRED_API_KEY = process.env.FRED_API_KEY || '4030789b3b214aeade239a08babaa32a';

const FRED_SERIES_IDS = [
  'BAMLH0A0HYM2', 'T10Y2Y', 'VIXCLS', 'VXVCLS',
  'DGS10', 'STLFSI4', 'CFNAI', 'DFII10',
  'WALCL', 'WDTGAL', 'RRPONTSYD', 'M2SL',
  'INDPRO', 'PAYEMS',
  // Economic Surprise Index series
  'ICSA', 'RSAFS', 'HOUST', 'CPIAUCSL', 'STLENI',
  // Inflation Tracker series
  'T10YIE',            // 10-Year Breakeven Inflation Rate (daily)
  // STICKCPID160SFRBATL removed — invalid ID; use CORESTICKM159SFRBATL instead
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
  'BAMLC0A0CM',       // ICE BofA IG OAS — proper investment-grade option-adjusted spread
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
  const rows = db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key DESC').all() as any[];
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
  const rows = db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key DESC').all() as any[];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const hasFredData = FRED_SERIES_IDS.some(id => data[id] !== undefined && data[id] !== null);
    if (hasFredData) {
      return row.date_key; // e.g. "2026-02-28"
    }
  }
  return null;
}

/** Returns today as YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns January 1st of the current year as YYYY-MM-DD */
function currentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** Returns December 31st of the previous year as YYYY-MM-DD */
function lastYearEnd(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

/** Returns the last month of the previous year as YYYY-MM */
function lastYearLastMonth(): string {
  return `${new Date().getFullYear() - 1}-12`;
}

type StoredDataRow = { key: string; data: Record<string, any> };

function dedupeDateSeries<T extends { date: string }>(points: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const point of points) {
    if (point.date) deduped.set(point.date, point);
  }
  return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeStoredHistory<T extends { date: string }>(
  monthlyData: StoredDataRow[],
  dailyData: StoredDataRow[],
  monthlyMapper: (row: StoredDataRow) => T | null,
  dailyMapper: (row: StoredDataRow) => T | null,
): T[] {
  const merged: T[] = [];
  for (const row of monthlyData) {
    const point = monthlyMapper(row);
    if (point) merged.push(point);
  }
  for (const row of dailyData) {
    const point = dailyMapper(row);
    if (point) merged.push(point);
  }
  return dedupeDateSeries(merged);
}

function latestNonNullPoint(points: { date: string; value: number | null }[]): { date: string; value: number } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.value !== null && point.value !== undefined && !Number.isNaN(point.value)) {
      return { date: point.date, value: point.value };
    }
  }
  return null;
}

function getValueOnOrBefore(points: { date: string; value: number | null }[], targetDate: string): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.date <= targetDate && point.value !== null && point.value !== undefined && !Number.isNaN(point.value)) {
      return point.value;
    }
  }
  return null;
}

function getMonthsAgoDate(months: number, fromDate: string): string {
  const date = new Date(fromDate);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

function computeReturnFromSeries(points: { date: string; value: number | null }[], months: number): number | null {
  const latest = latestNonNullPoint(points);
  if (!latest || latest.value === 0) return null;
  const agoValue = getValueOnOrBefore(points, getMonthsAgoDate(months, latest.date));
  if (agoValue === null || agoValue === 0) return null;
  return Math.round(((latest.value / agoValue) - 1) * 1000) / 10;
}

/**
 * Check if the daily FRED data is considered "current"
 * (i.e. from today or yesterday, meaning no sync needed).
 */
function isDataCurrent(): boolean {
  const lastDailyDate = getLastFredDailyDate();
  if (!lastDailyDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  // Also check 2 days ago (for weekends — FRED has no weekend data)
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const format = (d: Date) => d.toISOString().split('T')[0];
  return [format(today), format(yesterday), format(twoDaysAgo), format(threeDaysAgo)].includes(lastDailyDate);
}

/**
 * Check if a successful sync has already been performed today.
 */
function isSyncToday(): boolean {
  try {
    const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
    const lastSyncDateStr = (getMeta.get('last_sync_date') as any)?.value;
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
    .all(startDate.substring(0, 7)) as any[];
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
    .all(dailyStart) as any[];
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
    const hasAnyValue = Object.keys(data).some(k => k !== 'date' && (data as any)[k] !== null);
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
    const lastSyncDate = (getMeta.get('last_sync_date') as any)?.value || null;
    const lastSyncStatus = (getMeta.get('last_sync_status') as any)?.value || null;
    const hasData = (db.prepare('SELECT COUNT(*) as count FROM fred_latest').get() as any).count > 0;
    const lastFredMonthly = getLastFredMonthlyDate();
    const lastFredDaily = getLastFredDailyDate();
    const monthlyCount = (db.prepare('SELECT COUNT(*) as count FROM fred_history').get() as any).count;
    const dailyCount = (db.prepare('SELECT COUNT(*) as count FROM fred_daily').get() as any).count;
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
  const existingIds = (db.prepare('SELECT id FROM fred_latest').all() as any[]).map(r => r.id);
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
      const lastSyncDate = (getMeta.get('last_sync_date') as any)?.value || null;
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
      const lastSyncDate = (getMeta.get('last_sync_date') as any)?.value || null;
      res.json({ ...result, lastSyncDate, skipped: false });
    } else {
      const lastMonthly = getLastFredMonthlyDate();

      if (!lastMonthly) {
        // No data at all: full sync from 1990
        console.log('[sync] No FRED data found. Full sync from 1990...');
        const result = await syncFredData('1990-01-01');
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as any)?.value || null;
        res.json({ ...result, lastSyncDate, skipped: false });
      } else {
        // Monthly data exists — just do incremental daily sync
        console.log('[sync] Monthly data exists. Doing incremental daily sync...');
        const result = await syncIncrementalDaily();
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as any)?.value || null;
        res.json({ ...result, lastSyncDate, skipped: false });
      }
    }
  } catch (error) {
    console.error('Sync Error:', error);
    try {
      const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
      upsertMeta.run('last_sync_status', 'error');
    } catch (_) { /* ignore metadata write failure */ }
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

const SENTIMENT_LOOKBACK_MONTHS = 12; // 1-year percentile window

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
    function getPercentileRank(values: number[], currentVal: number): number {
      const sorted = [...values].sort((a, b) => a - b);
      const rank = sorted.filter(v => v <= currentVal).length;
      return (rank / sorted.length) * 100;
    }

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

const ESI_LOOKBACK = 6; // months for rolling stats

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
  const dailyRows = db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key DESC LIMIT 90').all() as any[];
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
    const monthlyRows = db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key DESC LIMIT 6').all() as any[];
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
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

    // ── Initial Claims Signal (ICSA) ─────────────────────────────────────────
    // ICSA is weekly (in daily table). Extract values sorted chronologically.
    const icsaPoints: number[] = [];
    for (const { data } of dailyData) {
      const v = data['ICSA'];
      if (v !== null && v !== undefined && v > 0) icsaPoints.push(v);
    }
    // 3-month (12-week) moving average using last 12 observations
    let icsa3mMA: number | null = null;
    if (icsaPoints.length >= 12) {
      const window12 = icsaPoints.slice(-12);
      icsa3mMA = window12.reduce((s, v) => s + v, 0) / 12;
    }
    // 52-week low (52 weekly observations)
    let icsa52wLow: number | null = null;
    if (icsaPoints.length >= 52) {
      icsa52wLow = Math.min(...icsaPoints.slice(-52));
    } else if (icsaPoints.length > 0) {
      icsa52wLow = Math.min(...icsaPoints);
    }
    // Signal: how far above the 52W low is the 3M MA? 15% above → full score
    let icsaSignal = 0;
    let icsaScore = 0;
    if (icsa3mMA !== null && icsa52wLow !== null && icsa52wLow > 0) {
      icsaSignal = Math.max(0, (icsa3mMA - icsa52wLow) / icsa52wLow);
      icsaScore = Math.min(100, (icsaSignal / 0.15) * 100);
    }

    // ── Composite probability ─────────────────────────────────────────────────
    // Weights: Sahm 35% · Probit 45% · Claims 20%
    const sahmSignal = Math.min(100, Math.max(0, (latestSahm / 0.50) * 100));
    const composite = Math.round(0.35 * sahmSignal + 0.45 * latestProbit + 0.20 * icsaScore);

    // ── Build combined monthly history for chart ──────────────────────────────
    const probitByMonth: Record<string, number> = {};
    for (const pt of spreadPoints) {
      const mk = pt.date.substring(0, 7);
      probitByMonth[mk] = pt.probit;
    }
    const history = sahmHistory.map(pt => ({
      date: pt.month + '-01',
      probability: Math.round(0.35 * Math.min(100, (pt.sahm / 0.50) * 100) + 0.45 * (probitByMonth[pt.month] ?? 0) + 0.20 * icsaScore),
      sahm: pt.sahm,
    }));

    // ── Risk level ────────────────────────────────────────────────────────────
    const riskLevel = composite >= 50 ? 'Elevated' : composite >= 25 ? 'Moderate' : 'Low';
    const trend = history.length >= 4
      ? (history[history.length - 1].probability > history[history.length - 4].probability ? 'Rising' : 'Falling')
      : 'Stable';

    const analysis = composite >= 50
      ? `Composite recession probability is ${composite}%. Sahm Rule: ${latestSahm.toFixed(2)} (threshold 0.50). Yield curve probit: ${latestProbit.toFixed(1)}%. Claims signal: ${Math.round(icsaScore)}% (3M MA at ${(icsaSignal * 100).toFixed(1)}% above 52W low). Defensive posture recommended.`
      : composite >= 25
        ? `Composite recession probability is ${composite}% — moderate but below the 50% threshold. Sahm Rule: ${latestSahm.toFixed(2)}. Yield curve probit: ${latestProbit.toFixed(1)}%. Claims signal: ${Math.round(icsaScore)}%. Monitor for further deterioration.`
        : `Recession risk is Low (${composite}%). Sahm Rule: ${latestSahm.toFixed(2)} (well below 0.50). Probit: ${latestProbit.toFixed(1)}%. Claims signal: ${Math.round(icsaScore)}%.`;

    res.json({
      composite,
      riskLevel,
      trend,
      sahm: { current: latestSahm, triggered: sahmTriggered, threshold: 0.50 },
      probit: { current: latestProbit, spread: Math.round(latestSpread * 100) / 100 },
      claims: {
        icsa3mMA: icsa3mMA !== null ? Math.round(icsa3mMA) : null,
        icsa52wLow: icsa52wLow !== null ? Math.round(icsa52wLow) : null,
        icsaSignalPct: Math.round(icsaSignal * 100 * 10) / 10,
        icsaScore: Math.round(icsaScore),
      },
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
    const latestRows = (db.prepare('SELECT id, value, date FROM fred_latest').all() as any[]);
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
    const spreadMonthly = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ date: r.month_key + '-01', data: JSON.parse(r.data) }));
    const spreadDaily = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ date: r.date_key, data: JSON.parse(r.data) }));

    const spreadHistory: { date: string; spread: number }[] = [];
    for (const { date, data } of [...spreadMonthly, ...spreadDaily]) {
      const v = data['T10Y2Y'];
      if (v !== null && v !== undefined) {
        spreadHistory.push({ date, spread: Math.round(v * 100) / 100 });
      }
    }
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

    // 5Y5Y forward rate: market's expectation for 10Y rate in 5 years
    // f(5,10) = (10 * DGS10 - 5 * DGS5) / 5
    const dgs5 = latestMap['DGS5'] ?? null;
    const dgs10 = latestMap['DGS10'] ?? null;
    const dgs2 = latestMap['DGS2'] ?? null;
    const forwardRate5y5y = dgs5 !== null && dgs10 !== null
      ? Math.round(((10 * dgs10 - 5 * dgs5) / 5) * 100) / 100
      : null;

    // Term premium proxy: 10Y-2Y spread
    const termPremiumProxy = dgs10 !== null && dgs2 !== null
      ? Math.round((dgs10 - dgs2) * 100) / 100
      : null;

    // Term premium percentile vs 5-year history
    const termPremArr: number[] = [];
    for (const { data } of spreadMonthly) {
      const d10 = data['DGS10'];
      const d2 = data['DGS2'];
      if (d10 !== null && d10 !== undefined && d2 !== null && d2 !== undefined) {
        termPremArr.push(d10 - d2);
      }
    }
    const termPrem60 = termPremArr.slice(-60);
    const termPremiumPercentile = termPremiumProxy !== null && termPrem60.length > 0
      ? Math.round((termPrem60.filter(v => v <= termPremiumProxy).length / termPrem60.length) * 100)
      : null;

    res.json({
      currentCurve,
      spread10y2y: spread10y2y !== null ? Math.round(spread10y2y * 100) / 100 : null,
      spread10y3m: spread10y3m !== null ? Math.round(spread10y3m * 100) / 100 : null,
      curveDynamic,
      inversionDays,
      forwardRate5y5y,
      termPremiumProxy,
      termPremiumPercentile,
      history: spreadHistory,
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const latestRows = (db.prepare('SELECT id, value FROM fred_latest').all() as any[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    // Current readings
    const hySpread = latestMap['BAMLH0A0HYM2'] ?? null;
    const igOAS = latestMap['BAMLC0A0CM'] ?? null;
    const lendingStandards = latestMap['DRTSCILM'] ?? null; // net % tightening

    // Build indexed monthly series with forward-fill for quarterly DRTSCILM
    let lastDRTSCILM: number | null = null;
    const busloansArr: number[] = [];
    const totalslArr: number[] = [];
    const hyArr: number[] = [];
    const sloosArr: number[] = [];
    const history: { date: string; hy_spread: number | null; ig_spread: number | null; lending_standards: number | null }[] = [];

    for (const { key, data } of monthlyData) {
      const drtsc = data['DRTSCILM'];
      if (drtsc !== null && drtsc !== undefined) lastDRTSCILM = drtsc;
      const bl = data['BUSLOANS'];
      const tl = data['TOTALSL'];
      const hy = data['BAMLH0A0HYM2'];
      if (bl !== null && bl !== undefined) busloansArr.push(bl);
      if (tl !== null && tl !== undefined) totalslArr.push(tl);
      if (hy !== null && hy !== undefined) hyArr.push(hy);
      if (lastDRTSCILM !== null) sloosArr.push(lastDRTSCILM);
      history.push({
        date: key + '-01',
        hy_spread: hy ?? null,
        ig_spread: data['BAMLC0A0CM'] ?? null,
        lending_standards: lastDRTSCILM,
      });
    }
    // Business loans YoY growth
    let creditGrowthYoY: number | null = null;
    if (busloansArr.length >= 13) {
      const latest = busloansArr[busloansArr.length - 1];
      const yearAgo = busloansArr[busloansArr.length - 13];
      creditGrowthYoY = Math.round(((latest - yearAgo) / yearAgo) * 100 * 10) / 10;
    }

    // Credit impulse: second derivative of credit growth (leads GDP 6-12 months)
    // = monthly MoM growth rate change (acceleration of credit)
    let creditImpulse: number | null = null;
    let consumerCreditImpulse: number | null = null;
    if (busloansArr.length >= 3) {
      const n = busloansArr.length;
      const mom1 = (busloansArr[n - 1] - busloansArr[n - 2]) / busloansArr[n - 2];
      const mom2 = (busloansArr[n - 2] - busloansArr[n - 3]) / busloansArr[n - 3];
      creditImpulse = Math.round((mom1 - mom2) * 12 * 100 * 100) / 100; // annualised %
    }
    if (totalslArr.length >= 3) {
      const n = totalslArr.length;
      const mom1 = (totalslArr[n - 1] - totalslArr[n - 2]) / totalslArr[n - 2];
      const mom2 = (totalslArr[n - 2] - totalslArr[n - 3]) / totalslArr[n - 3];
      consumerCreditImpulse = Math.round((mom1 - mom2) * 12 * 100 * 100) / 100;
    }

    // Build full impulse history
    const impulseHistory: { date: string; creditImpulse: number | null; consumerImpulse: number | null }[] = [];
    const blWindow: number[] = [];
    const tlWindow: number[] = [];
    for (const { key, data } of monthlyData) {
      const bl = data['BUSLOANS'];
      const tl = data['TOTALSL'];
      if (bl !== null && bl !== undefined) blWindow.push(bl);
      if (tl !== null && tl !== undefined) tlWindow.push(tl);
      let ciPoint: number | null = null;
      let ccPoint: number | null = null;
      if (blWindow.length >= 3) {
        const n = blWindow.length;
        const m1 = (blWindow[n-1] - blWindow[n-2]) / blWindow[n-2];
        const m2 = (blWindow[n-2] - blWindow[n-3]) / blWindow[n-3];
        ciPoint = Math.round((m1 - m2) * 12 * 100 * 100) / 100;
      }
      if (tlWindow.length >= 3) {
        const n = tlWindow.length;
        const m1 = (tlWindow[n-1] - tlWindow[n-2]) / tlWindow[n-2];
        const m2 = (tlWindow[n-2] - tlWindow[n-3]) / tlWindow[n-3];
        ccPoint = Math.round((m1 - m2) * 12 * 100 * 100) / 100;
      }
      impulseHistory.push({ date: key + '-01', creditImpulse: ciPoint, consumerImpulse: ccPoint });
    }

    // Percentile-based phase classification (5-year rolling percentile)
    const hyWindow60 = hyArr.slice(-60).filter(v => v > 0);
    const sloosWindow60 = sloosArr.slice(-60);
    const hyPercentile = hySpread !== null && hyWindow60.length > 0
      ? Math.round((hyWindow60.filter(v => v <= hySpread).length / hyWindow60.length) * 100)
      : null;
    const sloosPercentile = lendingStandards !== null && sloosWindow60.length > 0
      ? Math.round((sloosWindow60.filter(v => v <= lendingStandards).length / sloosWindow60.length) * 100)
      : null;

    let cyclePhase = 'Mid Cycle';
    if (hyPercentile !== null && sloosPercentile !== null) {
      if (hyPercentile >= 80 || sloosPercentile >= 80) {
        cyclePhase = 'Stress / Late Cycle';
      } else if (hyPercentile >= 60 || sloosPercentile >= 60) {
        cyclePhase = 'Tightening';
      } else if (hyPercentile <= 25 && (creditImpulse ?? 0) > 0) {
        cyclePhase = 'Early Expansion';
      } else if ((creditImpulse ?? 0) < 0 && hyPercentile > 40) {
        cyclePhase = 'Turning';
      }
    }

    // Spread change vs prior month
    const prevHY = history.length >= 2 ? history[history.length - 2].hy_spread : null;
    const spreadChangePct = hySpread !== null && prevHY !== null && prevHY > 0
      ? Math.round(((hySpread - prevHY) / prevHY) * 100 * 10) / 10
      : null;

    res.json({
      hySpread: hySpread !== null ? Math.round(hySpread * 100) / 100 : null,
      igOAS: igOAS !== null ? Math.round(igOAS * 100) / 100 : null,
      lendingStandards: lendingStandards !== null ? Math.round(lendingStandards * 10) / 10 : null,
      creditGrowthYoY,
      creditImpulse,
      consumerCreditImpulse,
      hyPercentile,
      sloosPercentile,
      cyclePhase,
      spreadChangePct,
      history,
      impulseHistory,
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
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

    // Growth impulse: 3-month change in CFNAI
    let growthImpulse: number | null = null;
    if (regimeHistory.length >= 4) {
      const now = regimeHistory[regimeHistory.length - 1].growthSignal;
      const threeMonthsAgo = regimeHistory[regimeHistory.length - 4].growthSignal;
      growthImpulse = Math.round((now - threeMonthsAgo) * 100) / 100;
    }

    // Inflation impulse: 3-month change in CPI YoY
    let inflationImpulse: number | null = null;
    if (regimeHistory.length >= 4) {
      const now = regimeHistory[regimeHistory.length - 1].inflationYoY;
      const threeMonthsAgo = regimeHistory[regimeHistory.length - 4].inflationYoY;
      inflationImpulse = Math.round((now - threeMonthsAgo) * 10) / 10;
    }

    // Regime momentum: how consistent is the current regime over the last 6 months?
    const last6 = regimeHistory.slice(-6).map(r => r.regime);
    const regimeConsistency = last6.filter(r => r === currentRegime).length;
    let regimeMomentum: 'Strengthening' | 'Established' | 'Shifting';
    if (regimeConsistency >= 4) {
      regimeMomentum = 'Established';
    } else if (
      (currentRegime === 0 && (growthImpulse ?? 0) > 0 && (inflationImpulse ?? 0) < 0) ||
      (currentRegime === 1 && (growthImpulse ?? 0) > 0 && (inflationImpulse ?? 0) > 0) ||
      (currentRegime === 2 && (growthImpulse ?? 0) < 0 && (inflationImpulse ?? 0) > 0) ||
      (currentRegime === 3 && (growthImpulse ?? 0) < 0 && (inflationImpulse ?? 0) < 0)
    ) {
      regimeMomentum = 'Strengthening';
    } else {
      regimeMomentum = 'Shifting';
    }

    // 2D scatter coordinates (clamp to [-2, +2] for display)
    const growthCoord = latest ? Math.max(-2, Math.min(2, latest.growthSignal)) : null;
    const inflationCoord = latest ? Math.max(-2, Math.min(2, latest.inflationYoY - 2.5)) : null;

    // Build 12-month scatter trail (last 12 points for regime trajectory)
    const scatterTrail = regimeHistory.slice(-12).map(r => ({
      date: r.date,
      growthCoord: Math.max(-2, Math.min(2, r.growthSignal)),
      inflationCoord: Math.max(-2, Math.min(2, r.inflationYoY - 2.5)),
      regime: r.regime,
    }));

    res.json({
      currentRegime,
      regimeName: REGIME_NAMES[currentRegime].name,
      description: REGIME_NAMES[currentRegime].description,
      assets: REGIME_NAMES[currentRegime].assets,
      growthSignal: latest?.growthSignal ?? null,
      inflationYoY: latest?.inflationYoY ?? null,
      confidence: latest?.confidence ?? null,
      growthImpulse,
      inflationImpulse,
      regimeMomentum,
      regimeConsistency,
      growthCoord,
      inflationCoord,
      scatterTrail,
      history: regimeHistory,
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const latestRows = (db.prepare('SELECT id, value FROM fred_latest').all() as any[]);
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
        // Taylor Rule: r* = neutral + π + 0.5*(π - 2.0) + 0.5*outputGap
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

    const latest = history.length > 0 ? history[history.length - 1] : null;

    // Current live readings (use DFEDTARU/DFEDTARL for current target bounds)
    const upperBound = latestMap['DFEDTARU'] ?? null;
    const lowerBound = latestMap['DFEDTARL'] ?? null;

    // Neutral rate sensitivity: run Taylor Rule at 3 r* assumptions
    const currentFedfunds = latest?.fedFunds ?? latestMap['FEDFUNDS'] ?? null;
    const currentPi = latest?.inflationYoY ?? null;
    const currentCFNAI = (monthlyData[monthlyData.length - 1].data['CFNAI'] as number | undefined) ?? null;
    const currentOutputGap = currentCFNAI !== null ? currentCFNAI * 2.0 : 0;

    let taylorLow: number | null = null;
    let taylorMid: number | null = null;
    let taylorHigh: number | null = null;
    if (currentPi !== null) {
      taylorLow  = Math.round((2.0 + currentPi + 0.5 * (currentPi - 2.0) + 0.5 * currentOutputGap) * 100) / 100;
      taylorMid  = Math.round((2.5 + currentPi + 0.5 * (currentPi - 2.0) + 0.5 * currentOutputGap) * 100) / 100;
      taylorHigh = Math.round((3.5 + currentPi + 0.5 * (currentPi - 2.0) + 0.5 * currentOutputGap) * 100) / 100;
    }

    // Quick Sahm Rule for cut probability
    const unratePoints2: number[] = [];
    for (const { data } of monthlyData) {
      const v = data['UNRATE'];
      if (v !== null && v !== undefined) unratePoints2.push(v);
    }
    let latestSahm2 = 0;
    if (unratePoints2.length >= 14) {
      const n = unratePoints2.length;
      const u3ma = (unratePoints2[n-1] + unratePoints2[n-2] + unratePoints2[n-3]) / 3;
      let minU3ma = u3ma;
      for (let k = 2; k < 14 && k < n; k++) {
        const m = (unratePoints2[n-k-1] + unratePoints2[n-k-2] + unratePoints2[n-k-3]) / 3;
        if (m < minU3ma) minU3ma = m;
      }
      latestSahm2 = Math.max(0, u3ma - minU3ma);
    }

    // Cut probability heuristic (6-month horizon)
    const midGap = (currentFedfunds !== null && taylorMid !== null) ? currentFedfunds - taylorMid : null;
    let cutProbability: number;
    if (latestSahm2 >= 0.5) cutProbability = 75;
    else if (latestSahm2 >= 0.3 && midGap !== null && midGap <= -1) cutProbability = 50;
    else if (midGap !== null && midGap <= -2) cutProbability = 40;
    else if (latestSahm2 < 0.1 && midGap !== null && midGap >= 1) cutProbability = 15;
    else cutProbability = 25;

    // Policy stance: based on mid gap (Fed vs Taylor Rule at r*=2.5)
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
        taylorLow,
        taylorMid,
        taylorHigh,
        gap,
        realRate: latest?.realRate ?? null,
        inflationYoY: latest?.inflationYoY ?? null,
        upperBound,
        lowerBound,
        policyStance,
        cutProbability,
      },
      history,
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
    const latestRows = (db.prepare('SELECT id, value, date FROM fred_latest').all() as any[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));

    // Build 60-month monthly history for percentile calculations
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const last60monthly = monthlyData.slice(-60);

    // Build 5-year rolling arrays for percentile scoring
    const realYieldArr: number[] = [];
    const breakevenArr: number[] = [];
    const termPremArr2: number[] = [];
    for (const { data } of last60monthly) {
      const ry = data['DFII10'];
      const be = data['T10YIE'];
      const d10 = data['DGS10'];
      const d3m = data['DGS3M'];
      if (ry !== null && ry !== undefined) realYieldArr.push(ry);
      if (be !== null && be !== undefined) breakevenArr.push(be);
      if (d10 !== null && d10 !== undefined && d3m !== null && d3m !== undefined) termPremArr2.push(d10 - d3m);
    }

    // ── Term Premium (DGS10 - DGS3M) — percentile-based
    const termPremium = (latestMap['DGS10'] != null && latestMap['DGS3M'] != null)
      ? Math.round((latestMap['DGS10'] - latestMap['DGS3M']) * 100) / 100 : null;
    const termPremPct = termPremium !== null && termPremArr2.length > 0
      ? Math.round((termPremArr2.filter(v => v <= termPremium).length / termPremArr2.length) * 100) : null;
    const termScore: -1 | 0 | 1 = termPremPct === null ? 0 : termPremPct >= 65 ? 1 : termPremPct <= 35 ? -1 : 0;

    // ── Real Yield (DFII10 — 10Y TIPS) — percentile-based
    const realYield = latestMap['DFII10'] ?? null;
    const realYieldPct = realYield !== null && realYieldArr.length > 0
      ? Math.round((realYieldArr.filter(v => v <= realYield).length / realYieldArr.length) * 100) : null;
    const realScore: -1 | 0 | 1 = realYieldPct === null ? 0 : realYieldPct >= 70 ? 1 : realYieldPct <= 30 ? -1 : 0;

    // ── Breakeven Inflation (T10YIE) — percentile-based (lower = more bond-friendly)
    const breakeven = latestMap['T10YIE'] ?? null;
    const breakevenPct = breakeven !== null && breakevenArr.length > 0
      ? Math.round((breakevenArr.filter(v => v <= breakeven).length / breakevenArr.length) * 100) : null;
    const breakevenScore: -1 | 0 | 1 = breakevenPct === null ? 0 : breakevenPct <= 30 ? 1 : breakevenPct >= 70 ? -1 : 0;

    // ── Curve Dynamic (3-month delta in DGS10 vs DGS2) — directional
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

    // ── Duration Risk (is DGS10 rising over last 3M?) — directional
    const dgs10_3m_ago = recent90.length >= 60 ? recent90[0].data['DGS10'] : null;
    const dgs10_now = latestMap['DGS10'] ?? null;
    const durationRising = dgs10_3m_ago && dgs10_now ? dgs10_now > dgs10_3m_ago + 0.1 : null;
    const durationScore: -1 | 0 | 1 = durationRising === null ? 0 : durationRising ? -1 : 1;

    const totalScore = termScore + realScore + breakevenScore + curveScore + durationScore;

    const history = monthlyData.map(({ key, data }) => ({
      date: key + '-01',
      dgs10: data['DGS10'] ?? null,
      realYield: data['DFII10'] ?? null,
      breakeven: data['T10YIE'] ?? null,
    }));

    const termPremDesc = termPremPct === null ? 'N/A' : termPremPct >= 65 ? `Steep at ${termPremPct}th pct — favorable carry` : termPremPct <= 35 ? `Compressed at ${termPremPct}th pct — inverted or flat` : `Moderate at ${termPremPct}th pct — transitional`;
    const realDesc = realYieldPct === null ? 'N/A' : realYieldPct >= 70 ? `Elevated at ${realYieldPct}th pct — attractive entry for duration` : realYieldPct <= 30 ? `Depressed at ${realYieldPct}th pct — financial repression` : `Moderate at ${realYieldPct}th pct — fair value`;
    const beDesc = breakevenPct === null ? 'N/A' : breakevenPct <= 30 ? `Low at ${breakevenPct}th pct — disinflationary tailwind` : breakevenPct >= 70 ? `Elevated at ${breakevenPct}th pct — inflation risk premium` : `Anchored at ${breakevenPct}th pct — expectations stable`;

    res.json({
      score: totalScore,
      components: [
        { name: 'Term Premium (10Y-3M)', value: termPremium, score: termScore, percentile: termPremPct, description: termPremDesc },
        { name: 'Real Yield (TIPS 10Y)', value: realYield, score: realScore, percentile: realYieldPct, description: realDesc },
        { name: 'Breakeven Inflation', value: breakeven, score: breakevenScore, percentile: breakevenPct, description: beDesc },
        { name: 'Curve Dynamic', value: curveDynamic, score: curveScore, percentile: null, description: curveScore === 1 ? 'Bull trend — falling rates support bond prices' : curveScore === -1 ? 'Bear trend — rising rates pressure bond prices' : 'Stable — range-bound rate environment' },
        { name: 'Duration Risk (DGS10 trend)', value: dgs10_now, score: durationScore, percentile: null, description: durationRising === null ? 'N/A' : durationRising ? '10Y yield rising — duration exposure is a headwind' : '10Y yield stable/falling — duration risk is contained' },
      ],
      percentiles: { realYield: realYieldPct, breakeven: breakevenPct, termPremium: termPremPct },
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
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const latestMap: Record<string, number> = {};
    for (const r of (db.prepare('SELECT id, value FROM fred_latest').all() as any[])) {
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

    // Build full monthly history for chart
    const history = monthlyData.map(({ key, data }) => ({
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
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    const oilSeries = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => ({ date: key + '-01', value: data['OIL'] ?? null }),
      ({ key, data }) => ({ date: key, value: data['OIL'] ?? null }),
    );
    const goldSeries = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => ({ date: key + '-01', value: data['GOLD'] ?? null }),
      ({ key, data }) => ({ date: key, value: data['GOLD'] ?? null }),
    );
    const copperSeries = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => ({ date: key + '-01', value: data['COPPER'] ?? null }),
      ({ key, data }) => ({ date: key, value: data['COPPER'] ?? null }),
    );

    const oilPrice = latestNonNullPoint(oilSeries)?.value ?? null;
    const goldPrice = latestNonNullPoint(goldSeries)?.value ?? null;
    const copperPrice = latestNonNullPoint(copperSeries)?.value ?? null;

    const copperGoldRatio = goldPrice !== null && copperPrice !== null && goldPrice > 0
      ? Math.round((copperPrice / goldPrice) * 10000) / 10000 : null;
    const goldOilRatio = goldPrice !== null && oilPrice !== null && oilPrice > 0
      ? Math.round((goldPrice / oilPrice) * 100) / 100 : null;

    const copper12m = computeReturnFromSeries(copperSeries, 12);
    const copperSignal = copper12m === null ? 'Insufficient data'
      : copper12m > 10 ? 'Strong Growth'
        : copper12m > 0 ? 'Moderate Growth'
          : copper12m > -10 ? 'Slowing'
            : 'Contraction';

    const ratioHistory = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => {
        const oil = data['OIL']; const gold = data['GOLD']; const copper = data['COPPER'];
        return {
          date: key + '-01',
          copperGold: copper && gold && gold > 0 ? Math.round((copper / gold) * 10000) / 10000 : null,
          goldOil: gold && oil && oil > 0 ? Math.round((gold / oil) * 100) / 100 : null,
        };
      },
      ({ key, data }) => {
        const oil = data['OIL']; const gold = data['GOLD']; const copper = data['COPPER'];
        return {
          date: key,
          copperGold: copper && gold && gold > 0 ? Math.round((copper / gold) * 10000) / 10000 : null,
          goldOil: gold && oil && oil > 0 ? Math.round((gold / oil) * 100) / 100 : null,
        };
      },
    ).filter(d => d.copperGold !== null || d.goldOil !== null);

    res.json({
      current: {
        oil: { price: oilPrice, r1m: computeReturnFromSeries(oilSeries, 1), r3m: computeReturnFromSeries(oilSeries, 3), r12m: computeReturnFromSeries(oilSeries, 12) },
        gold: { price: goldPrice, r1m: computeReturnFromSeries(goldSeries, 1), r3m: computeReturnFromSeries(goldSeries, 3), r12m: computeReturnFromSeries(goldSeries, 12) },
        copper: { price: copperPrice, r1m: computeReturnFromSeries(copperSeries, 1), r3m: computeReturnFromSeries(copperSeries, 3), r12m: computeReturnFromSeries(copperSeries, 12) },
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
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    // Build DTWEXBGS and DXY series (prefer DXY from Yahoo, fallback to DTWEXBGS)
    const series = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => ({ date: key + '-01', dxy: data['DXY'] ?? data['DTWEXBGS'] ?? null, sp500: data['SP500'] ?? null, gold: data['GOLD'] ?? null }),
      ({ key, data }) => ({ date: key, dxy: data['DXY'] ?? data['DTWEXBGS'] ?? null, sp500: data['SP500'] ?? null, gold: data['GOLD'] ?? null }),
    );

    const dxyPoints = series.map(point => ({ date: point.date, value: point.dxy }));
    const latestDxyPoint = latestNonNullPoint(dxyPoints);
    const latestDxy = latestDxyPoint?.value ?? null;

    // 52-week percentile rank using all available points in the last year
    const rankCutoff = latestDxyPoint ? getMonthsAgoDate(12, latestDxyPoint.date) : null;
    const last12m = rankCutoff
      ? dxyPoints.filter(point => point.date >= rankCutoff && point.value !== null).map(point => point.value as number)
      : [];
    const rank52w = last12m.length > 0 && latestDxy !== null
      ? Math.round((last12m.filter(v => v <= latestDxy).length / last12m.length) * 100) : null;

    // DEXUSEU (USD/EUR) — latest from fred_latest
    const latestMap: Record<string, number> = {};
    for (const r of (db.prepare('SELECT id, value FROM fred_latest').all() as any[])) {
      if (r.value !== null) latestMap[r.id] = r.value;
    }
    const usdEur = latestMap['DEXUSEU'] ?? null;

    // 60-day rolling Pearson correlation DXY vs SP500 and DXY vs GOLD
    const dailyCorrelationSeries = dailyData.map(({ key, data }) => ({
      date: key,
      dxy: data['DXY'] ?? data['DTWEXBGS'] ?? null,
      sp500: data['SP500'] ?? null,
      gold: data['GOLD'] ?? null,
    }));
    const corr60 = dailyCorrelationSeries.slice(-60).filter(s => s.dxy !== null && s.sp500 !== null);
    const corrGold60 = dailyCorrelationSeries.slice(-60).filter(s => s.dxy !== null && s.gold !== null);

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

    const history = series.map(s => ({ date: s.date, dxy: s.dxy }));

    res.json({
      current: {
        dxy: latestDxy,
        rank52w,
        r3m: computeReturnFromSeries(dxyPoints, 3),
        r6m: computeReturnFromSeries(dxyPoints, 6),
        r12m: computeReturnFromSeries(dxyPoints, 12),
        usdEur,
        regime
      },
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
 * Returns 5×5 Pearson correlation matrices for 3M / 5Y / ALL windows.
 * Assets: SP500, 10Y Treasury (price proxy), Gold, Oil, DXY.
 */
app.get('/api/models/correlations', (req, res) => {
  try {
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    const ASSETS = [
      { key: 'SP500', label: 'S&P 500' },
      { key: 'DGS10', label: '10Y Treasury' },
      { key: 'GOLD', label: 'Gold' },
      { key: 'OIL', label: 'Oil (WTI)' },
      { key: 'DXY', label: 'US Dollar (DXY)' },
    ] as const;

    type AssetKey = typeof ASSETS[number]['key'];
    type Observation = { date: string } & Record<AssetKey, number | null>;
    type ReturnPoint = { date: string; value: number };

    function buildObservation(date: string, data: Record<string, any>): Observation | null {
      const point: Observation = {
        date,
        SP500: data['SP500'] ?? null,
        DGS10: data['DGS10'] ?? null,
        GOLD: data['GOLD'] ?? null,
        OIL: data['OIL'] ?? null,
        DXY: data['DXY'] ?? data['DTWEXBGS'] ?? null,
      };

      const hasAnyValue = ASSETS.some(asset => point[asset.key] !== null && point[asset.key] !== undefined && !Number.isNaN(point[asset.key] as number));
      return hasAnyValue ? point : null;
    }

    const dailyObservations = dailyData
      .map(({ key, data }) => buildObservation(key, data))
      .filter((point): point is Observation => point !== null);

    const monthlyObservations = monthlyData
      .map(({ key, data }) => buildObservation(`${key}-01`, data))
      .filter((point): point is Observation => point !== null);

    function filterObservationsSince(observations: Observation[], months: number): Observation[] {
      if (!observations.length) return [];
      const cutoff = getMonthsAgoDate(months, observations[observations.length - 1].date);
      return observations.filter(point => point.date >= cutoff);
    }

    function buildReturnSeries(observations: Observation[], assetKey: AssetKey): ReturnPoint[] {
      const returns: ReturnPoint[] = [];
      let prevValue: number | null = null;

      for (const point of observations) {
        const value = point[assetKey];
        if (value === null || value === undefined || Number.isNaN(value)) continue;

        if (prevValue !== null) {
          const delta = assetKey === 'DGS10'
            ? prevValue - value
            : prevValue !== 0 ? (value - prevValue) / Math.abs(prevValue) : 0;

          if (!Number.isNaN(delta) && Number.isFinite(delta)) {
            returns.push({ date: point.date, value: delta });
          }
        }

        prevValue = value;
      }

      return returns;
    }

    function pearsonAligned(xs: ReturnPoint[], ys: ReturnPoint[]): number {
      const ysByDate = new Map(ys.map(point => [point.date, point.value]));
      const alignedX: number[] = [];
      const alignedY: number[] = [];

      for (const point of xs) {
        const otherValue = ysByDate.get(point.date);
        if (otherValue === undefined) continue;
        alignedX.push(point.value);
        alignedY.push(otherValue);
      }

      const n = alignedX.length;
      if (n < 5) return 0;

      const meanX = alignedX.reduce((sum, value) => sum + value, 0) / n;
      const meanY = alignedY.reduce((sum, value) => sum + value, 0) / n;
      const numerator = alignedX.reduce((sum, value, index) => sum + (value - meanX) * (alignedY[index] - meanY), 0);
      const denominator = Math.sqrt(
        alignedX.reduce((sum, value) => sum + (value - meanX) ** 2, 0) *
        alignedY.reduce((sum, value) => sum + (value - meanY) ** 2, 0)
      );

      return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100) / 100;
    }

    function buildMatrix(observations: Observation[]) {
      const matrix: Record<string, Record<string, number>> = {};
      const returnsByAsset = Object.fromEntries(
        ASSETS.map(asset => [asset.key, buildReturnSeries(observations, asset.key)])
      ) as Record<AssetKey, ReturnPoint[]>;

      for (const assetA of ASSETS) {
        matrix[assetA.key] = {};
        for (const assetB of ASSETS) {
          matrix[assetA.key][assetB.key] = assetA.key === assetB.key
            ? 1.0
            : pearsonAligned(returnsByAsset[assetA.key], returnsByAsset[assetB.key]);
        }
      }

      return matrix;
    }

    const observations3m = filterObservationsSince(dailyObservations, 3);
    const observations5y = filterObservationsSince(monthlyObservations, 60);
    const observationsAll = monthlyObservations;

    const matrices = {
      '3M': buildMatrix(observations3m),
      '5Y': buildMatrix(observations5y),
      'ALL': buildMatrix(observationsAll),
    };

    const stockBondCorrs = {
      '3M': matrices['3M']['SP500']?.['DGS10'] ?? 0,
      '5Y': matrices['5Y']['SP500']?.['DGS10'] ?? 0,
      'ALL': matrices['ALL']['SP500']?.['DGS10'] ?? 0,
    };

    const regime = stockBondCorrs['3M'] < -0.2 ? 'Classic Hedge (Negative Stock-Bond Corr.)'
      : stockBondCorrs['3M'] > 0.2 ? 'Inflation Regime (Positive Stock-Bond Corr.)'
        : 'Transitional';

    res.json({
      assets: ASSETS.map(asset => ({ key: asset.key, label: asset.label })),
      matrices,
      stockBondCorrs,
      windowMeta: {
        '3M': { label: '3M', cadence: 'Daily returns', observations: observations3m.length },
        '5Y': { label: '5Y', cadence: 'Monthly returns', observations: observations5y.length },
        'ALL': { label: 'All', cadence: 'Monthly returns', observations: observationsAll.length },
      },
      regime,
    });
  } catch (error) {
    console.error('[correlations] Error:', error);
    res.status(500).json({ error: 'Failed to compute correlation monitor' });
  }
});

// ── Liquidity Monitor ────────────────────────────────────────────────────────

/**
 * GET /api/models/liquidity
 * Net Fed Liquidity = WALCL - TGA (WDTGAL) - RRP (RRPONTSYD) + M2 + credit impulse.
 * All series already synced. Self-contained endpoint (no props required in frontend).
 */
app.get('/api/models/liquidity', (req, res) => {
  try {
    const dailyData = (db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key ASC').all() as any[])
      .map(r => ({ key: r.date_key, data: JSON.parse(r.data) }));
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    // Build net liquidity history (monthly through last year, then current-year daily)
    let lastWALCL: number | null = null;
    let lastWDTGAL: number | null = null;
    let lastRRPON: number | null = null;
    const netLiqSeries = mergeStoredHistory(
      monthlyData,
      dailyData,
      ({ key, data }) => {
        const wc = data['WALCL']; const tga = data['WDTGAL']; const rrp = data['RRPONTSYD'];
        if (wc !== null && wc !== undefined) lastWALCL = wc;
        if (tga !== null && tga !== undefined) lastWDTGAL = tga;
        if (rrp !== null && rrp !== undefined) lastRRPON = rrp;
        const nl = (lastWALCL !== null && lastWDTGAL !== null && lastRRPON !== null)
          ? Math.round((lastWALCL / 1e6 - lastWDTGAL / 1e6 - lastRRPON / 1e3) * 100) / 100
          : null;
        return { date: key + '-01', displayDate: key, netLiquidity: nl, sp500: data['SP500'] ?? null };
      },
      ({ key, data }) => {
        const wc = data['WALCL']; const tga = data['WDTGAL']; const rrp = data['RRPONTSYD'];
        if (wc !== null && wc !== undefined) lastWALCL = wc;
        if (tga !== null && tga !== undefined) lastWDTGAL = tga;
        if (rrp !== null && rrp !== undefined) lastRRPON = rrp;
        const nl = (lastWALCL !== null && lastWDTGAL !== null && lastRRPON !== null)
          ? Math.round((lastWALCL / 1e6 - lastWDTGAL / 1e6 - lastRRPON / 1e3) * 100) / 100
          : null;
        return { date: key, displayDate: key, netLiquidity: nl, sp500: data['SP500'] ?? null };
      },
    );
    const netLiqValues = netLiqSeries.map(point => ({ date: point.date, value: point.netLiquidity }));
    const latestNLPoint = latestNonNullPoint(netLiqValues);

    // Current readings
    const latestNL = latestNLPoint?.value ?? null;
    const nl90dAgo = latestNLPoint ? getValueOnOrBefore(netLiqValues, getMonthsAgoDate(3, latestNLPoint.date)) : null;
    const netLiqChange3m = (latestNL !== null && nl90dAgo !== null)
      ? Math.round((latestNL - nl90dAgo) * 100) / 100 : null;

    // M2 YoY from monthly
    const m2Arr: number[] = [];
    for (const { data } of monthlyData) {
      const v = data['M2SL']; if (v !== null && v !== undefined) m2Arr.push(v);
    }
    let m2YoY: number | null = null;
    if (m2Arr.length >= 13) m2YoY = Math.round(((m2Arr[m2Arr.length-1] / m2Arr[m2Arr.length-13]) - 1) * 100 * 10) / 10;

    // Business loans YoY
    const blArr: number[] = [];
    for (const { data } of monthlyData) {
      const v = data['BUSLOANS']; if (v !== null && v !== undefined) blArr.push(v);
    }
    let busloansYoY: number | null = null;
    if (blArr.length >= 13) busloansYoY = Math.round(((blArr[blArr.length-1] / blArr[blArr.length-13]) - 1) * 100 * 10) / 10;

    // Consumer credit YoY
    const tlArr: number[] = [];
    for (const { data } of monthlyData) {
      const v = data['TOTALSL']; if (v !== null && v !== undefined) tlArr.push(v);
    }
    let totalslYoY: number | null = null;
    if (tlArr.length >= 13) totalslYoY = Math.round(((tlArr[tlArr.length-1] / tlArr[tlArr.length-13]) - 1) * 100 * 10) / 10;

    // Mortgage rate
    const latestMap: Record<string, number> = {};
    for (const r of (db.prepare('SELECT id, value FROM fred_latest').all() as any[])) {
      if (r.value !== null) latestMap[r.id] = r.value;
    }
    const mortgage30 = latestMap['MORTGAGE30US'] ?? null;
    const walcl = lastWALCL !== null ? Math.round(lastWALCL / 1e6 * 100) / 100 : null;
    const tga = lastWDTGAL !== null ? Math.round(lastWDTGAL / 1e6 * 100) / 100 : null;
    const rrp = lastRRPON !== null ? Math.round(lastRRPON / 1e3 * 100) / 100 : null;

    // Pulse status
    const pulseStatus = (netLiqChange3m !== null && m2YoY !== null)
      ? netLiqChange3m > 0 && m2YoY > 0 ? 'Expansionary'
      : netLiqChange3m < 0 && m2YoY < 0 ? 'Contracting'
      : 'Mixed / Neutral'
      : 'Mixed / Neutral';

    // Full monthly M2 / credit history
    const m2History = monthlyData.map(({ key, data }, index) => {
      const yearAgo = index >= 12 ? monthlyData[index - 12].data : null;
      const m2Now = data['M2SL'] ?? null;
      const busloansNow = data['BUSLOANS'] ?? null;
      const totalslNow = data['TOTALSL'] ?? null;
      const m2YearAgo = yearAgo?.['M2SL'] ?? null;
      const busloansYearAgo = yearAgo?.['BUSLOANS'] ?? null;
      const totalslYearAgo = yearAgo?.['TOTALSL'] ?? null;

      return {
        date: key + '-01',
        displayDate: key,
        m2YoY: m2Now !== null && m2YearAgo ? Math.round(((m2Now / m2YearAgo) - 1) * 1000) / 10 : null,
        busloansYoY: busloansNow !== null && busloansYearAgo ? Math.round(((busloansNow / busloansYearAgo) - 1) * 1000) / 10 : null,
        totalslYoY: totalslNow !== null && totalslYearAgo ? Math.round(((totalslNow / totalslYearAgo) - 1) * 1000) / 10 : null,
      };
    }).filter(point => point.m2YoY !== null || point.busloansYoY !== null || point.totalslYoY !== null);

    res.json({
      current: { walcl, tga, rrp, netLiquidity: latestNL, netLiqChange3m, m2YoY, busloansYoY, totalslYoY, mortgage30, pulseStatus },
      history: netLiqSeries,
      m2History,
    });
  } catch (error) {
    console.error('[liquidity] Error:', error);
    res.status(500).json({ error: 'Failed to compute liquidity monitor' });
  }
});

// ── Financial Conditions Index (FCI) ─────────────────────────────────────────

/**
 * GET /api/models/fci
 * 6-component Z-score weighted FCI. Positive = loose, negative = tight.
 * Components: FEDFUNDS(20%), DFII10(20%), BAMLH0A0HYM2(20%), BAMLC0A0CM(15%), DTWEXBGS(15%), SP500 YoY(10%)
 */
app.get('/api/models/fci', (req, res) => {
  try {
    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    // FCI components: [seriesId, weight, tighteningSign(+1 = higher value means tighter)]
    // SP500 YoY is derived (negative direction: falling market = tighter)
    const COMPONENTS = [
      { id: 'FEDFUNDS',      weight: 0.20, sign: +1, label: 'Short Rate (Fed Funds)' },
      { id: 'DFII10',        weight: 0.20, sign: +1, label: 'Real Long Rate (TIPS 10Y)' },
      { id: 'BAMLH0A0HYM2', weight: 0.20, sign: +1, label: 'HY Credit Spread' },
      { id: 'BAMLC0A0CM',   weight: 0.15, sign: +1, label: 'IG Credit Spread' },
      { id: 'DTWEXBGS',     weight: 0.15, sign: +1, label: 'Dollar Strength (DXY)' },
      { id: 'SP500_YOY',    weight: 0.10, sign: -1, label: 'Equity Conditions (S&P YoY)' },
    ] as const;

    // Build monthly series for each component
    const seriesMap: Record<string, number[]> = {};
    const sp500Arr: number[] = [];
    for (const { data } of monthlyData) {
      for (const c of COMPONENTS) {
        if (c.id === 'SP500_YOY') continue;
        const v = data[c.id];
        if (!seriesMap[c.id]) seriesMap[c.id] = [];
        if (v !== null && v !== undefined) seriesMap[c.id].push(v);
        else seriesMap[c.id].push(NaN);
      }
      const sp = data['SP500'];
      sp500Arr.push(sp !== null && sp !== undefined ? sp : NaN);
    }
    // SP500 YoY returns
    seriesMap['SP500_YOY'] = sp500Arr.map((v, i) =>
      i >= 12 && !isNaN(v) && !isNaN(sp500Arr[i-12]) && sp500Arr[i-12] > 0
        ? ((v / sp500Arr[i-12]) - 1) * 100 : NaN
    );

    // Compute FCI for each month using rolling 36M Z-scores
    const fciHistory: { date: string; fci: number | null; fciImpulse: number | null }[] = [];
    for (let i = 36; i < monthlyData.length; i++) {
      const window = monthlyData.slice(i - 36, i);
      let fciValue = 0;
      let valid = true;

      for (const c of COMPONENTS) {
        const windowVals = window.map((_, wi) => {
          const arr = seriesMap[c.id];
          const offset = i - 36 + wi;
          return arr[offset] ?? NaN;
        }).filter(v => !isNaN(v));
        const currentVal = seriesMap[c.id][i];
        if (isNaN(currentVal) || windowVals.length < 12) { valid = false; break; }
        const mean = windowVals.reduce((s, v) => s + v, 0) / windowVals.length;
        const std = Math.sqrt(windowVals.reduce((s, v) => s + (v - mean) ** 2, 0) / windowVals.length);
        const z = std > 0 ? (currentVal - mean) / std : 0;
        fciValue += c.weight * z * c.sign * -1; // *-1: positive FCI = loose
      }

      fciHistory.push({
        date: monthlyData[i].key + '-01',
        fci: valid ? Math.round(fciValue * 100) / 100 : null,
        fciImpulse: null,
      });
    }

    // Compute FCI impulse (3-month change)
    for (let i = 3; i < fciHistory.length; i++) {
      const now = fciHistory[i].fci;
      const ago = fciHistory[i - 3].fci;
      fciHistory[i].fciImpulse = (now !== null && ago !== null) ? Math.round((now - ago) * 100) / 100 : null;
    }

    const recent60 = fciHistory.slice(-60);
    const latestFCI = fciHistory.length > 0 ? fciHistory[fciHistory.length - 1] : null;
    const fciValues60 = recent60.map(h => h.fci).filter((v): v is number => v !== null);
    const fciPercentile = latestFCI?.fci !== null && fciValues60.length > 0
      ? Math.round((fciValues60.filter(v => v <= latestFCI!.fci!).length / fciValues60.length) * 100) : null;

    const fciScore = latestFCI?.fci ?? null;
    const fciImpulse = latestFCI?.fciImpulse ?? null;
    const fciRegime = fciScore === null ? 'Unknown'
      : fciScore >= 0.5 ? 'Loose'
      : fciScore >= -0.5 ? 'Neutral'
      : fciScore >= -1.5 ? 'Tight'
      : 'Very Tight';

    // Current component contributions
    const n = monthlyData.length;
    const window36 = monthlyData.slice(n - 36, n);
    const components = COMPONENTS.map(c => {
      const windowVals = window36.map(({ data }, wi) => {
        if (c.id === 'SP500_YOY') {
          const offset = n - 36 + wi;
          return seriesMap['SP500_YOY'][offset] ?? NaN;
        }
        const v = data[c.id]; return (v !== null && v !== undefined) ? v : NaN;
      }).filter(v => !isNaN(v));
      const currentVal = c.id === 'SP500_YOY' ? seriesMap['SP500_YOY'][n - 1] : (monthlyData[n-1].data[c.id] ?? NaN);
      if (isNaN(currentVal) || windowVals.length < 12) return { name: c.label, value: null, zScore: null, weight: c.weight, contribution: null };
      const mean = windowVals.reduce((s, v) => s + v, 0) / windowVals.length;
      const std = Math.sqrt(windowVals.reduce((s, v) => s + (v - mean) ** 2, 0) / windowVals.length);
      const z = std > 0 ? (currentVal - mean) / std : 0;
      const contribution = Math.round(c.weight * z * c.sign * -1 * 100) / 100;
      return { name: c.label, value: Math.round(currentVal * 100) / 100, zScore: Math.round(z * 100) / 100, weight: c.weight, contribution };
    });

    res.json({
      score: fciScore,
      percentile: fciPercentile,
      impulse: fciImpulse,
      regime: fciRegime,
      components,
      history: fciHistory,
    });
  } catch (error) {
    console.error('[fci] Error:', error);
    res.status(500).json({ error: 'Failed to compute financial conditions index' });
  }
});

// ── Equity Risk Premium (ERP) ─────────────────────────────────────────────────

/**
 * GET /api/models/erp
 * Three ERP measures: Fed Model ERP, Real ERP (vs TIPS), Gordon Growth ERP.
 * earningsYield fetched live from Yahoo quoteSummary('^SPX', forwardPE).
 */
app.get('/api/models/erp', async (req, res) => {
  try {
    const latestRows = (db.prepare('SELECT id, value FROM fred_latest').all() as any[]);
    const latestMap: Record<string, number> = {};
    for (const r of latestRows) if (r.value !== null) latestMap[r.id] = r.value;

    const monthlyData = (db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key ASC').all() as any[])
      .map(r => ({ key: r.month_key, data: JSON.parse(r.data) }));

    // Fetch forward P/E from Yahoo Finance
    let forwardPE: number | null = null;
    let earningsYield: number | null = null;
    try {
      const quote = await yahooFinance.quoteSummary('^SPX', { modules: ['defaultKeyStatistics'] as any });
      const fpe = (quote as any).defaultKeyStatistics?.forwardPE ?? null;
      if (fpe && fpe > 0) {
        forwardPE = Math.round(fpe * 100) / 100;
        earningsYield = Math.round((1 / fpe) * 100 * 100) / 100; // in %
      }
    } catch (err: any) {
      console.warn('[erp] Yahoo quoteSummary failed:', err.message);
    }

    const dgs10 = latestMap['DGS10'] ?? null;
    const realYield = latestMap['DFII10'] ?? null;

    // Three ERP measures
    const fedERP = earningsYield !== null && dgs10 !== null
      ? Math.round((earningsYield - dgs10) * 100) / 100 : null;
    const realERP = earningsYield !== null && realYield !== null
      ? Math.round((earningsYield - realYield) * 100) / 100 : null;
    const gordonERP = earningsYield !== null && dgs10 !== null
      ? Math.round((earningsYield + 4.0 - dgs10) * 100) / 100 : null;

    // 5-year percentile for fedERP using historical approximation
    // Approximate historical earnings yield from CFNAI-trend: use SP500+DGS10 from history
    const erpHistory: { date: string; fedERP: number | null; realERP: number | null; sp500: number | null }[] = [];
    for (const { key, data } of monthlyData) {
      erpHistory.push({
        date: key + '-01',
        fedERP: null, // historical ERP requires earnings data not available in FRED; leave for current only
        realERP: null,
        sp500: data['SP500'] ?? null,
      });
    }

    // Compute 5Y percentile of fedERP using monthly DGS10 as proxy
    // Approximate: average ERP over last 5 years based on SP500 earnings yield from trailing PE
    // Without trailing PE history, we can approximate: earnings yield ≈ 1/(SP500/500E9) not available.
    // Instead compute percentile of (1/marketPE_rough - DGS10) using available DGS10 history.
    // Simplified: rank current fedERP vs last 60 months of (6% earnings yield proxy - DGS10)
    const hist60 = monthlyData.slice(-60);
    const approxERPArr: number[] = [];
    for (const { data } of hist60) {
      const d10 = data['DGS10'];
      if (d10 !== null && d10 !== undefined) {
        // 6% approximate long-run earnings yield used as proxy
        approxERPArr.push(6.0 - d10);
      }
    }
    const fedERPPercentile = fedERP !== null && approxERPArr.length > 0
      ? Math.round((approxERPArr.filter(v => v <= fedERP).length / approxERPArr.length) * 100) : null;

    const regime = fedERP === null ? 'Unknown'
      : fedERP > 2.0 ? 'Cheap (vs Bonds)'
      : fedERP > 0 ? 'Fair'
      : fedERP > -1 ? 'Expensive'
      : 'Very Expensive';

    const analysis = fedERP === null
      ? 'Forward P/E data unavailable from Yahoo Finance.'
      : `S&P 500 forward earnings yield is ${earningsYield?.toFixed(2)}% vs ${dgs10?.toFixed(2)}% 10Y Treasury. Fed Model ERP: ${fedERP > 0 ? '+' : ''}${fedERP?.toFixed(2)}% (${regime}). Real ERP vs TIPS: ${realERP !== null ? (realERP > 0 ? '+' : '') + realERP?.toFixed(2) + '%' : 'N/A'}. Gordon ERP (E/P + 4% growth): ${gordonERP !== null ? (gordonERP > 0 ? '+' : '') + gordonERP?.toFixed(2) + '%' : 'N/A'}.`;

    res.json({
      forwardPE,
      earningsYield,
      dgs10,
      realYield,
      fedERP,
      realERP,
      gordonERP,
      fedERPPercentile,
      regime,
      analysis,
      history: erpHistory,
    });
  } catch (error) {
    console.error('[erp] Error:', error);
    res.status(500).json({ error: 'Failed to compute equity risk premium' });
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

// Always serve static files in Hostinger if they exist
// We check multiple possible paths to handle different directory structures
const possiblePaths = [
  path.join(__dirname, '../../frontend/dist'), // Original structure (dev)
  path.join(__dirname, '../frontend/dist'),    // Restructured ZIP structure (prod)
  path.join(process.cwd(), 'frontend/dist')    // Root/cwd based structure
];

let selectedStaticPath = possiblePaths[0];
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    selectedStaticPath = p;
    break;
  }
}

app.use(express.static(selectedStaticPath));

// ── AI Analysis Backend Proxy ────────────────────────────────────────────────

app.post('/api/ai/generate', async (req, res) => {
  const { prompt, systemInstruction, history, userKey } = req.body;

  // Use user-provided key if available, otherwise fallback to server environment variable
  const apiKey = userKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('[AI Proxy]: GEMINI_API_KEY is missing in process.env and no userKey provided');
    return res.status(500).json({ error: 'AI API Key not found. Please provide your own key in settings or configure server environment.' });
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });

    // Use a more generic approach to handle different SDK versions
    const config: any = {
      model: 'gemini-2.5-flash',
    };

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    if (history) {
      const result = await genAI.models.generateContent({
        ...config,
        contents: [
          ...history.map((h: any) => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.text }]
          })),
          { role: 'user', parts: [{ text: prompt || '' }] }
        ]
      });
      return res.json({ text: result.text || (result as any).response?.text() || "Generated." });
    } else {
      const result = await genAI.models.generateContent({
        ...config,
        contents: prompt
      });
      return res.json({ text: result.text || (result as any).response?.text() || "Generated." });
    }
  } catch (error: any) {
    console.error('[AI Proxy Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to generate AI response' });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(selectedStaticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend build not found. Checked: ' + selectedStaticPath);
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Auto-seed runs AFTER server is listening (non-blocking)
  autoSeed();
});
