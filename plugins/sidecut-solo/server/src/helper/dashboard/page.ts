// The dashboard as one self-contained HTML page: the summary is embedded as JSON and drawn by a
// small inline script (SVG chart, tabbed ranked lists). Works offline and from a saved file.
import type { Summary } from './summary.ts';

const CSS = `
/* Zinc greys, an indigo accent, 6px cards with a small shadow, 12px semibold uppercase labels. */
:root {
  --bg: oklch(98.5% 0 0); --card: #fff; --text: oklch(21% .006 285.885);
  --muted: oklch(55.2% .016 285.938); --faint: oklch(70.5% .015 286.067);
  --line: oklch(92% .004 286.32); --grid: oklch(96.7% .001 286.375);
  --accent: oklch(51.1% .262 276.966); --hover: oklch(96.7% .001 286.375);
  --bar-a: oklch(96.2% .018 272.314); --bar-b: oklch(98% .016 73.684);
  --good: oklch(69.6% .17 162.48); --bad: oklch(57.7% .245 27.325);
  --radius: .375rem; --shadow: 0 1px 3px 0 rgba(0, 0, 0, .1), 0 1px 2px -1px rgba(0, 0, 0, .1);
  --font: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(14.1% .005 285.823); --card: oklch(21% .006 285.885);
    --text: oklch(96.7% .001 286.375); --muted: oklch(70.5% .015 286.067);
    --faint: oklch(55.2% .016 285.938); --line: oklch(27.4% .006 286.033);
    --grid: oklch(25% .006 286.033); --accent: oklch(67.3% .182 276.935);
    --hover: oklch(27.4% .006 286.033); --bar-a: oklch(51.1% .262 276.966 / .22);
    --bar-b: oklch(64.6% .222 41.116 / .16); --shadow: 0 0 0 1px oklch(27.4% .006 286.033);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 var(--font);
  -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 32px 24px 64px; }
header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; }
.mark { width: 22px; height: 22px; border-radius: 6px; background: var(--accent);
  display: grid; place-items: center; color: #fff; font-size: 13px; font-weight: 800; }
.live { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 14px; }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
.range { margin-left: auto; display: flex; gap: 4px; background: var(--card); padding: 3px;
  border-radius: var(--radius); box-shadow: var(--shadow); }
.range a, .range span { padding: 5px 11px; border-radius: 6px; color: var(--muted);
  text-decoration: none; font-size: 13.5px; font-weight: 500; }
.range a:hover { background: var(--hover); color: var(--text); }
.range .on { background: var(--accent); color: #fff; }
.card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); }
.kpis { display: grid; grid-template-columns: repeat(6, 1fr); padding: 8px; gap: 0; }
.kpi { all: unset; cursor: pointer; padding: 12px 14px; border-radius: 6px; position: relative; }
.kpi + .kpi::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px;
  width: 1px; background: var(--line); }
.kpi:hover { background: var(--hover); }
.kpi.on { background: var(--hover); }
.kpi.on .label { color: var(--accent); }
.kpi:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.label { font-size: 12px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  color: var(--text); }
.big { font-size: 1.5rem; font-weight: 700; letter-spacing: -.01em; margin-top: 4px;
  font-variant-numeric: tabular-nums; }
.chart { padding: 8px 20px 12px; position: relative; }
.chart svg { display: block; width: 100%; height: 300px; overflow: visible; }
.chart text { fill: var(--faint); font-size: 11px; font-family: var(--font); }
.tip { position: absolute; pointer-events: none; background: var(--text); color: var(--bg);
  padding: 7px 10px; border-radius: 6px; font-size: 12.5px; white-space: nowrap;
  transform: translate(-50%, -110%); opacity: 0; transition: opacity .1s; }
.tip b { display: block; font-size: 14px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
.panel { padding: 20px; min-width: 0; }
.tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.tab { all: unset; cursor: pointer; font-size: 12px; font-weight: 600; letter-spacing: .05em;
  text-transform: uppercase; color: var(--muted); padding: 4px 0 11px; margin-bottom: -1px;
  border-bottom: 2px solid transparent; }
.tab:hover { color: var(--text); }
.tab.on { color: var(--text); border-color: var(--text); }
.tab:focus-visible { outline: 2px solid var(--accent); }
.head, .row { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.head { color: var(--muted); padding: 2px 0 8px; }
.head span:first-child, .row .name { flex: 1; min-width: 0; }
.row { position: relative; height: 34px; margin-bottom: 2px; }
.row .bar { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--bar-a); }
.panel.b .row .bar { background: var(--bar-b); }
.row .name { position: relative; padding: 0 8px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-size: 14px; }
.row .name small { color: var(--muted); margin-left: 8px; font-size: 12px; }
.row .num { position: relative; font-variant-numeric: tabular-nums; font-size: 14px;
  min-width: 56px; text-align: right; }
.row .num.bad { color: var(--bad); }
.empty { color: var(--muted); font-size: 14px; padding: 24px 8px; }
.solo { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 20px; }
.solo div { padding: 16px 20px; }
.solo div + div { border-left: 1px solid var(--line); }
.solo p { margin: 6px 0 0; font-size: 14px; }
footer { color: var(--muted); font-size: 12.5px; margin-top: 24px; line-height: 1.6; }
@media (max-width: 860px) {
  .kpis { grid-template-columns: repeat(3, 1fr); }
  .kpi:nth-child(4)::before { display: none; }
  .grid2, .solo { grid-template-columns: 1fr; }
  .solo div + div { border-left: 0; border-top: 1px solid var(--line); }
}
@media (max-width: 520px) {
  .wrap { padding: 20px 16px 48px; }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .kpi::before { display: none; }
  .range { margin-left: 0; }
  .chart svg { height: 220px; }
}
`;

