const fs = require('fs');
const https = require('https');

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
const NAMESPACE = process.env.POD_NAMESPACE || 'nagp-app';
const APP_LABEL = 'app.kubernetes.io/name=records-api';

function isInCluster() {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST) && fs.existsSync(`${SA_DIR}/token`);
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const contentType =
      method === 'PATCH' ? 'application/merge-patch+json' : 'application/json';

    const req = https.request(
      {
        host: process.env.KUBERNETES_SERVICE_HOST,
        port: process.env.KUBERNETES_SERVICE_PORT || 443,
        method,
        path,
        ca: fs.readFileSync(`${SA_DIR}/ca.crt`),
        headers: {
          Authorization: `Bearer ${fs.readFileSync(`${SA_DIR}/token`, 'utf8')}`,
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) }
            : {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(raw ? JSON.parse(raw) : {});
          } else {
            reject(new Error(`k8s ${method} ${path} returned ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

const enc = encodeURIComponent;

function createK8sClient() {
  return {
    inCluster: isInCluster(),
    namespace: NAMESPACE,

    listPods() {
      return apiRequest('GET', `/api/v1/namespaces/${NAMESPACE}/pods?labelSelector=${enc(APP_LABEL)}`);
    },

    listPodMetrics() {
      return apiRequest(
        'GET',
        `/apis/metrics.k8s.io/v1beta1/namespaces/${NAMESPACE}/pods?labelSelector=${enc(APP_LABEL)}`
      );
    },

    getHpa() {
      return apiRequest(
        'GET',
        `/apis/autoscaling/v2/namespaces/${NAMESPACE}/horizontalpodautoscalers/records-api`
      );
    },

    listNodes() {
      return apiRequest('GET', '/api/v1/nodes');
    },

    deletePod(name) {
      return apiRequest('DELETE', `/api/v1/namespaces/${NAMESPACE}/pods/${enc(name)}`);
    }
  };
}

module.exports = { createK8sClient, isInCluster, NAMESPACE };
