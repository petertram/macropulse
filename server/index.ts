import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';

dotenv.config();

const yahooFinance = new YahooFinance();
const app = express();
const PORT = 3000;
const FRED_API_KEY = process.env.FRED_API_KEY || '4030789b3b214aeade239a08babaa32a';

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

app.get('/api/fred', async (req, res) => {
  try {
    // Expanded series for a fully live scorecard
    const seriesIds = [
      'BAMLH0A0HYM2', // HY Spread
      'T10Y2Y',       // Yield Curve
      'VIXCLS',       // VIX 1M
      'VXVCLS',       // VIX 3M
      'DGS10',        // 10Y Treasury
      'STLFSI4',      // Financial Stress Index
      'CFNAI',        // Chicago Fed National Activity Index
      'DFII10'        // 10Y Real Yield
    ];
    
    const results = await Promise.all(seriesIds.map(async (id) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
        const data = await fetchWithRetry(url);
        return { id, value: data.observations[0]?.value, date: data.observations[0]?.date };
      } catch (err) {
        console.warn(`Error fetching ${id} after retries:`, err);
        return { id, value: null, date: null };
      }
    }));
    
    res.json(results);
  } catch (error) {
    console.error('FRED API Error:', error);
    res.status(500).json({ error: 'Failed to fetch FRED data' });
  }
});

app.get('/api/fred/history', async (req, res) => {
  try {
    const seriesIds = ['DGS10', 'BAMLH0A0HYM2', 'T10Y2Y', 'STLFSI4', 'CFNAI', 'VIXCLS', 'VXVCLS', 'DFII10'];
    const startDate = '1990-01-01';

    const results = await Promise.all(seriesIds.map(async (id) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&frequency=m&aggregation_method=eop&observation_start=${startDate}`;
        const data = await fetchWithRetry(url);
        return { id, observations: data.observations || [] };
      } catch (err) {
        console.warn(`Error fetching history for ${id} after retries:`, err);
        return { id, observations: [] };
      }
    }));

    const dateMap: Record<string, any> = {};
    results.forEach(series => {
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
      console.error('Yahoo Finance Error:', err.message, err.errors);
    }

    const alignedData = Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
    res.json(alignedData);
  } catch (error) {
    console.error('FRED History API Error:', error);
    res.status(500).json({ error: 'Failed to fetch FRED history' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