// render(S) draws the whole page from a summary; calling it again redraws from scratch.
const SCRIPT = `
function render(S) {
for (const id of ['kpis', 'panel-a', 'panel-b']) document.getElementById(id).replaceChildren();
const METRICS = [
  ['sessions', 'Sessions', 'n'], ['cost', 'Est. cost', 'usd'], ['skills', 'Skill runs', 'n'],
  ['hours', 'Active time', 'h'], ['prs', 'Pull requests', 'n'], ['commits', 'Commits', 'n'],
];
const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' :
  n >= 1000 ? n.toLocaleString('en-US') : String(Math.round(n * 10) / 10);
const fmt = (n, kind) => kind === 'usd' ? '$' + (n >= 1e4 ? short(n) : n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)) :
  kind === 'h' ? (n < 10 ? n.toFixed(1) : Math.round(n)) + 'h' : kind === 'min' ? n.toFixed(1) + ' min' : short(n);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; return e; };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const dayLabel = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

let metric = 'cost';
const kpis = document.getElementById('kpis');
for (const [key, label, kind] of METRICS) {
  const b = el('button', 'kpi'); b.dataset.key = key; b.setAttribute('aria-pressed', 'false');
  b.append(el('div', 'label', label), el('div', 'big', fmt(S.totals[key], kind)));
  b.onclick = () => { metric = key; draw(); };
  kpis.append(b);
}

const svg = document.getElementById('chart');
const tip = document.getElementById('tip');
function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v); }
function draw() {
  for (const b of kpis.children) { const on = b.dataset.key === metric;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  const kind = METRICS.find((m) => m[0] === metric)[2];
  const W = svg.clientWidth || 1000, H = svg.clientHeight || 300, L = 44, R = 8, T = 10, B = 26;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.replaceChildren();
  const pts = S.days.map((d) => d[metric]);
  const max = niceMax(Math.max(...pts, 0));
  const x = (i) => L + (pts.length < 2 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  for (let g = 0; g <= 4; g++) { const v = (max * g) / 4, yy = y(v);
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: yy, y2: yy, stroke: 'var(--grid)' }));
    const t = svgEl('text', { x: L - 8, y: yy + 4, 'text-anchor': 'end' }); t.textContent = (kind === 'usd' ? '$' : '') + short(v) + (kind === 'h' ? 'h' : '');
    svg.append(t); }
  const every = Math.max(1, Math.ceil(pts.length / 7));
  const lastFits = (pts.length - 1) % every === 0 || (pts.length - 1) % every > every / 2;
  S.days.forEach((d, i) => { if (i % every && !(i === pts.length - 1 && lastFits)) return;
    const t = svgEl('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }); t.textContent = dayLabel(d.day); svg.append(t); });
  const defs = svgEl('defs', {}); const grad = svgEl('linearGradient', { id: 'fill', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svgEl('stop', { offset: '0', 'stop-color': 'var(--accent)', 'stop-opacity': '.18' }),
    svgEl('stop', { offset: '1', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }));
  defs.append(grad); svg.append(defs);
  const line = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  if (pts.length) {
    svg.append(svgEl('path', { d: line + ' L' + x(pts.length - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z', fill: 'url(#fill)' }));
    svg.append(svgEl('path', { d: line, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  const guide = svgEl('line', { y1: T, y2: H - B, stroke: 'var(--line)', opacity: 0 });
  const dot = svgEl('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0 });
  svg.append(guide, dot);
  svg.onmousemove = (e) => { const r = svg.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((mx - L) / (W - L - R)) * (pts.length - 1))));
    const px = x(i), py = y(pts[i]);
    guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.setAttribute('opacity', 1);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('opacity', 1);
    tip.replaceChildren(el('span', '', dayLabel(S.days[i].day)), el('b', '', fmt(pts[i], kind)));
    tip.style.left = (px / W) * r.width + 20 + 'px'; tip.style.top = (py / H) * r.height + 8 + 'px'; tip.style.opacity = 1; };
  svg.onmouseleave = () => { tip.style.opacity = 0; guide.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); };
}
draw(); onresize = draw;

const PANELS = {
  a: [['skills', 'Skills', 'Skill', 'Runs', 'n'], ['runtime', 'Run time', 'Skill', 'Median', 'min'],
      ['costBySkill', 'Cost by skill', 'Active skill', 'Cost', 'usd'], ['hosts', 'Hosts', 'Host', 'Sessions', 'n']],
  b: [['tools', 'MCP tools', 'Tool', 'Calls', 'n'], ['agents', 'Subagents', 'Agent', 'Runs', 'n'],
      ['costByModel', 'Models', 'Model', 'Cost', 'usd'], ['tokensByModel', 'Tokens', 'Model', 'Tokens', 'n'],
      ['refusals', 'Refusals', 'Helper refusal', 'Times', 'n']],
};
for (const side of ['a', 'b']) {
  const root = document.getElementById('panel-' + side), tabs = el('div', 'tabs'), body = el('div');
  tabs.setAttribute('role', 'tablist'); root.append(tabs, body);
  const show = (idx) => {
    const [key, , col, unit, kind] = PANELS[side][idx];
    [...tabs.children].forEach((t, i) => { t.classList.toggle('on', i === idx); t.setAttribute('aria-selected', String(i === idx)); });
    const rows = S.lists[key], head = el('div', 'head');
    const hasFail = key === 'tools';
    head.append(el('span', '', col)); if (hasFail) head.append(el('span', 'num', 'Failed')); head.append(el('span', 'num', unit));
    body.replaceChildren(head);
    if (!rows.length) { body.append(el('div', 'empty', key === 'refusals' ? 'No helper refusals in this range.' : 'Nothing recorded in this range.')); return; }
    const top = rows[0].value || 1;
    for (const r of rows.slice(0, 10)) {
      const row = el('div', 'row'); const bar = el('div', 'bar'); bar.style.width = Math.max(2, (r.value / top) * 75) + '%';
      const name = el('div', 'name', r.name); if (r.detail) name.append(el('small', '', r.detail)); name.title = r.name + (r.detail ? ' — ' + r.detail : '');
      row.append(bar, name);
      if (hasFail) row.append(el('div', 'num' + (r.failed ? ' bad' : ''), short(r.failed || 0)));
      row.append(el('div', 'num', fmt(r.value, kind)));
      body.append(row);
    }
    if (rows.length > 10) body.append(el('div', 'head', '+ ' + (rows.length - 10) + ' more'));
  };
  PANELS[side].forEach(([, label], i) => { const t = el('button', 'tab', label); t.setAttribute('role', 'tab'); t.onclick = () => show(i); tabs.append(t); });
  show(0);
}
document.getElementById('solo-sessions').textContent = S.solo.sessions;
document.getElementById('solo-router').textContent = S.solo.routerOnly;
document.getElementById('solo-never').textContent = S.solo.neverStarted.join(', ') || 'none';
}
`;

