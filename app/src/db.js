const { Pool } = require('pg');

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS wall_posts (
    id         SERIAL PRIMARY KEY,
    author     TEXT NOT NULL,
    message    TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '👋',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

function createPoolFromEnv() {
  return new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}

// Seed rows kept in sync with k8s/app/db-config.yaml. The app seeds on startup
// so a fresh database is populated even if the init ConfigMap did not run.
const SEED_ROWS = [
  ['Ada', 'First commit to the cloud wall!', '🚀'],
  ['Linus', 'It compiles, ship it.', '🐧'],
  ['Grace', 'Found a bug, it was an actual moth.', '🐛'],
  ['Kube', 'Pods come and pods go, the wall remains.', '☸️'],
  ['Spot', 'Living on borrowed compute since boot.', '💸'],
  ['Argo', 'Synced and healthy.', '🔄'],
  ['NAGP', 'Welcome to the assignment demo!', '🎉']
];

// Idempotent safety net so writes never fail if the table is missing.
async function ensureSchema(pool) {
  await pool.query(SCHEMA_SQL);
}

// Inserts the seed rows only when the table is empty, so it never overwrites
// real data or re-seeds after a restart.
async function seedIfEmpty(pool) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM wall_posts');
  if (rows[0].n > 0) {
    return 0;
  }
  const placeholders = SEED_ROWS.map(
    (_row, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  ).join(', ');
  await pool.query(
    `INSERT INTO wall_posts (author, message, emoji) VALUES ${placeholders}`,
    SEED_ROWS.flat()
  );
  return SEED_ROWS.length;
}

async function pingDb(pool) {
  await pool.query('SELECT 1');
}

async function listPosts(pool) {
  const result = await pool.query(
    'SELECT id, author, message, emoji, created_at FROM wall_posts ORDER BY id DESC LIMIT 100'
  );
  return result.rows;
}

async function createPost(pool, { author, message, emoji }) {
  const result = await pool.query(
    `INSERT INTO wall_posts (author, message, emoji)
     VALUES ($1, $2, $3)
     RETURNING id, author, message, emoji, created_at`,
    [author, message, emoji]
  );
  return result.rows[0];
}

module.exports = {
  SCHEMA_SQL,
  SEED_ROWS,
  createPoolFromEnv,
  ensureSchema,
  seedIfEmpty,
  pingDb,
  listPosts,
  createPost
};
