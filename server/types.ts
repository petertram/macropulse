// Shared TypeScript interfaces for MacroPulse server

/** Row returned from the fred_latest table */
export interface FredLatestRow {
  id: string;
  value: number;
  date: string;
}

/** Row returned from the fred_history table */
export interface FredHistoryRow {
  month_key: string;
  data: string;
}

/** Row returned from the fred_daily table */
export interface FredDailyRow {
  date_key: string;
  data: string;
}

/** Row returned from the sync_metadata table */
export interface SyncMetadataRow {
  key: string;
  value: string;
}

/** A single observation from the FRED API */
export interface FredObservation {
  date: string;
  value: string;
  realtime_start?: string;
  realtime_end?: string;
}

/** Response shape from the FRED observations API */
export interface FredApiResponse {
  observations: FredObservation[];
}

/** Result of fetching a single FRED series */
export interface FredSeriesResult {
  id: string;
  observations: FredObservation[];
}

/** Processed result used for upsert into fred_latest */
export interface LatestResult {
  id: string;
  value: string | null;
  date: string | null;
}

/** SQLite COUNT(*) query result shape */
export interface CountRow {
  count: number;
}

/** SQLite query result for a single metadata value */
export interface MetadataValueRow {
  value: string;
}

/** A key-value data point in history/daily tables after JSON.parse */
export interface DataPoint {
  date: string;
  [key: string]: number | string | null;
}

/** A ticker-to-key mapping for Yahoo Finance */
export interface YahooTicker {
  ticker: string;
  key: string;
}

/** A Yahoo Finance historical observation */
export interface YahooHistoricalObs {
  date: Date;
  close: number;
  [key: string]: unknown;
}
