const assert = require('node:assert/strict');
const test = require('node:test');
const { seedIfEmpty, SEED_ROWS } = require('../src/db');

function fakePool(count) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/COUNT/.test(sql)) {
        return { rows: [{ n: count }] };
      }
      return { rows: [] };
    }
  };
}

test('seeds the configured rows when the table is empty', async () => {
  const pool = fakePool(0);
  const inserted = await seedIfEmpty(pool);

  assert.equal(inserted, SEED_ROWS.length);
  const insert = pool.calls.find((c) => /INSERT INTO wall_posts/.test(c.sql));
  assert.ok(insert, 'insert was issued');
  assert.equal(insert.params.length, SEED_ROWS.length * 3);
});

test('does not seed when rows already exist', async () => {
  const pool = fakePool(7);
  const inserted = await seedIfEmpty(pool);

  assert.equal(inserted, 0);
  assert.ok(!pool.calls.some((c) => /INSERT/.test(c.sql)), 'no insert issued');
});
