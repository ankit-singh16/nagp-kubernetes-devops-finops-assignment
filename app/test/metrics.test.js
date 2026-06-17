const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseCpuToMillicores,
  parseMemoryToMib,
  mergePods,
  buildRecommendation
} = require('../src/metrics');

test('parses CPU quantities into millicores', () => {
  assert.equal(parseCpuToMillicores('250m'), 250);
  assert.equal(parseCpuToMillicores('1'), 1000);
  assert.equal(parseCpuToMillicores('12345678n'), 12);
  assert.equal(parseCpuToMillicores('5000u'), 5);
  assert.equal(parseCpuToMillicores(undefined), 0);
});

test('parses memory quantities into mebibytes', () => {
  assert.equal(parseMemoryToMib('128Mi'), 128);
  assert.equal(parseMemoryToMib('1Gi'), 1024);
  assert.equal(parseMemoryToMib('71680Ki'), 70);
  assert.equal(parseMemoryToMib('104857600'), 100); // bytes
  assert.equal(parseMemoryToMib(undefined), 0);
});

test('merges pod status with metrics into rows', () => {
  const pods = {
    items: [
      {
        metadata: { name: 'records-api-a' },
        spec: { nodeName: 'node-1', containers: [{ resources: { requests: { cpu: '100m', memory: '128Mi' } } }] },
        status: { phase: 'Running', startTime: '2026-06-17T00:00:00Z', containerStatuses: [{ ready: true, restartCount: 2 }] }
      }
    ]
  };
  const metrics = {
    items: [{ metadata: { name: 'records-api-a' }, containers: [{ usage: { cpu: '15m', memory: '71680Ki' } }] }]
  };

  const rows = mergePods(pods, metrics, new Date('2026-06-17T00:01:00Z').getTime());

  assert.equal(rows.length, 1);
  assert.deepEqual(
    { cpu: rows[0].cpuMilli, mem: rows[0].memMib, node: rows[0].node, restarts: rows[0].restarts, age: rows[0].ageSeconds },
    { cpu: 15, mem: 70, node: 'node-1', restarts: 2, age: 60 }
  );
});

test('recommendation flags idle CPU as a trim opportunity', () => {
  const rows = [{ cpuMilli: 12, memMib: 60, reqCpuMilli: 100, reqMemMib: 128 }];
  const rec = buildRecommendation(rows);
  assert.equal(rec.ready, true);
  assert.equal(rec.cpuUsePct, 12);
  assert.match(rec.note, /density/);
});

test('recommendation waits when no metrics yet', () => {
  const rec = buildRecommendation([{ cpuMilli: null, memMib: null, reqCpuMilli: 100 }]);
  assert.equal(rec.ready, false);
});
