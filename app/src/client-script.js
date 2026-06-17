// Browser logic for the dashboard. Written as a self-contained function and
// serialized with toString() into the page, so it uses no backticks and no
// closure over server values. All cluster/db text is rendered via textContent.
function clientMain() {
  var POLL_MS = 3000;
  var LOAD_DURATION_MS = 60000;
  var BURST_SIZE = 20;
  var BURN_MS = 800;

  function byId(id) {
    return document.getElementById(id);
  }

  function fmtAge(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
    return Math.floor(seconds / 3600) + 'h';
  }

  function cell(text, mono) {
    var td = document.createElement('td');
    td.textContent = text;
    if (mono) td.className = 'mono';
    return td;
  }

  function renderPods(pods) {
    var tbody = byId('podRows');
    tbody.textContent = '';
    pods.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(p.name, true));
      tr.appendChild(cell(p.node, true));
      var st = cell(p.ready ? 'Ready' : p.phase);
      st.className = p.ready ? 'ok' : 'warn';
      tr.appendChild(st);
      tr.appendChild(cell(p.cpuMilli == null ? '-' : p.cpuMilli + 'm'));
      tr.appendChild(cell(p.memMib == null ? '-' : p.memMib + 'Mi'));
      tr.appendChild(cell(String(p.restarts)));
      tr.appendChild(cell(fmtAge(p.ageSeconds)));
      var actionTd = document.createElement('td');
      var btn = document.createElement('button');
      btn.className = 'kill';
      btn.textContent = 'Kill';
      btn.addEventListener('click', function () { killPod(p.name, btn); });
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }

  function setText(id, text) {
    var node = byId(id);
    if (node) node.textContent = text;
  }

  function renderOps(d) {
    if (!d.inCluster) {
      setText('opsNote', d.note || 'Cluster view unavailable.');
      return;
    }
    setText('opsNote', '');
    if (d.servedBy) setText('servedPod', d.servedBy);
    if (d.nodes) setText('nodeStat', d.nodes.count + ' node(s): ' + Object.keys(d.nodes.types).map(function (k) { return d.nodes.types[k] + ' x ' + k; }).join(', '));
    if (d.hpa) setText('hpaStat', 'replicas ' + d.hpa.current + '/' + d.hpa.desired + ' (min ' + d.hpa.min + ', max ' + d.hpa.max + ') | CPU ' + (d.hpa.currentCpuPct == null ? '-' : d.hpa.currentCpuPct + '%') + ' / target ' + d.hpa.targetCpuPct + '%');
    if (d.recommendation) setText('recStat', d.recommendation.ready ? d.recommendation.note : d.recommendation.note);
    renderPods(d.pods || []);
  }

  function poll() {
    fetch('/api/ops').then(function (r) { return r.json(); }).then(renderOps).catch(function () {});
  }

  function killPod(name, btn) {
    btn.disabled = true;
    btn.textContent = 'Killing...';
    fetch('/api/ops/pods/' + encodeURIComponent(name) + '/delete', { method: 'POST' })
      .then(function () { setTimeout(poll, 800); })
      .catch(function () { btn.disabled = false; btn.textContent = 'Kill'; });
  }

  var loading = false;
  var loadEnd = 0;

  function burstOnce() {
    var tasks = [];
    for (var i = 0; i < BURST_SIZE; i += 1) {
      tasks.push(fetch('/api/burn?ms=' + BURN_MS).catch(function () {}));
    }
    return Promise.all(tasks);
  }

  function loadLoop() {
    if (!loading) return;
    if (Date.now() > loadEnd) { stopLoad(); return; }
    var left = Math.ceil((loadEnd - Date.now()) / 1000);
    byId('loadBtn').textContent = 'Stop load (' + left + 's)';
    burstOnce().then(function () { if (loading) loadLoop(); });
  }

  function startLoad() {
    loading = true;
    loadEnd = Date.now() + LOAD_DURATION_MS;
    loadLoop();
  }

  function stopLoad() {
    loading = false;
    byId('loadBtn').textContent = 'Generate load (drive HPA + autoscaler)';
  }

  function toggleLoad() {
    if (loading) stopLoad(); else startLoad();
  }

  function renderRecords(d) {
    var head = byId('recHead');
    var body = byId('recBody');
    head.textContent = '';
    body.textContent = '';
    var htr = document.createElement('tr');
    d.columns.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c;
      htr.appendChild(th);
    });
    head.appendChild(htr);
    d.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      d.columns.forEach(function (c) {
        tr.appendChild(cell(String(row[c])));
      });
      body.appendChild(tr);
    });
  }

  function loadRecords() {
    fetch('/api/db/records').then(function (r) { return r.json(); }).then(renderRecords).catch(function () {});
  }

  byId('loadBtn').addEventListener('click', toggleLoad);
  byId('recordsDetails').addEventListener('toggle', function () {
    if (byId('recordsDetails').open) loadRecords();
  });

  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { clientMain };
