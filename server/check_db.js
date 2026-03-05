import Database from 'better-sqlite3';

const db = new Database('./market_data.db', { readonly: true });

console.log("=== LATEST ===");
const latest = db.prepare('SELECT id, date FROM fred_latest').all();
console.log(latest);

console.log("\n=== HISTORY COUNT ===");
console.log(db.prepare('SELECT COUNT(*) as c FROM fred_history').get());

console.log("\n=== DAILY COUNT ===");
console.log(db.prepare('SELECT COUNT(*) as c FROM fred_daily').get());

// Check specific dates for M2SL and WALCL
console.log("\n=== CHECKING MONTHLY (JAN 2024) ===");
const m1 = db.prepare("SELECT data FROM fred_history WHERE month_key = '2024-01'").get();
if (m1) console.log(JSON.parse(m1.data));

console.log("\n=== METADATA ===");
console.log(db.prepare('SELECT * FROM sync_metadata').all());
