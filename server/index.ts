// MacroPulse Backend Server v3 — Entry Point
import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from './logger.js';
import { SERVER_PORT, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } from './constants.js';
import { initSchema } from './db/client.js';
import { autoSeed } from './services/fredSync.js';
import { fredRouter } from './routes/fred.js';
import { sentimentRouter } from './routes/sentiment.js';
import { modelsRouter } from './routes/models.js';
import { sectorsRouter } from './routes/sectors.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required env vars (fredConfig.ts will also throw if FRED_API_KEY is missing)
if (!process.env.FRED_API_KEY) {
  throw new Error('FRED_API_KEY environment variable is required. Set it in your .env file.');
}

const app = express();
const PORT = SERVER_PORT;

// Initialize DB schema
initSchema();

app.use(express.json());

// Rate limiter: max RATE_LIMIT_MAX_REQUESTS requests per minute per IP on all /api routes
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/fred', fredRouter);
app.use('/api/sentiment', sentimentRouter);
app.use('/api/models', modelsRouter);
app.use('/api/sectors', sectorsRouter);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
}

// ── Server startup ───────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info('startup', `Server running on http://localhost:${PORT}`);
  // Auto-seed runs AFTER server is listening (non-blocking)
  autoSeed();
});
