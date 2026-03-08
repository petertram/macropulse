import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const db = new Database(path.join(__dirname, '..', 'market_data.db'));

export function initSchema(): void {
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
}
