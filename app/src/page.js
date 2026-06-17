const { LIMITS } = require('./validation');
const { clientMain } = require('./client-script');

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

// Escapes user-supplied text before it is rendered into HTML (stored XSS guard).
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const EMOJI_CHOICES = ['👋', '🚀', '🐧', '🐛', '☸️', '💸', '🔄', '🎉', '🔥', '✅', '🙌', '💡', '🛠️', '🧪', '⚡', '🐳', '📦'];

function formatId(id) {
  return `#${String(id).padStart(4, '0')}`;
}

function formatWhen(value) {
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

function renderPostCard(post) {
  const author = escapeHtml(post.author);
  const message = escapeHtml(post.message);
  const emoji = escapeHtml(post.emoji);
  const id = escapeHtml(formatId(post.id));
  const when = escapeHtml(formatWhen(post.created_at));

  return `
      <li class="card">
        <span class="card__emoji" aria-hidden="true">${emoji}</span>
        <p class="card__msg">${message}</p>
        <div class="card__foot">
          <span class="card__author">${author}</span>
          <span class="card__id">${id} · ${when}Z</span>
        </div>
      </li>`;
}

const STYLES = `
    :root {
      color-scheme: dark;
      --bg: #0a0e1a;
      --panel: #111726;
      --panel-2: #0d1322;
      --line: #1e2940;
      --ink: #e6ecf7;
      --muted: #8a99b8;
      --k8s: #326ce5;
      --signal: #2dd4bf;
      --warn: #f6c177;
      --danger: #ff6b6b;
      --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      --sans: "Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; color: var(--ink);
      font-family: var(--sans); font-size: 15px; line-height: 1.5;
      background:
        linear-gradient(transparent 0 31px, rgba(50,108,229,0.05) 31px 32px) 0 0 / 32px 32px,
        linear-gradient(90deg, transparent 0 31px, rgba(50,108,229,0.05) 31px 32px) 0 0 / 32px 32px,
        var(--bg);
    }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 28px 20px 64px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .brand { display: flex; align-items: baseline; gap: 12px; }
    .brand__mark { font-size: 1.6rem; }
    .brand__name { font-family: var(--mono); font-weight: 700; letter-spacing: 0.06em; font-size: 1.15rem; }
    .brand__sub { color: var(--muted); font-size: 0.82rem; }
    .cluster { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--signal); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; background: var(--panel); }

    .served { margin: 22px 0; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      font-family: var(--mono); font-size: 0.9rem;
      background: linear-gradient(180deg, rgba(45,212,191,0.08), transparent), var(--panel);
      border: 1px solid var(--line); border-left: 3px solid var(--signal); border-radius: 10px; padding: 14px 16px; }
    .served__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--signal);
      box-shadow: 0 0 0 0 rgba(45,212,191,0.7); animation: pulse 2s infinite; }
    .served__label { color: var(--muted); letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.7rem; }
    .served__pod { color: var(--ink); font-weight: 700; }
    .served__req { color: var(--muted); margin-left: auto; }
    .served__req b { color: var(--signal); font-weight: 700; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(45,212,191,0.6); } 70% { box-shadow: 0 0 0 9px rgba(45,212,191,0); } 100% { box-shadow: 0 0 0 0 rgba(45,212,191,0); } }
    @media (prefers-reduced-motion: reduce) { .served__dot { animation: none; } }

    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 18px; }
    .panel__head { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
    .form { display: grid; gap: 12px; grid-template-columns: 2fr 1fr; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field--full { grid-column: 1 / -1; }
    .field label { font-size: 0.72rem; letter-spacing: 0.06em; color: var(--muted); text-transform: uppercase; }
    .input { font-family: var(--mono); font-size: 0.9rem; color: var(--ink); background: var(--panel-2);
      border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px; }
    select.input { appearance: none; }
    textarea.input { resize: vertical; min-height: 70px; }
    .input:focus-visible { outline: 2px solid var(--k8s); outline-offset: 1px; border-color: var(--k8s); }
    .actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
    .btn { font-family: var(--mono); font-weight: 700; font-size: 0.85rem; letter-spacing: 0.04em; cursor: pointer;
      color: #06121f; background: var(--signal); border: 0; border-radius: 8px; padding: 11px 20px; }
    .btn:hover { filter: brightness(1.08); }
    .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .btn--load { background: var(--warn); }

    .opsgrid { display: grid; gap: 10px; }
    .opsline { font-family: var(--mono); font-size: 0.82rem; }
    .opsline b { color: var(--muted); font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.68rem; display: block; margin-bottom: 2px; }
    .rec { border-left: 3px solid var(--k8s); padding: 8px 12px; background: var(--panel-2); border-radius: 6px; }
    .opstools { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .opsnote { color: var(--warn); font-family: var(--mono); font-size: 0.8rem; }

    table.grid-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 0.82rem; }
    table.grid-table th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.68rem;
      letter-spacing: 0.08em; text-transform: uppercase; border-bottom: 1px solid var(--line); padding: 8px 10px; }
    table.grid-table td { border-bottom: 1px solid var(--line); padding: 8px 10px; vertical-align: middle; }
    table.grid-table td.mono { font-family: var(--mono); font-size: 0.78rem; }
    td.ok { color: var(--signal); } td.warn { color: var(--warn); }
    button.kill { font-family: var(--mono); font-size: 0.72rem; cursor: pointer; color: var(--danger);
      background: transparent; border: 1px solid var(--danger); border-radius: 6px; padding: 4px 10px; }
    button.kill:hover { background: rgba(255,107,107,0.12); }
    button.kill:disabled { opacity: 0.5; cursor: default; }

    .section { margin: 30px 0 16px; display: flex; align-items: center; gap: 12px; font-family: var(--mono);
      font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
    .section::after { content: ""; flex: 1; height: 1px; background: var(--line); }
    .section b { color: var(--k8s); }
    .grid { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px;
      display: flex; flex-direction: column; gap: 10px; transition: transform 0.12s ease, border-color 0.12s ease; }
    .card:hover { transform: translateY(-3px); border-color: #2c3d63; }
    .card__emoji { font-size: 1.7rem; line-height: 1; }
    .card__msg { margin: 0; word-break: break-word; }
    .card__foot { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: auto;
      border-top: 1px solid var(--line); padding-top: 10px; }
    .card__author { font-weight: 600; }
    .card__id { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
    .empty { grid-column: 1 / -1; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 12px; padding: 40px 20px; }

    details.records { margin-top: 18px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 0 18px; }
    details.records summary { cursor: pointer; padding: 16px 0; font-family: var(--mono); font-size: 0.72rem;
      letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
    .records__scroll { overflow-x: auto; padding-bottom: 16px; }

    .foot { margin-top: 24px; color: var(--muted); font-family: var(--mono); font-size: 0.74rem; letter-spacing: 0.04em; }
    .demo-warn { color: var(--danger); }
    @media (max-width: 620px) { .form { grid-template-columns: 1fr; } .served__req { margin-left: 0; } }`;

function renderEmojiOptions() {
  return EMOJI_CHOICES.map((e, i) => `<option value="${escapeHtml(e)}"${i === 0 ? ' selected' : ''}>${escapeHtml(e)}</option>`).join('');
}

function renderPage({ posts, servedBy }) {
  const pod = escapeHtml(servedBy);
  const count = posts.length;
  const cards = count
    ? posts.map(renderPostCard).join('')
    : '<li class="empty">No posts yet. Be the first to write a row to PostgreSQL.</li>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NAGP Cloud Wall</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>${STYLES}
  </style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">☸</span>
        <div>
          <div class="brand__name">NAGP&nbsp;CLOUD&nbsp;WALL</div>
          <div class="brand__sub">multi-tier Kubernetes demo · reads and writes to PostgreSQL · live cluster controls</div>
        </div>
      </div>
      <div class="cluster">● cluster ready</div>
    </header>

    <section class="served" aria-label="Pod that served this request">
      <span class="served__dot" aria-hidden="true"></span>
      <span class="served__label">served by</span>
      <span class="served__pod" id="servedPod">${pod}</span>
      <span class="served__req">GET / · <b>200</b></span>
    </section>

    <form class="panel" method="POST" action="/api/posts">
      <div class="panel__head">$ post to wall</div>
      <div class="form">
        <div class="field">
          <label for="author">Name</label>
          <input class="input" id="author" name="author" placeholder="ada" maxlength="${LIMITS.AUTHOR_MAX}" required />
        </div>
        <div class="field">
          <label for="emoji">Emoji</label>
          <select class="input" id="emoji" name="emoji">${renderEmojiOptions()}</select>
        </div>
        <div class="field field--full">
          <label for="message">Message</label>
          <textarea class="input" id="message" name="message" placeholder="Leave a message. It lands straight in the database." maxlength="${LIMITS.MESSAGE_MAX}" required></textarea>
        </div>
        <div class="actions">
          <button class="btn" type="submit">POST ▸</button>
        </div>
      </div>
    </form>

    <div class="section">wall <b>${count} ${count === 1 ? 'post' : 'posts'}</b></div>
    <ul class="grid">${cards}</ul>

    <details class="records" id="recordsDetails">
      <summary>▸ raw postgres table: wall_posts</summary>
      <div class="records__scroll">
        <table class="grid-table">
          <thead id="recHead"></thead>
          <tbody id="recBody"><tr><td class="mono">open to load rows...</td></tr></tbody>
        </table>
      </div>
    </details>

    <section class="panel" aria-label="Live cluster control" style="margin-top:30px">
      <div class="panel__head">kubernetes operations · live</div>
      <div class="opsgrid">
        <div class="opsline"><b>nodes</b><span id="nodeStat">loading...</span></div>
        <div class="opsline"><b>records-api HPA</b><span id="hpaStat">loading...</span></div>
        <div class="opsline rec"><b>resource optimization (observed)</b><span id="recStat">collecting metrics...</span></div>
      </div>
      <div class="opsnote" id="opsNote"></div>
      <table class="grid-table">
        <thead><tr><th>pod</th><th>node</th><th>status</th><th>cpu</th><th>mem</th><th>restarts</th><th>age</th><th></th></tr></thead>
        <tbody id="podRows"><tr><td colspan="8" class="mono">loading pods...</td></tr></tbody>
      </table>
      <div class="opstools">
        <button class="btn btn--load" id="loadBtn" type="button">Generate load (drive HPA + autoscaler)</button>
        <span class="opsline" style="color:var(--muted)">Kill a pod above to watch self-healing. Generate load to watch the HPA scale out and the autoscaler add a node.</span>
      </div>
    </section>

    <footer class="foot">
      <span class="demo-warn">demo mode:</span> cluster controls are open and the endpoint is public. Tear the cluster down after recording.
    </footer>
  </div>
  <script>(${clientMain.toString()})();</script>
</body>
</html>`;
}

module.exports = { escapeHtml, renderPage, EMOJI_CHOICES };
