// MacroPulse Backend Server v3
import express from 'express';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import Database from 'better-sqlite3';

dotenv.config();

const db = new Database('market_data.db');
const yahooFinance = new YahooFinance();
const app = express();
const PORT = 3001;
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
  'STICKCPID160SFRBATL', // Atlanta Fed Sticky Price CPI (monthly)
  // Market Sentiment series
  'UMCSENT',          // U. Michigan Consumer Sentiment (monthly)
  'USEPUINDXD',       // Economic Policy Uncertainty (daily, news-based NLP)
  'NFCI',             // Chicago Fed National Financial Conditions (weekly)
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

  // SP500 + Sentiment ETFs monthly from Yahoo Finance
  const YAHOO_MONTHLY_TICKERS = [
    { ticker: '^SPX', key: 'SP500' },
    { ticker: 'XLU', key: 'XLU' },   // Utilities (defensive)
    { ticker: 'XLY', key: 'XLY' },   // Consumer Discretionary (cyclical)
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

  // SP500 + Sentiment ETFs daily from Yahoo Finance
  const YAHOO_DAILY_TICKERS = [
    { ticker: '^SPX', key: 'SP500' },
    { ticker: 'XLU', key: 'XLU' },
    { ticker: 'XLY', key: 'XLY' },
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

    // If daily data is already current AND no new series are missing AND not forced, skip sync
    if (!forceFull && isDataCurrent() && !missingSeries) {
      console.log('[sync] Data is already current and all series are present, skipping sync');
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
    ]
  },
  growth: {
    label: 'Growth',
    series: [
      { id: 'INDPRO', name: 'Industrial Production', invert: false },
      { id: 'RSAFS', name: 'Retail Sales', invert: false },
      { id: 'HOUST', name: 'Housing Starts', invert: false },
    ]
  },
  inflation: {
    label: 'Inflation',
    series: [
      { id: 'CPIAUCSL', name: 'CPI All Urban', invert: false },
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

    // 6. Compute final score (sum of 3 pillars, clamped to [-2, +2])
    const results = US_SECTOR_ETFS.map(s => {
      const mom = momentumScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const fun = fundamentalScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const mac = macroScores[s.id] || { score: 0, value: 'N/A', breakdown: 'No data' };
      const rawScore = mom.score + fun.score + mac.score;
      const finalScore = Math.max(-2, Math.min(2, rawScore));

      return {
        id: s.id,
        sector: s.sector,
        ticker: s.ticker,
        momentum: mom,
        fundamental: fun,
        macro: mac,
        finalScore
      };
    });

    res.json(results);
  } catch (error: any) {
    console.error('[sectors] Error computing sector scorecard:', error.message);
    res.status(500).json({ error: 'Failed to compute sector scorecard' });
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
