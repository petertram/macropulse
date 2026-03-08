import { db } from './client.js';
import { logger } from '../logger.js';
import { todayStr, isDateCurrent } from '../utils.js';
import type { FredHistoryRow, FredDailyRow, FredLatestRow, CountRow, MetadataValueRow } from '../types.js';
import { FRED_SERIES_IDS } from '../services/fredConfig.js';

export function getLastFredMonthlyDate(): string | null {
  const rows = db.prepare('SELECT month_key, data FROM fred_history ORDER BY month_key DESC').all() as FredHistoryRow[];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const hasFredData = FRED_SERIES_IDS.some(id => data[id] !== undefined && data[id] !== null);
    if (hasFredData) return row.month_key;
  }
  return null;
}

export function getLastFredDailyDate(): string | null {
  const rows = db.prepare('SELECT date_key, data FROM fred_daily ORDER BY date_key DESC').all() as FredDailyRow[];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const hasFredData = FRED_SERIES_IDS.some(id => data[id] !== undefined && data[id] !== null);
    if (hasFredData) return row.date_key;
  }
  return null;
}

export function isDataCurrent(): boolean {
  const lastDailyDate = getLastFredDailyDate();
  if (!lastDailyDate) return false;
  return isDateCurrent(lastDailyDate);
}

export function isSyncToday(): boolean {
  try {
    const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
    const lastSyncDateStr = (getMeta.get('last_sync_date') as MetadataValueRow | undefined)?.value;
    if (!lastSyncDateStr) return false;
    return lastSyncDateStr.split('T')[0] === todayStr();
  } catch {
    return false;
  }
}

export function hasMissingSeries(): boolean {
  const existingIds = (db.prepare('SELECT id FROM fred_latest').all() as FredLatestRow[]).map(r => r.id);
  return FRED_SERIES_IDS.some(id => !existingIds.includes(id));
}

export function getCountOf(table: string): number {
  return (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as CountRow).count;
}

export function getMetaValue(key: string): string | null {
  const getMeta = db.prepare('SELECT value FROM sync_metadata WHERE key = ?');
  return (getMeta.get(key) as MetadataValueRow | undefined)?.value ?? null;
}
