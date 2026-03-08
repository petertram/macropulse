import Database from 'better-sqlite3';
const db = new Database('market_data.db');
try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', JSON.stringify(tables, null, 2));
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
