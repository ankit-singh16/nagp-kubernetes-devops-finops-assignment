const os = require('os');
const express = require('express');

const { ensureSchema, pingDb, listPosts, createPost } = require('./db');
const { validatePost } = require('./validation');
const { renderPage } = require('./page');
const { createK8sClient } = require('./k8s');
const { mergePods, buildRecommendation } = require('./metrics');

const BURN_MAX_MS = 1500;
const MANAGED_POD_PREFIX = 'records-api-';

function summarizeHpa(hpa) {
  if (!hpa || !hpa.spec) {
    return null;
  }
  const current = hpa.status?.currentMetrics?.[0]?.resource?.current?.averageUtilization;
  const target = hpa.spec.metrics?.[0]?.resource?.target?.averageUtilization;
  return {
    min: hpa.spec.minReplicas,
    max: hpa.spec.maxReplicas,
    current: hpa.status?.currentReplicas ?? null,
    desired: hpa.status?.desiredReplicas ?? null,
    targetCpuPct: target ?? null,
    currentCpuPct: current ?? null
  };
}

function summarizeNodes(nodeList) {
  const items = nodeList?.items || [];
  const types = {};
  for (const node of items) {
    const labels = node.metadata?.labels || {};
    const type = labels['node.kubernetes.io/instance-type'] || labels['beta.kubernetes.io/instance-type'] || 'unknown';
    const capacity = labels['eks.amazonaws.com/capacityType'] || '';
    const key = capacity ? `${type} (${capacity.toLowerCase()})` : type;
    types[key] = (types[key] || 0) + 1;
  }
  return { count: items.length, types };
}

// Gathers the live cluster view for the dashboard. Each call is tolerant: a
// failing metrics or HPA read degrades to null instead of failing the whole panel.
async function buildOps(k8s) {
  if (!k8s.inCluster) {
    return { inCluster: false, note: 'Cluster controls are available only when running inside the cluster.' };
  }
  const [pods, metrics, hpa, nodes] = await Promise.allSettled([
    k8s.listPods(),
    k8s.listPodMetrics(),
    k8s.getHpa(),
    k8s.listNodes()
  ]);

  const podList = pods.status === 'fulfilled' ? pods.value : { items: [] };
  const metricList = metrics.status === 'fulfilled' ? metrics.value : { items: [] };
  const rows = mergePods(podList, metricList);

  return {
    inCluster: true,
    pods: rows,
    hpa: hpa.status === 'fulfilled' ? summarizeHpa(hpa.value) : null,
    nodes: nodes.status === 'fulfilled' ? summarizeNodes(nodes.value) : null,
    recommendation: buildRecommendation(rows)
  };
}

function createApp(pool, options = {}) {
  const servedBy = options.hostname || os.hostname();
  const k8s = options.k8s || createK8sClient();
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', servedBy });
  });

  app.get('/readyz', async (_req, res, next) => {
    try {
      await pingDb(pool);
      res.status(200).json({ status: 'ready', servedBy });
    } catch (error) {
      next(error);
    }
  });

  // Fun HTML wall.
  app.get('/', async (_req, res, next) => {
    try {
      const posts = await listPosts(pool);
      res.status(200).type('html').send(renderPage({ posts, servedBy }));
    } catch (error) {
      next(error);
    }
  });

  // JSON read API.
  app.get('/api/posts', async (_req, res, next) => {
    try {
      const posts = await listPosts(pool);
      res.status(200).json({ posts, servedBy });
    } catch (error) {
      next(error);
    }
  });

  // Write API. Accepts JSON (API clients) or form-encoded posts (HTML wall).
  app.post('/api/posts', async (req, res, next) => {
    const { value, error } = validatePost(req.body);
    if (error) {
      if (req.is('application/json')) {
        return res.status(400).json({ error });
      }
      return res.status(400).type('html').send(`<p>${error}</p><p><a href="/">Back to the wall</a></p>`);
    }

    try {
      await ensureSchema(pool);
      const post = await createPost(pool, value);
      if (req.is('application/json')) {
        return res.status(201).json({ post, servedBy });
      }
      return res.redirect(303, '/');
    } catch (dbError) {
      return next(dbError);
    }
  });

  // Raw database view for the collapsible table panel.
  app.get('/api/db/records', async (_req, res, next) => {
    try {
      const rows = await listPosts(pool);
      res.status(200).json({
        table: 'wall_posts',
        columns: ['id', 'author', 'message', 'emoji', 'created_at'],
        rows,
        servedBy
      });
    } catch (error) {
      next(error);
    }
  });

  // Live cluster snapshot: pods, metrics, HPA, nodes, FinOps recommendation.
  app.get('/api/ops', async (_req, res, next) => {
    try {
      const ops = await buildOps(k8s);
      res.status(200).json({ ...ops, servedBy });
    } catch (error) {
      next(error);
    }
  });

  // Delete a records-api pod to demonstrate self-healing. Restricted to the
  // app's own pods so postgres cannot be deleted by accident.
  app.post('/api/ops/pods/:name/delete', async (req, res, next) => {
    const { name } = req.params;
    if (!name.startsWith(MANAGED_POD_PREFIX)) {
      return res.status(400).json({ error: 'only records-api pods can be deleted here' });
    }
    try {
      await k8s.deletePod(name);
      return res.status(200).json({ deleted: name, servedBy });
    } catch (error) {
      return next(error);
    }
  });

  // CPU load target. The dashboard fires bursts of these so the HPA reacts.
  app.get('/api/burn', (req, res) => {
    const requested = Number(req.query.ms) || 200;
    const ms = Math.max(1, Math.min(requested, BURN_MAX_MS));
    const deadline = Date.now() + ms;
    let work = 0;
    while (Date.now() < deadline) {
      work += Math.sqrt(work + 1);
    }
    res.status(200).json({ burnedMs: ms, servedBy, work: Math.round(work) });
  });

  app.use((error, _req, res, _next) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(error);
    }
    res.status(500).json({ error: 'request failed' });
  });

  return app;
}

module.exports = { createApp, buildOps, summarizeHpa, summarizeNodes };
