import express from 'express';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import Database from 'better-sqlite3';

dotenv.config();

const db = new Database('market_data.db');
const yahooFinance = new YahooFinance();
const app = express();
const PORT = 3000;
const FRED_API_KEY = process.env.FRED_API_KEY || '4030789b3b214aeade239a08babaa32a';

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
`);

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      if (response.status === 502 || response.status === 503 || response.status === 504 || response.status === 429) {
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

app.get('/api/fred/history', (req, res) => {
  try {
    const stmt = db.prepare('SELECT data FROM fred_history ORDER BY month_key ASC');
    const results = stmt.all().map((r: any) => JSON.parse(r.data));
    res.json(results);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Failed to read from local database' });
  }
});

// Manual Sync Endpoint
app.post('/api/fred/sync', async (req, res) => {
  try {
    // 1. Sync Latest Observations
    const latestIds = [
      'BAMLH0A0HYM2', 'T10Y2Y', 'VIXCLS', 'VXVCLS',
      'DGS10', 'STLFSI4', 'CFNAI', 'DFII10'
    ];

    const latestResults = await Promise.all(latestIds.map(async (id) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
        const data = await fetchWithRetry(url);
        return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
      } catch (err) {
        console.warn(`Error fetching ${id} after retries:`, err);
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

    // 2. Sync Historical Data
    const startDate = '1990-01-01';
    const historyResults = await Promise.all(latestIds.map(async (id) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&frequency=m&aggregation_method=eop&observation_start=${startDate}`;
        const data = await fetchWithRetry(url);
        return { id, observations: data.observations || [] };
      } catch (err) {
        console.warn(`Error fetching history for ${id}:`, err);
        return { id, observations: [] };
      }
    }));

    const dateMap: Record<string, any> = {};
    historyResults.forEach(series => {
      series.observations.forEach((obs: any) => {
        const monthKey = obs.date.substring(0, 7);
        if (!dateMap[monthKey]) dateMap[monthKey] = { date: obs.date };
        dateMap[monthKey][series.id] = obs.value !== '.' ? parseFloat(obs.value) : null;
      });
    });

    try {
      const spxData: any[] = await yahooFinance.historical('^SPX', {
        period1: '1990-01-01',
        period2: new Date().toISOString().split('T')[0],
        interval: '1mo'
      });
      spxData.forEach((obs: any) => {
        const dateObj = new Date(obs.date);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        if (!dateMap[monthKey]) dateMap[monthKey] = { date: monthKey + '-01' };
        dateMap[monthKey]['SP500'] = obs.close;
      });
    } catch (err: any) {
      console.error('Yahoo Finance Error:', err.message);
    }

    const insertHistory = db.prepare('INSERT OR REPLACE INTO fred_history (month_key, data) VALUES (@month_key, @data)');
    const insertHistoryMany = db.transaction((entries: any) => {
      for (const [monthKey, data] of Object.entries(entries)) {
        insertHistory.run({ month_key: monthKey, data: JSON.stringify(data) });
      }
    });
    insertHistoryMany(dateMap);

    res.json({ success: true, message: 'FRED and Yahoo Data synced to SQLite' });
  } catch (error) {
    console.error('Sync Error:', error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('../frontend/dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
