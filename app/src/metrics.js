// Parses Kubernetes CPU quantities into millicores.
// Handles nanocores (n), microcores (u), millicores (m) and whole cores.
function parseCpuToMillicores(value) {
  if (!value) {
    return 0;
  }
  const text = String(value);
  const num = parseFloat(text);
  if (Number.isNaN(num)) {
    return 0;
  }
  if (text.endsWith('n')) {
    return Math.round(num / 1e6);
  }
  if (text.endsWith('u')) {
    return Math.round(num / 1e3);
  }
  if (text.endsWith('m')) {
    return Math.round(num);
  }
  return Math.round(num * 1000);
}

const MEM_UNITS = {
  Ki: 1 / 1024,
  Mi: 1,
  Gi: 1024,
  Ti: 1024 * 1024
};

// Parses Kubernetes memory quantities into mebibytes (Mi).
function parseMemoryToMib(value) {
  if (!value) {
    return 0;
  }
  const text = String(value);
  const num = parseFloat(text);
  if (Number.isNaN(num)) {
    return 0;
  }
  const unit = text.replace(/[0-9.\-+]/g, '');
  if (unit && MEM_UNITS[unit]) {
    return Math.round(num * MEM_UNITS[unit]);
  }
  // No unit means bytes.
  return Math.round(num / (1024 * 1024));
}

function ageSeconds(startTime, now = Date.now()) {
  if (!startTime) {
    return 0;
  }
  return Math.max(0, Math.round((now - new Date(startTime).getTime()) / 1000));
}

// Merges pod spec/status with the metrics-server usage into flat rows for the UI.
function mergePods(podList, metricsList, now = Date.now()) {
  const usageByPod = new Map();
  for (const item of metricsList?.items || []) {
    const total = (item.containers || []).reduce(
      (acc, c) => {
        acc.cpu += parseCpuToMillicores(c.usage?.cpu);
        acc.mem += parseMemoryToMib(c.usage?.memory);
        return acc;
      },
      { cpu: 0, mem: 0 }
    );
    usageByPod.set(item.metadata?.name, total);
  }

  return (podList?.items || []).map((pod) => {
    const container = pod.spec?.containers?.[0];
    const requests = container?.resources?.requests || {};
    const usage = usageByPod.get(pod.metadata?.name) || { cpu: null, mem: null };
    const restarts = (pod.status?.containerStatuses || []).reduce(
      (sum, cs) => sum + (cs.restartCount || 0),
      0
    );
    return {
      name: pod.metadata?.name,
      phase: pod.status?.phase || 'Unknown',
      ready: (pod.status?.containerStatuses || []).every((cs) => cs.ready),
      node: pod.spec?.nodeName || '(unscheduled)',
      restarts,
      ageSeconds: ageSeconds(pod.status?.startTime, now),
      cpuMilli: usage.cpu,
      memMib: usage.mem,
      reqCpuMilli: parseCpuToMillicores(requests.cpu),
      reqMemMib: parseMemoryToMib(requests.memory)
    };
  });
}

// Turns observed usage versus requests into a plain-language FinOps recommendation.
function buildRecommendation(rows) {
  const measured = rows.filter((r) => typeof r.cpuMilli === 'number');
  if (measured.length === 0) {
    return { ready: false, note: 'Waiting for metrics-server samples.' };
  }
  const avgCpu = Math.round(measured.reduce((s, r) => s + r.cpuMilli, 0) / measured.length);
  const avgMem = Math.round(measured.reduce((s, r) => s + r.memMib, 0) / measured.length);
  const reqCpu = measured[0].reqCpuMilli || 0;
  const reqMem = measured[0].reqMemMib || 0;

  const cpuUsePct = reqCpu ? Math.round((avgCpu / reqCpu) * 100) : 0;
  const memUsePct = reqMem ? Math.round((avgMem / reqMem) * 100) : 0;

  let note;
  if (cpuUsePct < 40 && memUsePct < 60) {
    note =
      `Idle CPU is ${avgCpu}m vs the ${reqCpu}m request (${cpuUsePct}%). ` +
      `Memory is ${avgMem}Mi vs ${reqMem}Mi (${memUsePct}%). ` +
      `The HPA absorbs spikes, so the request is a safe floor; trimming it raises pod density per node.`;
  } else if (cpuUsePct > 85) {
    note = `CPU is ${avgCpu}m vs the ${reqCpu}m request (${cpuUsePct}%). Under sustained load, raise the limit before the request.`;
  } else {
    note = `CPU ${avgCpu}m / ${reqCpu}m (${cpuUsePct}%), memory ${avgMem}Mi / ${reqMem}Mi (${memUsePct}%). Requests look right-sized for this workload.`;
  }

  return { ready: true, avgCpu, avgMem, reqCpu, reqMem, cpuUsePct, memUsePct, note };
}

module.exports = {
  parseCpuToMillicores,
  parseMemoryToMib,
  mergePods,
  buildRecommendation
};
