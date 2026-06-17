const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { createApp } = require('../src/app');

const HOSTNAME = 'records-api-test-pod';

function fakePool(handlers = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO wall_posts/.test(sql)) {
        return handlers.insert ? handlers.insert(params) : { rows: [] };
      }
      if (/FROM wall_posts/.test(sql)) {
        return { rows: handlers.posts || [] };
      }
      if (/CREATE TABLE/.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT 1/.test(sql)) {
        return handlers.ping ? handlers.ping() : { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    }
  };
}

async function request(app, path, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: options.method || 'GET',
      redirect: 'manual',
      headers: options.headers,
      body: options.body
    });
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/posts returns posts and the serving pod name', async () => {
  const posts = [{ id: 2, author: 'Ada', message: 'hi', emoji: '🚀', created_at: '2026-06-12T00:00:00.000Z' }];
  const app = createApp(fakePool({ posts }), { hostname: HOSTNAME });

  const result = await request(app, '/api/posts');

  assert.equal(result.status, 200);
  const body = JSON.parse(result.text);
  assert.deepEqual(body.posts, posts);
  assert.equal(body.servedBy, HOSTNAME);
});

test('GET / renders HTML and escapes stored content (XSS guard)', async () => {
  const posts = [{ id: 1, author: '<script>x</script>', message: 'a & b', emoji: '💥', created_at: '2026-06-12T00:00:00.000Z' }];
  const app = createApp(fakePool({ posts }), { hostname: HOSTNAME });

  const result = await request(app, '/');

  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /html/);
  assert.ok(result.text.includes(HOSTNAME), 'page shows serving pod');
  assert.ok(!result.text.includes('<script>x</script>'), 'raw script tag must not be present');
  assert.ok(result.text.includes('&lt;script&gt;'), 'author is HTML-escaped');
});

test('POST /api/posts (JSON) validates and inserts a post', async () => {
  const created = { id: 9, author: 'Kube', message: 'pods come and go', emoji: '☸️', created_at: '2026-06-12T00:00:00.000Z' };
  const pool = fakePool({ insert: () => ({ rows: [created] }) });
  const app = createApp(pool, { hostname: HOSTNAME });

  const result = await request(app, '/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'Kube', message: 'pods come and go', emoji: '☸️' })
  });

  assert.equal(result.status, 201);
  const body = JSON.parse(result.text);
  assert.deepEqual(body.post, created);
  const insert = pool.calls.find((c) => /INSERT INTO wall_posts/.test(c.sql));
  assert.deepEqual(insert.params, ['Kube', 'pods come and go', '☸️']);
});

test('POST /api/posts (JSON) rejects missing message with 400', async () => {
  const app = createApp(fakePool(), { hostname: HOSTNAME });

  const result = await request(app, '/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'Kube' })
  });

  assert.equal(result.status, 400);
  assert.match(JSON.parse(result.text).error, /message is required/);
});

test('POST /api/posts (HTML form) redirects back to the wall', async () => {
  const created = { id: 3, author: 'Spot', message: 'still alive', emoji: '👋', created_at: '2026-06-12T00:00:00.000Z' };
  const app = createApp(fakePool({ insert: () => ({ rows: [created] }) }), { hostname: HOSTNAME });

  const result = await request(app, '/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'author=Spot&message=still+alive'
  });

  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
});

test('GET /readyz reports readiness after a successful database ping', async () => {
  const app = createApp(fakePool(), { hostname: HOSTNAME });

  const result = await request(app, '/readyz');

  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.text).status, 'ready');
});

test('database errors return a 500 response', async () => {
  const pool = {
    async query() {
      throw new Error('connection failed');
    }
  };
  const app = createApp(pool, { hostname: HOSTNAME });

  const result = await request(app, '/api/posts');

  assert.equal(result.status, 500);
  assert.deepEqual(JSON.parse(result.text), { error: 'request failed' });
});

function fakeK8s(overrides = {}) {
  const deleted = [];
  return {
    deleted,
    inCluster: overrides.inCluster !== false,
    listPods: async () => overrides.pods || { items: [] },
    listPodMetrics: async () => overrides.metrics || { items: [] },
    getHpa: async () => overrides.hpa || { spec: { minReplicas: 2, maxReplicas: 5, metrics: [{ resource: { target: { averageUtilization: 60 } } }] }, status: { currentReplicas: 2, desiredReplicas: 2 } },
    listNodes: async () => overrides.nodes || { items: [{ metadata: { labels: { 'node.kubernetes.io/instance-type': 't3.small', 'eks.amazonaws.com/capacityType': 'SPOT' } } }] },
    deletePod: async (name) => { deleted.push(name); return {}; }
  };
}

test('GET /api/ops aggregates pods, hpa and nodes', async () => {
  const pods = { items: [{ metadata: { name: 'records-api-a' }, spec: { nodeName: 'n1', containers: [{ resources: { requests: { cpu: '100m', memory: '128Mi' } } }] }, status: { phase: 'Running', startTime: '2026-06-17T00:00:00Z', containerStatuses: [{ ready: true, restartCount: 0 }] } }] };
  const metrics = { items: [{ metadata: { name: 'records-api-a' }, containers: [{ usage: { cpu: '12m', memory: '70Mi' } }] }] };
  const app = createApp(fakePool(), { hostname: HOSTNAME, k8s: fakeK8s({ pods, metrics }) });

  const result = await request(app, '/api/ops');
  const body = JSON.parse(result.text);

  assert.equal(result.status, 200);
  assert.equal(body.inCluster, true);
  assert.equal(body.pods[0].cpuMilli, 12);
  assert.equal(body.hpa.max, 5);
  assert.equal(body.nodes.count, 1);
  assert.equal(body.recommendation.ready, true);
});

test('GET /api/ops degrades when not in cluster', async () => {
  const app = createApp(fakePool(), { hostname: HOSTNAME, k8s: fakeK8s({ inCluster: false }) });
  const body = JSON.parse((await request(app, '/api/ops')).text);
  assert.equal(body.inCluster, false);
});

test('POST kill refuses non records-api pods', async () => {
  const k8s = fakeK8s();
  const app = createApp(fakePool(), { hostname: HOSTNAME, k8s });
  const result = await request(app, '/api/ops/pods/postgres-0/delete', { method: 'POST' });
  assert.equal(result.status, 400);
  assert.equal(k8s.deleted.length, 0);
});

test('POST kill deletes a records-api pod', async () => {
  const k8s = fakeK8s();
  const app = createApp(fakePool(), { hostname: HOSTNAME, k8s });
  const result = await request(app, '/api/ops/pods/records-api-abc/delete', { method: 'POST' });
  assert.equal(result.status, 200);
  assert.deepEqual(k8s.deleted, ['records-api-abc']);
});

test('GET /api/burn returns the burned duration', async () => {
  const app = createApp(fakePool(), { hostname: HOSTNAME, k8s: fakeK8s() });
  const body = JSON.parse((await request(app, '/api/burn?ms=10')).text);
  assert.equal(body.burnedMs, 10);
});

test('GET /api/db/records returns the raw table view', async () => {
  const posts = [{ id: 1, author: 'Ada', message: 'hi', emoji: '🚀', created_at: '2026-06-12T00:00:00.000Z' }];
  const app = createApp(fakePool({ posts }), { hostname: HOSTNAME, k8s: fakeK8s() });
  const body = JSON.parse((await request(app, '/api/db/records')).text);
  assert.equal(body.table, 'wall_posts');
  assert.deepEqual(body.columns, ['id', 'author', 'message', 'emoji', 'created_at']);
  assert.equal(body.rows.length, 1);
});
