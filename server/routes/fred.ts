import { Router } from 'express';
import { db } from '../db/client.js';
import { getLastFredMonthlyDate, getLastFredDailyDate, isDataCurrent, isSyncToday, hasMissingSeries, getMetaValue, getCountOf } from '../db/queries.js';
import { syncFredData, syncIncrementalDaily } from '../services/fredSync.js';
import { logger } from '../logger.js';
import { lastYearLastMonth } from '../utils.js';
import { HISTORY_START_DATE } from '../constants.js';

export const fredRouter = Router();
const router = fredRouter;

router.get('/', (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, value, date FROM fred_latest');
    const results = stmt.all();
    res.json(results);
  } catch (error) {
    logger.error('fred', 'Database Error:', error);
    res.status(500).json({ error: 'Failed to read from local database' });
  }
});

/**
 * Combined history endpoint:
 * Returns monthly data (1990 → end of last year) + daily data (current year → today)
 */
router.get('/history', (req, res) => {
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
    logger.error('fred', 'Database Error:', error);
    res.status(500).json({ error: 'Failed to read from local database' });
  }
});

// Sync Status Endpoint
router.get('/sync-status', (req, res) => {
  try {
    const lastSyncDate = getMetaValue('last_sync_date');
    const lastSyncStatus = getMetaValue('last_sync_status');
    const hasData = getCountOf('fred_latest') > 0;
    const lastFredMonthly = getLastFredMonthlyDate();
    const lastFredDaily = getLastFredDailyDate();
    const monthlyCount = getCountOf('fred_history');
    const dailyCount = getCountOf('fred_daily');
    const isCurrent = isDataCurrent();
    res.json({
      lastSyncDate, lastSyncStatus, hasData, isCurrent,
      lastFredMonthly, lastFredDaily,
      monthlyCount, dailyCount
    });
  } catch (error) {
    logger.error('fred', 'Sync Status Error:', error);
    res.status(500).json({ error: 'Failed to read sync status' });
  }
});

/**
 * Check if any FRED_SERIES_IDS are missing from the latest observations table.
 * This catches cases where new series were added to the config but never fetched.
 */
// Manual Sync Endpoint — smart incremental sync
router.post('/sync', async (req, res) => {
  try {
    const forceFull = req.body?.forceFull === true;
    const missingSeries = hasMissingSeries();
    const syncToday = isSyncToday();

    // If already synced today AND no new series are missing AND not forced, skip sync
    if (!forceFull && syncToday && !missingSeries) {
      logger.info('sync', 'Sync has already been performed today, skipping re-sync');
      const lastSyncDate = getMetaValue('last_sync_date');
      return res.json({
        success: true,
        message: 'Data is already up to date',
        lastSyncDate,
        skipped: true
      });
    }

    if (forceFull || missingSeries) {
      // New series or forced — full sync from 1990
      logger.info('sync', `${forceFull ? 'Forced' : 'Missing series'} full re-sync from 1990...`);
      const result = await syncFredData(HISTORY_START_DATE);
      const lastSyncDate = getMetaValue('last_sync_date');
      res.json({ ...result, lastSyncDate, skipped: false });
    } else {
      const lastMonthly = getLastFredMonthlyDate();

      if (!lastMonthly) {
        // No data at all: full sync from 1990
        logger.info('sync', 'No FRED data found. Full sync from 1990...');
        const result = await syncFredData(HISTORY_START_DATE);
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
        res.json({ ...result, lastSyncDate, skipped: false });
      } else {
        // Monthly data exists — just do incremental daily sync
        logger.info('sync', 'Monthly data exists. Doing incremental daily sync...');
        const result = await syncIncrementalDaily();
        const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
        const lastSyncDate = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value ?? null;
        res.json({ ...result, lastSyncDate, skipped: false });
      }
    }
  } catch (error) {
    logger.error('sync', 'Sync Error:', error);
    try {
      const upsertMeta = db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)');
      upsertMeta.run('last_sync_status', 'error');
    } catch (metaErr) { logger.error('sync', 'Failed to update sync status metadata', metaErr); }
    res.status(500).json({ error: 'Failed to sync data' });
  }
});
