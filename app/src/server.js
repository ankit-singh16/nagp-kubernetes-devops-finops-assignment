const { createApp } = require('./app');
const { createPoolFromEnv, ensureSchema, seedIfEmpty } = require('./db');

const SCHEMA_RETRY_ATTEMPTS = 10;
const SCHEMA_RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ensures the table exists without blocking startup or crash-looping the pod
// while PostgreSQL is still coming up. Liveness stays green; readiness flips
// once the DB is reachable.
async function ensureSchemaWithRetry(pool) {
  for (let attempt = 1; attempt <= SCHEMA_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await ensureSchema(pool);
      const seeded = await seedIfEmpty(pool);
      console.log(`wall_posts schema ensured${seeded ? `, seeded ${seeded} rows` : ''}`);
      return;
    } catch (error) {
      console.warn(`schema not ready (attempt ${attempt}/${SCHEMA_RETRY_ATTEMPTS}): ${error.message}`);
      await sleep(SCHEMA_RETRY_DELAY_MS);
    }
  }
  console.error('giving up on schema bootstrap; readiness will gate traffic');
}

async function main() {
  const pool = createPoolFromEnv();
  const app = createApp(pool);
  const port = Number(process.env.PORT || 3000);

  ensureSchemaWithRetry(pool);

  const server = app.listen(port, () => {
    console.log(`cloud wall listening on ${port}`);
  });

  function shutdown() {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { ensureSchemaWithRetry };
