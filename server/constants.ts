// MacroPulse server constants — extracted from hard-coded values in index.ts

/** Number of months used for the sentiment percentile lookback window */
export const SENTIMENT_LOOKBACK_MONTHS = 12;

/** Number of months used for ESI rolling Z-score statistics */
export const ESI_LOOKBACK_MONTHS = 6;

/** Earliest date for full historical FRED sync */
export const HISTORY_START_DATE = '1990-01-01';

/** Minimum number of observations required before computing a percentile rank */
export const MIN_PERCENTILE_OBSERVATIONS = 3;

/** Divergence threshold (points) between institutional and consumer sub-indices */
export const SENTIMENT_DIVERGENCE_THRESHOLD = 20;

/** Composite sentiment regime breakpoints (0–100 scale) */
export const SENTIMENT_THRESHOLDS = {
  EXTREME_FEAR: 20,
  FEAR: 35,
  GREED: 65,
  EXTREME_GREED: 80,
} as const;

/** Momentum thresholds for sentiment direction labelling */
export const SENTIMENT_MOMENTUM_THRESHOLD = 5;

/** Correlation computation windows in trading days */
export const CORRELATION_WINDOWS = {
  SHORT: 60,   // ~3 months
  MEDIUM: 126, // ~6 months
  LONG: 252,   // ~1 year
} as const;

/** Stock-bond correlation thresholds for regime classification */
export const REGIME_THRESHOLDS = {
  NEGATIVE: -0.2,
  POSITIVE: 0.2,
} as const;

/** Minimum paired observations required to compute Pearson correlation */
export const MIN_CORRELATION_OBSERVATIONS = 5;

/** ESI momentum thresholds (standard deviations) */
export const ESI_MOMENTUM_THRESHOLD = 0.3;

/** Number of days to look back when deciding if daily data is "current" */
export const DATA_CURRENCY_LOOKBACK_DAYS = 3;

/** Rate limiter window in milliseconds */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum API requests per window per IP */
export const RATE_LIMIT_MAX_REQUESTS = 100;

/** HTTP server port */
export const SERVER_PORT = 3001;
