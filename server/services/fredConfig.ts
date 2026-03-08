// FRED API configuration: key + series IDs

export const FRED_API_KEY = process.env.FRED_API_KEY;
if (!FRED_API_KEY) {
  throw new Error('FRED_API_KEY environment variable is required. Set it in your .env file.');
}

export const FRED_SERIES_IDS = [
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