const RANGES = [7, 14, 30, 90];

/** The page around the dashboard: `range` fills the header, `tail` is the closing scripts. */
function shell(range: string, status: string, tail: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Solo usage</title><style>${CSS}</style></head>
<body><div class="wrap">
<header><div class="brand"><span class="mark" aria-hidden="true">S</span>Solo usage</div>
<div class="live"><i aria-hidden="true"></i>${status}</div>
<nav class="range" aria-label="Time range">${range}</nav></header>
<section class="card"><div class="kpis" id="kpis"></div>
<div class="chart"><svg id="chart" role="img" aria-label="Daily totals for the selected number"></svg><div class="tip" id="tip"></div></div></section>
<div class="grid2"><section class="card panel a" id="panel-a"></section><section class="card panel b" id="panel-b"></section></div>
<section class="card solo" aria-label="Sidecut Solo">
<div><div class="label">Sessions using Solo</div><div class="big" id="solo-sessions"></div></div>
<div><div class="label">Only the router started</div><div class="big" id="solo-router"></div></div>
<div><div class="label">Solo skills never started</div><p id="solo-never"></p></div></section>
<footer>From Claude Code's and Codex's usage export, the skill hook log and the helper's refusal log on this machine. Cost is Claude Code's own estimate; Codex sends tokens but no cost.
Run time counts from a skill starting to the next skill or a 30-minute idle gap: agent time, not yours.
The desktop app reports typed commands as claude-proactive, so “how a skill started” doesn't separate typed from automatic there. In Codex, explicit means asked for and implicit means picked up by the agent.</footer>
</div>
${tail}</body></html>
`;
}

const span = (iso: string) => iso.slice(0, 10);

/** One self-contained HTML page for `summary`. `days` links the range picker when the page is served. */
export function dashboardPage(summary: Summary, options: { days?: number; live?: boolean } = {}) {
  const range = options.live
    ? RANGES.map((d) =>
        d === options.days
          ? `<span class="on">${d} days</span>`
          : `<a href="?days=${d}">${d} days</a>`,
      ).join('')
    : `<span>${span(summary.since)} to ${span(summary.until)}</span>`;
  const json = JSON.stringify(summary).replace(/</g, '\\u003c');
  return shell(
    range,
    options.live ? 'Live from your usage export' : 'Saved snapshot',
    `<script type="application/json" id="data">${json}</script>
<script>${SCRIPT}
render(JSON.parse(document.getElementById('data').textContent));</script>`,
  );
}

/**
 * The dashboard as an MCP App view: no data inside; `app` is a browser script that receives the
 * summary from the host and calls `render(summary)` and `showRange(summary)`.
 */
export function dashboardApp(app: string): string {
  return shell(
    '<span id="range">Loading…</span>',
    'From your usage export',
    `<script>${SCRIPT}
function showRange(S) { document.getElementById('range').textContent = S.since.slice(0, 10) + ' to ' + S.until.slice(0, 10); }</script>
<script type="module">${app.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
}
