import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);

// plugins/sidecut-solo/server/src/helper/solo.ts
import { readFileSync as readFileSync10, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join12 } from "node:path";
import { cwd } from "node:process";

// plugins/sidecut-solo/server/src/helper/dashboard/page.ts
var CSS = `
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
var SCRIPT = `
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
      const name = el('div', 'name', r.name); if (r.detail) name.append(el('small', '', r.detail)); name.title = r.name + (r.detail ? ' \u2014 ' + r.detail : '');
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
var RANGES = [7, 14, 30, 90];
function shell(range, status, tail2) {
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
The desktop app reports typed commands as claude-proactive, so \u201Chow a skill started\u201D doesn't separate typed from automatic there. In Codex, explicit means asked for and implicit means picked up by the agent.</footer>
</div>
${tail2}</body></html>
`;
}
var span = (iso) => iso.slice(0, 10);
function dashboardPage(summary2, options = {}) {
  const range = options.live ? RANGES.map(
    (d) => d === options.days ? `<span class="on">${d} days</span>` : `<a href="?days=${d}">${d} days</a>`
  ).join("") : `<span>${span(summary2.since)} to ${span(summary2.until)}</span>`;
  const json2 = JSON.stringify(summary2).replace(/</g, "\\u003c");
  return shell(
    range,
    options.live ? "Live from your usage export" : "Saved snapshot",
    `<script type="application/json" id="data">${json2}</script>
<script>${SCRIPT}
render(JSON.parse(document.getElementById('data').textContent));</script>`
  );
}

// plugins/sidecut-solo/server/src/helper/lib/usage.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";

// plugins/sidecut-solo/server/src/helper/lib/paths.ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
var root = import.meta.dirname;
while (!existsSync(join(root, ".codex-plugin", "plugin.json"))) {
  const parent = dirname(root);
  if (parent === root) throw new Error("Solo plugin root not found");
  root = parent;
}
var pluginRoot = root;

// plugins/sidecut-solo/server/src/helper/lib/usage.ts
var hostOf = (r) => r.host ?? "claude-code";
var isSkillRun = (r) => r.name === "skill_activated" || r.name === "skill_invocation";
function skillOf(r) {
  const name = r.attrs["skill.name"] ?? "?";
  const plugin = r.attrs["skill.plugin_id"]?.split(/[@:]/)[0];
  return plugin && !name.includes(":") ? `${plugin}:${name}` : name;
}
var triggerOf = (r) => r.attrs.invocation_trigger ?? r.attrs["skill.invocation_type"] ?? "unknown";
function mcpToolOf(r) {
  if (r.name !== "tool_result") return void 0;
  if (r.attrs.mcp_server_name) return [r.attrs.mcp_server_name, r.attrs.mcp_tool_name ?? "?"];
  const server = r.attrs.mcp_server;
  if (!server) return void 0;
  const tool = r.attrs.tool_name ?? "?";
  return [server, tool.startsWith(`mcp__${server}__`) ? tool.slice(server.length + 7) : tool];
}
function tokensOf(r) {
  const model = r.attrs.model ?? "?";
  if (r.name === "claude_code.token.usage") {
    const n = r.value ?? 0;
    const type = r.attrs.type;
    if (type === "input" || type === "cacheCreation")
      return { model, input: n, output: 0, cached: 0 };
    if (type === "output") return { model, input: 0, output: n, cached: 0 };
    if (type === "cacheRead") return { model, input: n, output: 0, cached: n };
    return void 0;
  }
  if (r.name === "sse_event" && r.attrs["event.kind"] === "response.completed") {
    const n = (key) => Number(r.attrs[key] ?? 0) || 0;
    return {
      model,
      input: n("input_token_count"),
      output: n("output_token_count"),
      cached: n("cached_token_count")
    };
  }
  return void 0;
}
function logOnlyRuns(records, runs, since) {
  const exported = new Set(
    records.filter((r) => isSkillRun(r) && new Date(r.time) >= since).map(hostOf)
  );
  return runs.filter((r) => new Date(r.time) >= since && !exported.has(r.host));
}
var HOST_NAMES = {
  "claude-code": "Claude Code",
  codex: "Codex",
  antigravity: "Antigravity"
};
var hostName = (host) => HOST_NAMES[host] ?? host;
var hostCost = (host, cost) => host === "claude-code" || cost > 0 ? `$${cost.toFixed(2)}` : "no cost sent";
var usageFile = () => process.env.CLAUDE_USAGE_FILE ?? join2(homedir(), ".local/state/claude-usage/usage.jsonl");
var skillLogFile = () => process.env.SIDECUT_SKILL_LOG_FILE ?? join2(homedir(), ".sidecut", "skill-log.jsonl");
function readSkillRuns(path = skillLogFile()) {
  return readJsonl(path).flatMap((row) => {
    if (typeof row?.skill !== "string" || typeof row.time !== "string") return [];
    const skill = canonicalSoloSkill(`${row.plugin}:${row.skill}`);
    return skill ? [{ ...row, skill }] : [];
  });
}
var helperLog = () => process.env.SOLO_HELPER_LOG ?? join2(homedir(), ".local/state/solo-workflow/helper.jsonl");
var helperLogOff = () => helperLog() === "off";
function readJsonl(path) {
  if (!existsSync2(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}
function readRefusals() {
  return helperLogOff() ? [] : readJsonl(helperLog());
}
function count(map, key, make) {
  const found = map.get(key);
  if (found) return found;
  const made = make();
  map.set(key, made);
  return made;
}
var IDLE_MS = 30 * 6e4;
function skillMinutes(records) {
  const bySession = /* @__PURE__ */ new Map();
  for (const r of records) {
    const id = r.attrs["session.id"];
    if (id) count(bySession, id, () => []).push(r);
  }
  const out = /* @__PURE__ */ new Map();
  for (const rows of bySession.values()) {
    rows.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    rows.forEach((r, i) => {
      if (!isSkillRun(r)) return;
      const start = Date.parse(r.time);
      let end = start;
      for (const next of rows.slice(i + 1)) {
        const at = Date.parse(next.time);
        if (isSkillRun(next) || at - end > IDLE_MS) {
          if (isSkillRun(next) && at - end <= IDLE_MS) end = at;
          break;
        }
        end = at;
      }
      const minutes = (end - start) / 6e4;
      if (Number.isFinite(minutes) && minutes >= 0)
        count(out, skillOf(r), () => []).push(minutes);
    });
  }
  return out;
}
var median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] ?? 0 : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
function report(records, since) {
  const recent = records.filter((record) => new Date(record.time) >= since);
  const sessions = new Set(recent.map((r) => r.attrs["session.id"]).filter(Boolean));
  const skills = /* @__PURE__ */ new Map();
  const tools = /* @__PURE__ */ new Map();
  const agents = /* @__PURE__ */ new Map();
  const cost = /* @__PURE__ */ new Map();
  const tokens = /* @__PURE__ */ new Map();
  const hosts = /* @__PURE__ */ new Map();
  let total = 0;
  for (const record of recent) {
    const { name, attrs, value } = record;
    const host = count(hosts, hostOf(record), () => ({
      sessions: /* @__PURE__ */ new Set(),
      skills: 0,
      tools: 0,
      tokens: 0,
      cost: 0
    }));
    if (attrs["session.id"]) host.sessions.add(attrs["session.id"]);
    const used = tokensOf(record);
    if (used) {
      const row = count(tokens, used.model, () => ({ ...used, input: 0, output: 0, cached: 0 }));
      row.input += used.input;
      row.output += used.output;
      row.cached += used.cached;
      host.tokens += used.input + used.output;
    }
    if (name === "tool_result") host.tools++;
    const mcp = mcpToolOf(record);
    if (isSkillRun(record)) {
      host.skills++;
      const row = count(skills, skillOf(record), () => ({}));
      const trigger = triggerOf(record);
      row[trigger] = (row[trigger] ?? 0) + 1;
    } else if (mcp) {
      const row = count(tools, `${mcp[0]} ${mcp[1]}`, () => ({
        calls: 0,
        failed: 0,
        ms: 0
      }));
      row.calls++;
      if (attrs.success === "false") row.failed++;
      row.ms += Number(attrs.duration_ms ?? 0);
    } else if (name === "subagent_completed") {
      const row = count(agents, attrs.agent_type ?? "?", () => ({ runs: 0, ms: 0 }));
      row.runs++;
      row.ms += Number(attrs.duration_ms ?? 0);
    } else if (name === "claude_code.cost.usage" && value) {
      total += value;
      host.cost += value;
      const key = attrs["skill.name"] ?? "(no skill)";
      cost.set(key, (cost.get(key) ?? 0) + value);
    }
  }
  const sorted = (map, by) => [...map].sort((a, b) => by(b[1]) - by(a[1]));
  const usd = (n) => `$${n.toFixed(2)}`;
  const big = (n) => Math.round(n).toLocaleString("en-US");
  const costNote = hosts.has("codex") ? " (Claude Code only: Codex sends no cost)" : "";
  const lines = [
    `Since ${since.toISOString().slice(0, 10)}: ${sessions.size} sessions, ${usd(total)} estimated cost${costNote}`,
    "",
    "Hosts (sessions, skill runs, tool calls, tokens, cost)",
    ...sorted(hosts, (row) => row.sessions.size).map(
      ([host, row]) => `  ${hostName(host)}  ${row.sessions.size} sessions, ${row.skills} skill runs, ${row.tools} tool calls, ${big(row.tokens)} tokens, ${hostCost(host, row.cost)}`
    ),
    "",
    "Skills (runs by how they started)",
    ...sorted(skills, (row) => Object.values(row).reduce((a, b) => a + b, 0)).map(
      ([skill, row]) => `  ${skill}  ${Object.entries(row).map(([trigger, n]) => `${trigger} ${n}`).join(", ")}`
    ),
    "",
    "Skill run time (median and longest minutes, runs)",
    ...[...skillMinutes(recent)].sort((a, b) => b[1].length - a[1].length).map(
      ([skill, mins]) => `  ${skill}  median ${median(mins).toFixed(1)} min, longest ${Math.max(...mins).toFixed(1)} min, ${mins.length} runs`
    ),
    "",
    "MCP tools (calls, failures, average time)",
    ...sorted(tools, (row) => row.calls).map(
      ([tool, row]) => `  ${tool}  ${row.calls} calls, ${row.failed} failed, ${Math.round(row.ms / row.calls)} ms`
    ),
    "",
    "Subagents (runs, average time)",
    ...sorted(agents, (row) => row.runs).map(
      ([agent, row]) => `  ${agent}  ${row.runs} runs, ${Math.round(row.ms / row.runs / 1e3)} s`
    ),
    "",
    "Tokens by model (input, output, of which cached input)",
    ...sorted(tokens, (row) => row.input + row.output).map(
      ([model, row]) => `  ${model}  ${big(row.input)} input, ${big(row.output)} output, ${big(row.cached)} cached`
    ),
    "",
    "Cost by active skill",
    ...sorted(cost, (n) => n).map(([skill, n]) => `  ${skill}  ${usd(n)}`)
  ];
  return lines.join("\n");
}
var vocabulary;
function helperWords() {
  if (vocabulary) return vocabulary;
  const words = /* @__PURE__ */ new Set();
  const files = [join2(pluginRoot, "server", "src", "helper", "solo.ts")];
  try {
    for (const name of readdirSync(join2(pluginRoot, "server", "src", "helper", "lib")))
      if (name.endsWith(".ts"))
        files.push(join2(pluginRoot, "server", "src", "helper", "lib", name));
  } catch {
  }
  for (const file of files) {
    try {
      for (const word of readFileSync(file, "utf8").toLowerCase().match(/[a-z]+/g) ?? [])
        words.add(word);
    } catch {
    }
  }
  vocabulary = words;
  return words;
}
function refusalReason(message) {
  const known = helperWords();
  const first = (message.split("\n")[0] ?? "").replace(/\b(git|gh)\b[ :].*$/, "$1 \u2026 failed");
  return first.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "\u2026").split(/\s+/).map((word) => {
    const bare = /^([A-Za-z]{1,20})[.,;:!?)]*$/.exec(word)?.[1];
    if (bare && known.has(bare.toLowerCase())) return word;
    if (/^--[a-z][a-z-]*[.,;:]*$|^[(:;,.—-]$|^…$/.test(word)) return word;
    return "\u2026";
  }).join(" ").replace(/…(?: …)+/g, "\u2026").slice(0, 160);
}
function logRefusal(command, message, version) {
  if (helperLogOff()) return;
  const path = helperLog();
  try {
    mkdirSync(dirname2(path), { recursive: true });
    const row = {
      time: (/* @__PURE__ */ new Date()).toISOString(),
      version,
      command,
      reason: refusalReason(message)
    };
    appendFileSync(path, `${JSON.stringify(row)}
`);
  } catch {
  }
}
var SOLO_SKILLS = [
  "solo",
  "solo-choose-approach",
  "solo-research-topic",
  "solo-plan-change",
  "solo-build-change",
  "solo-diagnose-problem",
  "solo-list-work",
  "solo-review-code",
  "solo-review-design",
  "solo-test-behavior",
  "solo-deliver-change",
  "solo-configure-project",
  "solo-maintain-context",
  "solo-prevent-mistake",
  "solo-compare-plugin",
  "solo-show-usage",
  "solo-write-copy"
];
function lastRecorded(records, now2) {
  let newest = Number.NEGATIVE_INFINITY;
  for (const r of records) {
    const time = new Date(r.time).getTime();
    if (Number.isFinite(time) && time <= now2.getTime() && time > newest) newest = time;
  }
  if (!Number.isFinite(newest)) return "Last recorded: no event with a valid past time";
  const hours = (now2.getTime() - newest) / 36e5;
  const when = new Date(newest).toISOString().slice(0, 16).replace("T", " ");
  if (hours <= 24) return `Last recorded ${when} UTC`;
  const days = Math.round(hours / 24);
  return `Last recorded ${when} UTC, ${days} ${days === 1 ? "day" : "days"} ago: recording may have stopped, so check that the usage receiver is running`;
}
var SOLO_SKILL_ALIASES = new Map([
  ["solo-review-change", "solo-review-code"],
  ["solo-workflow-review-change", "solo-review-code"],
  ["solo-verify-change", "solo-test-behavior"],
  ["solo-workflow-verify-change", "solo-test-behavior"],
  ["solo-finish-change", "solo-deliver-change"],
  ["solo-workflow-finish-change", "solo-deliver-change"],
  ["solo-workflow", "solo"],
  ...SOLO_SKILLS.filter((name) => name !== "solo").map((name) => [
    name.replace(/^solo-/, "solo-workflow-"),
    name
  ]),
  ["solo-decide", "solo-choose-approach"],
  ["solo-research", "solo-research-topic"],
  ["solo-plan", "solo-plan-change"],
  ["solo-build", "solo-build-change"],
  ["solo-troubleshoot", "solo-diagnose-problem"],
  ["solo-status", "solo-list-work"],
  ["solo-review", "solo-review-code"],
  ["solo-design-review", "solo-review-design"],
  ["solo-verify", "solo-test-behavior"],
  ["solo-finish", "solo-deliver-change"],
  ["solo-setup", "solo-configure-project"],
  ["solo-improve-workflow", "solo-prevent-mistake"],
  ["solo-workflow-improve-workflow", "solo-prevent-mistake"],
  ["solo-check-status", "solo-list-work"],
  ["solo-workflow-check-status", "solo-list-work"],
  ["solo-dogfood", "solo-compare-plugin"]
]);
function canonicalSoloSkill(name) {
  const prefix = ["solo-workflow:", "sidecut-solo-workflow:", "sidecut-solo:"].find(
    (p) => name.startsWith(p)
  );
  if (!prefix) return void 0;
  const skill = name.slice(prefix.length);
  return SOLO_SKILL_ALIASES.get(skill) ?? skill;
}
function skillLogSection(runs, since, title = "Skill log") {
  const window = runs.filter((r) => new Date(r.time) >= since);
  if (!window.length)
    return [
      `Skill log: no Solo skill runs in ${skillLogFile()}. The plugin's hook records one line per skill run (time, plugin, skill, host) unless SIDECUT_SKILL_LOG=0, DO_NOT_TRACK=1 or a CI variable is set; it needs no receiver and sends nothing.`
    ];
  const bySkill = /* @__PURE__ */ new Map();
  for (const r of window) {
    const hosts = count(bySkill, r.skill, () => /* @__PURE__ */ new Map());
    hosts.set(r.host, (hosts.get(r.host) ?? 0) + 1);
  }
  const total = (hosts) => [...hosts.values()].reduce((a, b) => a + b, 0);
  const unused = SOLO_SKILLS.filter((s) => !bySkill.has(s));
  return [
    `${title} (${window.length} runs, from ${skillLogFile()})`,
    ...[...bySkill].sort((a, b) => total(b[1]) - total(a[1])).map(
      ([skill, hosts]) => `  ${skill}  ${[...hosts].map(([host, n]) => `${host} ${n}`).join(", ")}`
    ),
    `  skills that never started: ${unused.join(", ") || "none"}`
  ];
}
function shareLine(records, runs, since, days, version) {
  const counts = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (!isSkillRun(r) || new Date(r.time) < since) continue;
    const skill = canonicalSoloSkill(skillOf(r));
    if (skill) counts.set(skill, (counts.get(skill) ?? 0) + 1);
  }
  for (const r of logOnlyRuns(records, runs, since))
    counts.set(r.skill, (counts.get(r.skill) ?? 0) + 1);
  const ran = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const period = `last ${days} ${days === 1 ? "day" : "days"}`;
  if (!ran.length) return `Sidecut Solo ${version}, ${period}: no skill runs recorded`;
  return `Sidecut Solo ${version}, ${period}: ${ran.map(([skill, n]) => `${skill} ${n}`).join(", ")}`;
}
function soloReport(records, refusals, since, now2 = /* @__PURE__ */ new Date(), runs = []) {
  const recent = records.filter((r) => new Date(r.time) >= since);
  const lines = [];
  if (!records.length) {
    lines.push(
      `No Claude Code or Codex usage export at ${usageFile()}. The usage receiver in the Sidecut Solo source repository (its README, "See your own usage") writes it, with tools, tokens, Claude Code's costs and how each skill started; the plugin doesn't install it.`
    );
    lines.push("", ...skillLogSection(runs, since));
  } else {
    lines.push(lastRecorded(records, now2), report(recent, since), "");
    const bySession = /* @__PURE__ */ new Map();
    for (const r of recent) {
      const skill = canonicalSoloSkill(skillOf(r));
      if (!isSkillRun(r) || skill === void 0) continue;
      count(bySession, r.attrs["session.id"] ?? "?", () => []).push(skill);
    }
    const extra = logOnlyRuns(records, runs, since);
    const ran = new Set([...bySession.values()].flat().concat(extra.map((r) => r.skill)));
    const unused = SOLO_SKILLS.filter((s) => !ran.has(s));
    const routerOnly = [...bySession.values()].filter((s) => s.every((n) => n === "solo"));
    lines.push(
      "Sidecut Solo",
      `  sessions using Solo: ${bySession.size}`,
      `  skills that never started: ${unused.join(", ") || "none"}`,
      `  sessions where only the router started (it may have done the work itself): ${routerOnly.length}`,
      "  how a skill started: user-slash is a typed command in the terminal; the desktop app reports typed",
      "  commands as claude-proactive too, so there it does not separate typed from automatic.",
      "  In Codex, explicit means asked for and implicit means picked up by the agent."
    );
    if (extra.length)
      lines.push(
        "",
        ...skillLogSection(extra, since, "Skill log for hosts the export doesn't cover")
      );
  }
  if (helperLogOff()) {
    lines.push("", "Helper refusals: not recorded, the log is off (SOLO_HELPER_LOG=off)");
    return lines.join("\n");
  }
  const window = refusals.filter((r) => new Date(r.time) >= since);
  const grouped = /* @__PURE__ */ new Map();
  for (const r of window)
    grouped.set(`${r.command}: ${r.reason}`, (grouped.get(`${r.command}: ${r.reason}`) ?? 0) + 1);
  lines.push(
    "",
    `Helper refusals (${window.length}, from ${helperLog()})`,
    ...[...grouped].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([reason, n]) => `  ${n}  ${reason}`)
  );
  if (!window.length) lines.push("  none recorded");
  return lines.join("\n");
}

// plugins/sidecut-solo/server/src/helper/dashboard/summary.ts
var METRICS = ["sessions", "cost", "skills", "hours", "prs", "commits"];
var zero = () => Object.fromEntries(METRICS.map((m) => [m, 0]));
var dayOf = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
var median2 = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] ?? 0 : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
function bump(map, name, value, failed = 0) {
  const row = map.get(name) ?? { name, value: 0, failed: 0 };
  row.value += value;
  row.failed = (row.failed ?? 0) + failed;
  map.set(name, row);
  return row;
}
var serverName = (name) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(name) ? `connector ${name.slice(0, 8)}` : name;
var whole = (n) => Math.round(n).toLocaleString("en-US");
var ranked = (map) => [...map.values()].sort((a, b) => b.value - a.value);
function summarize(records, refusals, since, until = /* @__PURE__ */ new Date(), runs = []) {
  const recent = records.filter((r) => {
    const t = new Date(r.time);
    return t >= since && t <= until;
  });
  let first = until.getTime();
  for (const r of recent) first = Math.min(first, Date.parse(r.time));
  const start = new Date(Math.max(since.getTime(), first));
  const days = /* @__PURE__ */ new Map();
  const last = dayOf(until.toISOString());
  for (const d = new Date(start); dayOf(d.toISOString()) <= last; d.setDate(d.getDate() + 1))
    days.set(dayOf(d.toISOString()), zero());
  const sessionsByDay = /* @__PURE__ */ new Map();
  const allSessions = /* @__PURE__ */ new Set();
  const skills = /* @__PURE__ */ new Map();
  const costBySkill = /* @__PURE__ */ new Map();
  const costByModel = /* @__PURE__ */ new Map();
  const tools = /* @__PURE__ */ new Map();
  const agents = /* @__PURE__ */ new Map();
  const tokens = /* @__PURE__ */ new Map();
  const hosts = /* @__PURE__ */ new Map();
  const hostRow = (host) => {
    const found = hosts.get(host);
    if (found) return found;
    const made = { sessions: /* @__PURE__ */ new Set(), skills: 0, tools: 0, tokens: 0, cost: 0 };
    hosts.set(host, made);
    return made;
  };
  const soloSessions = /* @__PURE__ */ new Map();
  for (const r of recent) {
    const day = dayOf(r.time);
    const today = days.get(day) ?? zero();
    days.set(day, today);
    const session = r.attrs["session.id"];
    if (session) {
      allSessions.add(session);
      const set = sessionsByDay.get(day) ?? /* @__PURE__ */ new Set();
      set.add(session);
      sessionsByDay.set(day, set);
    }
    const value = r.value ?? 0;
    const host = hostRow(hostOf(r));
    if (session) host.sessions.add(session);
    const used = tokensOf(r);
    if (used) {
      const row = tokens.get(used.model) ?? {
        name: used.model,
        value: 0,
        input: 0,
        output: 0,
        cached: 0
      };
      row.value += used.input + used.output;
      row.input += used.input;
      row.output += used.output;
      row.cached += used.cached;
      tokens.set(used.model, row);
      host.tokens += used.input + used.output;
    }
    if (isSkillRun(r)) {
      today.skills++;
      host.skills++;
      const name = skillOf(r);
      const row = skills.get(name) ?? { name, value: 0, triggers: {} };
      row.value++;
      const trigger = triggerOf(r);
      row.triggers[trigger] = (row.triggers[trigger] ?? 0) + 1;
      skills.set(name, row);
      const skill = canonicalSoloSkill(name);
      if (skill !== void 0) {
        const list = soloSessions.get(session ?? "?") ?? [];
        list.push(skill);
        soloSessions.set(session ?? "?", list);
      }
    }
    switch (r.name) {
      case "tool_result": {
        host.tools++;
        const mcp = mcpToolOf(r);
        if (!mcp) break;
        const name = `${serverName(mcp[0])} \xB7 ${mcp[1]}`;
        const row = tools.get(name) ?? { name, value: 0, failed: 0, ms: 0 };
        row.value++;
        if (r.attrs.success === "false") row.failed = (row.failed ?? 0) + 1;
        row.ms += Number(r.attrs.duration_ms ?? 0);
        tools.set(name, row);
        break;
      }
      case "subagent_completed": {
        const name = r.attrs.agent_type ?? "?";
        const row = agents.get(name) ?? { name, value: 0, ms: 0 };
        row.value++;
        row.ms += Number(r.attrs.duration_ms ?? 0);
        agents.set(name, row);
        break;
      }
      case "claude_code.cost.usage":
        today.cost += value;
        host.cost += value;
        bump(costBySkill, r.attrs["skill.name"] ?? "(no skill)", value);
        bump(costByModel, r.attrs.model ?? "?", value);
        break;
      case "claude_code.active_time.total":
        today.hours += value / 3600;
        break;
      case "claude_code.pull_request.count":
        today.prs += value;
        break;
      case "claude_code.commit.count":
        today.commits += value;
        break;
    }
  }
  const extra = logOnlyRuns(
    records,
    runs.filter((r) => new Date(r.time) <= until),
    since
  );
  for (const run2 of extra) {
    const today = days.get(dayOf(run2.time)) ?? zero();
    days.set(dayOf(run2.time), today);
    today.skills++;
    hostRow(run2.host).skills++;
    const name = `sidecut-solo:${run2.skill}`;
    const row = skills.get(name) ?? { name, value: 0, triggers: {} };
    row.value++;
    const trigger = `${run2.host} skill log`;
    row.triggers[trigger] = (row.triggers[trigger] ?? 0) + 1;
    skills.set(name, row);
  }
  for (const [day, set] of sessionsByDay) {
    const row = days.get(day);
    if (row) row.sessions = set.size;
  }
  const series = [...days].sort((a, b) => a[0].localeCompare(b[0])).map(([day, row]) => ({ day, ...row }));
  const totals = zero();
  for (const row of series) for (const m of METRICS) totals[m] += row[m];
  totals.sessions = allSessions.size;
  const minutes = skillMinutes(recent);
  const window = refusals.filter((r) => {
    const t = new Date(r.time);
    return t >= since && t <= until;
  });
  const refusalRows = /* @__PURE__ */ new Map();
  for (const r of window) bump(refusalRows, `${r.command}: ${r.reason}`, 1);
  const ran = new Set([...soloSessions.values()].flat().concat(extra.map((r) => r.skill)));
  return {
    since: start.toISOString(),
    until: until.toISOString(),
    totals,
    days: series,
    lists: {
      skills: [...skills.values()].sort((a, b) => b.value - a.value).map(({ name, value, triggers }) => ({
        name,
        value,
        detail: Object.entries(triggers).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(" \xB7 ")
      })),
      runtime: [...minutes].map(([name, mins]) => ({
        name,
        value: median2(mins),
        detail: `longest ${Math.max(...mins).toFixed(0)} min \xB7 ${mins.length} runs`
      })).sort((a, b) => b.value - a.value),
      costBySkill: ranked(costBySkill).map(({ name, value }) => ({ name, value })),
      costByModel: ranked(costByModel).map(({ name, value }) => ({ name, value })),
      tokensByModel: [...tokens.values()].sort((a, b) => b.value - a.value).map(({ name, value, input, output, cached }) => ({
        name,
        value,
        detail: `${whole(input)} in \xB7 ${whole(output)} out \xB7 ${whole(cached)} cached`
      })),
      hosts: [...hosts].sort((a, b) => b[1].sessions.size - a[1].sessions.size).map(([host, row]) => ({
        name: hostName(host),
        value: row.sessions.size,
        detail: `${row.skills} skill runs \xB7 ${row.tools} tool calls \xB7 ${whole(row.tokens)} tokens \xB7 ${hostCost(host, row.cost)}`
      })),
      tools: [...tools.values()].sort((a, b) => b.value - a.value).map(({ name, value, failed, ms }) => ({
        name,
        value,
        failed,
        detail: `${Math.round(ms / value)} ms avg`
      })),
      agents: [...agents.values()].sort((a, b) => b.value - a.value).map(({ name, value, ms }) => ({
        name,
        value,
        detail: `${Math.round(ms / value / 1e3)} s avg`
      })),
      refusals: ranked(refusalRows).map(({ name, value }) => ({ name, value }))
    },
    solo: {
      sessions: soloSessions.size,
      neverStarted: SOLO_SKILLS.filter((s) => !ran.has(s)),
      routerOnly: [...soloSessions.values()].filter((s) => s.every((n) => n === "solo")).length
    }
  };
}

// plugins/sidecut-solo/server/src/helper/lib/agents.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync2, readdirSync as readdirSync3, readFileSync as readFileSync4, writeFileSync } from "node:fs";
import { join as join5 } from "node:path";

// plugins/sidecut-solo/server/src/helper/lib/config.ts
import { existsSync as existsSync4, lstatSync as lstatSync2, readFileSync as readFileSync3, realpathSync as realpathSync2 } from "node:fs";
import { join as join4, resolve as resolve2 } from "node:path";

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r?\n/);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r?\n/);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class _TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
  /** @internal */
  static x(message, ctx, ptr) {
    throw new _TomlError(message, { toml: ctx.s, ptr: ptr ?? ctx.p });
  }
};

// node_modules/smol-toml/dist/primitive.js
function parseString(ctx) {
  let startPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (; ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in strings", ctx);
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state) {
        let s = ctx.s.slice(sliceStart, ctx.p);
        parsed = parsed ? parsed + s : s;
      }
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let errPtr = ctx.p++ - 1;
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0; j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            TomlError.x("invalid non-hex character in unicode escape", ctx);
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          TomlError.x("invalid unicode escape", ctx, errPtr);
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p--;
        state = 0;
      } else if (isMultiline && (c === 32 || c === 9)) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "	";
        else if (c === 110)
          parsed += "\n";
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          TomlError.x("unrecognised escape sequence", ctx);
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2)
        TomlError.x("invalid escape: only line-ending whitespace may be escaped", ctx, sliceStart);
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  TomlError.x("unfinished string", ctx, startPtr);
}

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[Tt ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date, fasttype, unsafeDelim) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    let c;
    if (typeof date === "string") {
      if (fasttype)
        prep: {
          if (fasttype < 3) {
            if (+date.slice(11, 13) > 23) {
              date = "";
              break prep;
            }
            if (fasttype === 2) {
              offset = null;
              date += "Z";
            } else if ((c = date.charCodeAt(date.length - 1)) !== 90 && c !== 122) {
              offset = date.slice(date.length - 6);
            }
            if (unsafeDelim)
              date = date.slice(0, 10) + "T" + date.slice(11);
          } else if (fasttype === 4) {
            date = +date.slice(0, 2) > 23 ? "" : `0000-01-01T${date}Z`;
          }
          hasDate = fasttype !== 4;
          hasTime = fasttype !== 3;
        }
      else {
        let match = date.match(DATE_TIME_RE);
        if (match) {
          if (!match[1]) {
            hasDate = false;
            date = `0000-01-01T${date}`;
          }
          hasTime = !!match[2];
          hasTime && date[10] === " " && (date = date.replace(" ", "T"));
          if (match[2] && +match[2] > 23) {
            date = "";
          } else {
            offset = match[3] || null;
            if (!offset && hasTime)
              date += "Z";
          }
        } else {
          date = "";
        }
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z" || this.#offset === "z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/extract.js
function isDigit(char, base = 10) {
  return base === 16 ? char > 47 && char < 58 || char > 64 && char < 71 || char > 96 && char < 103 : char > 47 && char < 48 + base;
}
function isEndOfValue(char, delim) {
  return char === 32 || char === 9 || char === 10 || char === 13 || // Structure end or next value delimiter
  delim && (char === delim || char === 44) || // Comment
  char === 35;
}
function extractValue(ctx, end) {
  let errPtr = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p);
  if (c === 91 || c === 123) {
    ctx.d-- || TomlError.x("document contains excessively nested structures. aborting.", ctx);
    let value = c === 91 ? parseArray(ctx) : parseInlineTable(ctx);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      TomlError.x("invalid value", ctx, errPtr);
    return ctx.p++, false;
  }
  if (c === 43 || c === 45) {
    return parseNumber(ctx, ctx.p, ctx.s.charCodeAt(++ctx.p), 44 - c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 4) === 45 && ctx.s.charCodeAt(ctx.p + 7) === 45) {
    return parseDate(ctx, c, end);
  }
  if (ctx.s.charCodeAt(ctx.p + 2) === 58) {
    return parseTime(ctx, c, end);
  }
  return parseNumber(ctx, ctx.p, c, 0, end);
}
function parseNumber(ctx, startPtr, startChr, sign, endChr) {
  let c = startChr;
  let state = 0;
  let hasUnderscores = false;
  if (c === 105) {
    if (ctx.s.charCodeAt(++ctx.p) !== 110 || ctx.s.charCodeAt(++ctx.p) !== 102)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, (sign || 1) / 0;
  }
  if (c === 110) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 110)
      TomlError.x("invalid value", ctx, startPtr);
    return ctx.p++, NaN;
  }
  if (c === 48) {
    if (++ctx.p >= ctx.s.length || isEndOfValue(c = ctx.s.charCodeAt(ctx.p), endChr))
      return ctx.bi === true ? 0n : 0;
    if (!sign) {
      if (c === 120)
        return parseIntegerBaseN(ctx, startPtr, 16, endChr);
      else if (c === 98)
        return parseIntegerBaseN(ctx, startPtr, 2, endChr);
      else if (c === 111)
        return parseIntegerBaseN(ctx, startPtr, 8, endChr);
    }
    if (c === 46)
      state = 2;
    else if (c === 101 || c === 69)
      state = 4;
    else
      TomlError.x("illegal leading zero", ctx, startPtr);
  } else if (!isDigit(c))
    TomlError.x("invalid value", ctx, startPtr);
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (!state)
      state = 1;
    if (c === 95) {
      if (!(state & 1))
        TomlError.x("illegal underscore", ctx);
      state += 11;
      hasUnderscores = true;
    } else if (state === 1 && c === 46)
      state = 2;
    else if ((state === 1 || state === 3) && (c === 101 || c === 69))
      state = 4;
    else if (state === 4 && (c === 43 || c === 45)) {
      state = 6;
    } else if (!isDigit(c))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (state > 9)
      state -= 11;
    else if (!(state & 1))
      state++;
  }
  if (!state) {
    let val = (startChr - 48) * (sign || 1);
    return ctx.bi === true ? BigInt(val) : val;
  }
  if (!(state & 1))
    TomlError.x("unfinished numeric value", ctx, startPtr);
  let str = ctx.s.slice(startPtr, ctx.p);
  if (hasUnderscores)
    str = str.replaceAll("_", "");
  return state > 1 ? parseFloat(str) : parseInteger(ctx, str, 10, startPtr);
}
function parseIntegerBaseN(ctx, startPtr, base, endChr) {
  let c, underscore = 1;
  while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
    if (c === 95) {
      if (underscore & 1)
        TomlError.x("illegal underscore", ctx);
      underscore = 3;
    } else if (!isDigit(c, base))
      TomlError.x(`illegal character in numeric literal`, ctx);
    else if (underscore & 1)
      underscore--;
  }
  if (underscore & 1)
    TomlError.x("unfinished numeric value", ctx);
  let str = ctx.s.slice(startPtr + 2, ctx.p);
  if (underscore)
    str = str.replaceAll("_", "");
  return parseInteger(ctx, str, base, startPtr);
}
function parseInteger(ctx, str, base, startPtr) {
  if (ctx.bi !== true)
    int: {
      let val = parseInt(str, base);
      if (!Number.isSafeInteger(val)) {
        if (ctx.bi)
          break int;
        TomlError.x("integer value cannot be represented losslessly", ctx, startPtr);
      }
      return val;
    }
  return base === 10 ? BigInt(str) : BigInt((base === 2 ? "0b" : base === 8 ? "0o" : "0x") + str);
}
function parseDate(ctx, c, endChr) {
  let startPtr = ctx.p++, unsafeSeparator;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++))) {
    return parseNumber(ctx, ctx.p = startPtr, c, 0, endChr);
  }
  ctx.p += 5;
  if (!isDigit(ctx.s.charCodeAt(ctx.p++)))
    TomlError.x("invalid date-time: date part is malformed", ctx, startPtr);
  if (ctx.p >= ctx.s.length || ((c = ctx.s.charCodeAt(ctx.p)) !== 32 || (unsafeSeparator = true, !isDigit(ctx.s.charCodeAt(ctx.p + 1)))) && c !== 84 && c !== 116) {
    let t2 = ctx.s.slice(startPtr, ctx.p);
    return readDate(ctx, t2, 3, false, startPtr);
  }
  if (ctx.s.charCodeAt(ctx.p += 3) !== 58)
    TomlError.x("invalid date-time: time part is malformed", ctx, startPtr);
  if (ctx.s.charCodeAt(ctx.p += 3) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  if (c = ctx.s.charCodeAt(ctx.p)) {
    if (c === 90 || c === 122) {
      let t2 = ctx.s.slice(startPtr, ++ctx.p);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, "[+00:00]");
    }
    if (c === 43 || c === 45) {
      let t2 = ctx.s.slice(startPtr, ctx.p += 6);
      return readDate(ctx, t2, 1, unsafeSeparator, startPtr, !ctx.ld && "[" + ctx.s.slice(ctx.p - 6, ctx.p) + "]");
    }
  }
  let t = ctx.s.slice(startPtr, ctx.p);
  return readDate(ctx, t, 2, unsafeSeparator, startPtr);
}
function parseTime(ctx, c, endChr) {
  let start = ctx.p;
  if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(++ctx.p))) {
    return parseNumber(ctx, --ctx.p, c, 0, endChr);
  }
  if (ctx.s.charCodeAt(ctx.p += 4) === 58)
    ctx.p += 3;
  if (ctx.s.charCodeAt(ctx.p) === 46)
    while (isDigit(ctx.s.charCodeAt(++ctx.p)))
      ;
  let t = ctx.s.slice(start, ctx.p);
  return readDate(ctx, t, 4, false, start);
}
function readDate(ctx, str, type, unsafeDelim, errPtr, temporalSuffix) {
  if (ctx.ld) {
    let date = new TomlDate(str, type, unsafeDelim);
    if (!date.isValid())
      TomlError.x("invalid date", ctx, errPtr);
    return date;
  }
  try {
    if (temporalSuffix)
      str += temporalSuffix;
    switch (type) {
      case 1:
        return Temporal.ZonedDateTime.from(str);
      case 2:
        return Temporal.PlainDateTime.from(str);
      case 3:
        return Temporal.PlainDate.from(str);
      case 4:
        return Temporal.PlainTime.from(str);
    }
  } catch (e) {
    TomlError.x(e instanceof Error ? e.message : "" + e, ctx, errPtr);
  }
}

// node_modules/smol-toml/dist/util.js
function skipComment(ctx) {
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      TomlError.x("control characters are not allowed in comments", ctx);
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (ctx.p < ctx.s.length) {
    while (ctx.p < ctx.s.length && ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}

// node_modules/smol-toml/dist/struct.js
function parseKey(ctx, end = 61) {
  let startPtr;
  let state = 0;
  let parsed = [];
  let sliceStart;
  let c = ctx.s.charCodeAt(startPtr = ctx.p);
  do {
    if (c === end) {
      if (!state)
        TomlError.x("unexpected end of key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      return ctx.p++, parsed;
    } else if (c === 46) {
      if (!state)
        TomlError.x("illegal empty bare key", ctx);
      if (state === 1)
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
      state = 0;
    } else if (!state && (c === 34 || c === 39)) {
      if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2))
        TomlError.x("illegal quoted key: multiline strings are not allowed", ctx);
      parsed.push(parseString(ctx));
      state = 2;
      ctx.p--;
    } else if (c === 32 || c === 9) {
      if (state === 1) {
        parsed.push(ctx.s.slice(sliceStart, ctx.p));
        state = 2;
      }
    } else if (state === 2 || c < 48 && c !== 45 || c > 57 && c < 65 || c > 90 && c < 97 && c !== 95 || c > 122) {
      TomlError.x("illegal character in key", ctx);
    } else if (!state) {
      state = 1;
      sliceStart = ctx.p;
    }
  } while (c = ctx.s.charCodeAt(++ctx.p));
  TomlError.x("incomplete key-value: cannot find end of key", ctx, startPtr);
}
function parseInlineTable(ctx) {
  let startPtr = ctx.p++;
  let res = /* @__PURE__ */ Object.create(null);
  let seen = /* @__PURE__ */ new Set();
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let errPtr = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0; i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        TomlError.x("trying to redefine an already defined value", ctx, errPtr);
      }
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor")) {
        t = ctx.uk !== 1 && TomlError.x("document contains an unsafe property", ctx, errPtr);
        break;
      }
      if (!hasOwn && unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      TomlError.x("trying to redefine an already defined value", ctx, errPtr);
    }
    skipVoid(ctx, true, true);
    let value = extractValue(
      ctx,
      125
      /* } */
    );
    if (t && typeof (t[k] = value) === "object")
      seen.add(value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished table", ctx, startPtr);
}
function parseArray(ctx) {
  let startPtr = ctx.p++;
  let res = [];
  let c;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(
      ctx,
      93
      /* ] */
    ));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44)
      TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
  }
  TomlError.x("unfinished array", ctx, startPtr);
}

// node_modules/smol-toml/dist/parse.js
function peekTable(ctx, key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      let unsafe = k === "__proto__";
      if (ctx.uk && (unsafe || k === "constructor"))
        return false;
      if (unsafe) {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: /* @__PURE__ */ Object.create(null)
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = /* @__PURE__ */ Object.create(null));
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: /* @__PURE__ */ Object.create(null) };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function validateTablePeek(ctx, peek, ptr) {
  if (peek === null || ctx.uk === 2)
    TomlError.x(peek === null ? "trying to redefine an already defined table or value" : "document contains an unsafe property", ctx, ptr);
}
function parse(toml, options = {}) {
  let ctx = {
    s: toml,
    p: 0,
    d: options.maxDepth ?? 1e3,
    bi: options.integersAsBigInt ?? false,
    ld: options.useLegacyDate ?? true,
    uk: options.unsafeKeyBehaviour === "throw" ? 2 : options.unsafeKeyBehaviour === "drop" ? 1 : 0
  };
  let res = /* @__PURE__ */ Object.create(null);
  let meta = /* @__PURE__ */ Object.create(null);
  let tmp;
  let skipping = false;
  let tbl = res;
  let m = meta;
  if (toml.charCodeAt(0) === 65279)
    ctx.p++;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      skipping = false;
      let k = parseKey(
        ctx,
        93
        /* ] */
      );
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p) !== 93) {
          TomlError.x("expected end of table array declaration", ctx);
        }
        ctx.p++;
      }
      let p = peekTable(
        ctx,
        k,
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        validateTablePeek(ctx, p, tmp);
        skipping = true;
      } else {
        m = p[2];
        tbl = p[1];
      }
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(
        ctx,
        k,
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p && !skipping)
        validateTablePeek(ctx, p, tmp);
      skipVoid(ctx, true, true);
      let v = extractValue(ctx, void 0);
      if (p && !skipping)
        p[1][p[0]] = v;
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && (tmp !== 13 || toml.charCodeAt(ctx.p + 1) !== 10)) {
      TomlError.x("each key-value declaration must be followed by an end-of-line", ctx);
    }
    skipVoid(ctx);
  }
  return res;
}

// node_modules/smol-toml/dist/stringify.js
var HAS_WELLFORMED = !!"".isWellFormed;

// plugins/sidecut-solo/server/src/helper/lib/git.ts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync as existsSync3,
  lstatSync,
  readdirSync as readdirSync2,
  readFileSync as readFileSync2,
  readlinkSync,
  realpathSync
} from "node:fs";
import { isAbsolute, join as join3, normalize, resolve } from "node:path";
var WorkflowError = class extends Error {
};
function spawn(argv, cwd2, input, timeoutMs = 3e4) {
  try {
    const [command, ...args] = argv;
    if (!command) throw new WorkflowError("Missing command");
    const result = spawnSync(command, args, {
      cwd: cwd2,
      env: process.env,
      input,
      stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"],
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024
    });
    if (result.error?.code === "ETIMEDOUT")
      throw new WorkflowError(command + " timed out");
    if (result.error) throw result.error;
    return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError(`${argv[0]}: ${error.message}`);
  }
}
function gitRun(repo, args, input) {
  return spawn(["git", "-C", repo, ...args], void 0, input);
}
function git(repo, args, strip = true) {
  const result = gitRun(repo, args);
  if (result.code) throw new WorkflowError(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  return strip ? result.stdout.trim() : result.stdout;
}
function countStatus(raw) {
  const fields = raw.split("\0");
  let changed = 0;
  let untracked = 0;
  for (let index = 0; index < fields.length; index++) {
    const entry = fields[index];
    if (!entry) continue;
    if (entry.startsWith("??")) untracked++;
    else {
      changed++;
      if (/[RC]/.test(entry.slice(0, 2))) index++;
    }
  }
  return { changed, untracked };
}
var WORKTREE_KEYS = /* @__PURE__ */ new Set([
  "worktree",
  "HEAD",
  "branch",
  "bare",
  "detached",
  "locked",
  "prunable"
]);
var C_ESCAPES = {
  a: 7,
  b: 8,
  f: 12,
  n: 10,
  r: 13,
  t: 9,
  v: 11,
  "\\": 92,
  '"': 34
};
var cachedVersion;
function gitVersion() {
  if (cachedVersion) return cachedVersion;
  const result = spawn(["git", "version"]);
  const match = /(\d+)\.(\d+)/.exec(result.stdout);
  if (result.code || !match) {
    throw new WorkflowError(
      `git version: unreadable output ${JSON.stringify(result.stdout.trim())}`
    );
  }
  cachedVersion = [Number(match[1]), Number(match[2])];
  return cachedVersion;
}
function cUnquote(value) {
  if (!(value.length >= 2 && value.startsWith('"') && value.endsWith('"'))) return value;
  const body = value.slice(1, -1);
  const out = [];
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char !== "\\") {
      out.push(...new TextEncoder().encode(char));
      index++;
    } else if (/^[0-3][0-7]{2}$/.test(body.slice(index + 1, index + 4))) {
      out.push(Number.parseInt(body.slice(index + 1, index + 4), 8));
      index += 4;
    } else if (index + 1 < body.length && body[index + 1] in C_ESCAPES) {
      out.push(C_ESCAPES[body[index + 1]]);
      index += 2;
    } else {
      throw new WorkflowError(
        `git worktree list: unreadable quoted value ${JSON.stringify(value)}`
      );
    }
  }
  return new TextDecoder().decode(new Uint8Array(out));
}
function commonDir(repo) {
  return git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}
function worktreeBlocks(root2) {
  const [major, minor] = gitVersion();
  if (major > 2 || major === 2 && minor >= 36) {
    const raw2 = git(root2, ["worktree", "list", "--porcelain", "-z"], false);
    return raw2.split("\0\0").filter(Boolean).map((block) => block.split("\0"));
  }
  const common = commonDir(root2);
  const stored = [common];
  const admin = join3(common, "worktrees");
  if (existsSync3(admin)) {
    for (const name of readdirSync2(admin).sort()) {
      try {
        stored.push(readFileSync2(join3(admin, name, "gitdir"), "utf8").replace(/\n$/, ""));
      } catch {
      }
    }
  }
  if (stored.some((path) => path.includes("\n"))) {
    throw new WorkflowError(
      `git worktree list: Git ${major}.${minor} has no -z and a worktree path contains a newline, so the listing is ambiguous. Upgrade to Git 2.36+ or move that worktree.`
    );
  }
  const raw = git(root2, ["worktree", "list", "--porcelain"], false);
  const blocks = raw.split("\n\n").map((block) => block.split("\n").filter(Boolean)).filter((lines) => lines.length);
  for (const lines of blocks) {
    if (!lines[0]?.startsWith("worktree ") || lines.some((line) => !WORKTREE_KEYS.has(line.split(" ")[0]))) {
      throw new WorkflowError(
        `git worktree list: unexpected porcelain output: ${JSON.stringify(lines)}`
      );
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("locked ")) lines[i] = `locked ${cUnquote(line.slice(7))}`;
    }
  }
  return blocks;
}
function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
function worktrees(root2) {
  const rows = [];
  for (const lines of worktreeBlocks(root2)) {
    const entry = { path: lines[0].slice("worktree ".length), branch: null };
    for (const line of lines.slice(1)) {
      const space = line.indexOf(" ");
      const key = space < 0 ? line : line.slice(0, space);
      const value = space < 0 ? "" : line.slice(space + 1);
      if (key === "HEAD") entry.head = value;
      else if (key === "branch") entry.branch = value.replace(/^refs\/heads\//, "");
      else if (["bare", "detached", "locked", "prunable"].includes(key)) entry[key] = value || true;
    }
    entry.current = realpath(entry.path) === realpath(root2);
    if (entry.bare) entry.files = null;
    else if (!existsSync3(entry.path) || !lstatSync(entry.path).isDirectory()) {
      entry.files = null;
      entry.missing = true;
    } else {
      const raw = git(
        entry.path,
        ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
        false
      );
      entry.files = countStatus(raw);
    }
    rows.push(entry);
  }
  return rows;
}
function sync(track, hasUpstream) {
  if (!hasUpstream) return [null, null, "no upstream"];
  if (track === "gone") return [null, null, "upstream gone"];
  const counts = {};
  for (const part of track.split(", ").filter(Boolean)) {
    const [name, count2] = part.split(" ");
    counts[name] = Number(count2);
  }
  return [counts.ahead ?? 0, counts.behind ?? 0, track || "in sync"];
}
function branches(root2) {
  const format = "%(refname:short)%09%(objectname)%09%(upstream:short)%09%(upstream:track,nobracket)";
  const refs = git(root2, ["for-each-ref", `--format=${format}`, "refs/heads"], false);
  return refs.split("\n").filter(Boolean).map((line) => {
    const [name = "", tip = "", upstream = "", track = ""] = line.split("	");
    const [ahead, behind, state] = sync(track, Boolean(upstream));
    return { branch: name, tip, upstream: upstream || null, ahead, behind, sync: state };
  });
}
var HOST_PATHS = [".claude/worktrees/", ".claude/settings.local.json", ".claude/launch.json"];
var hostPath = (name) => HOST_PATHS.some((path) => path.endsWith("/") ? name.startsWith(path) : name === path);
function inventory(repo) {
  const root2 = realpath(git(repo, ["rev-parse", "--show-toplevel"]));
  let head;
  try {
    head = git(root2, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    head = "(unborn)";
  }
  const branch = git(root2, ["branch", "--show-current"]) || "(detached)";
  const raw = git(root2, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], false).split("\0").filter(Boolean);
  const host = raw.filter((entry) => entry.startsWith("?? ") && hostPath(entry.slice(3)));
  const status = raw.filter((entry) => !host.includes(entry));
  const digest = createHash("sha256");
  digest.update(head);
  digest.update(branch);
  digest.update(status.join("\0"));
  digest.update(git(root2, ["ls-files", "--stage", "-z"], false));
  digest.update(git(root2, ["diff", "--binary"]));
  digest.update(git(root2, ["diff", "--cached", "--binary"]));
  const others = git(root2, ["ls-files", "--others", "--exclude-standard", "-z"], false);
  for (const name of others.split("\0").filter((name2) => name2 && !hostPath(name2)).sort()) {
    const path = join3(root2, name);
    digest.update(name);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) digest.update(readlinkSync(path));
    else if (stat?.isFile()) digest.update(readFileSync2(path));
  }
  return {
    root: root2,
    head,
    branch,
    status,
    host_untracked: host.map((entry) => entry.slice(3)),
    fingerprint: digest.digest("hex"),
    branches: branches(root2),
    worktrees: worktrees(root2),
    remotes: git(root2, ["remote"]).split("\n").filter(Boolean),
    pr_status: "unknown; query the authenticated host provider"
  };
}
function patchIds(repo, patch) {
  const result = gitRun(repo, ["patch-id", "--stable"], patch);
  if (result.code) throw new WorkflowError(`git patch-id: ${result.stderr.trim()}`);
  return new Set(
    result.stdout.split("\n").filter((line) => line.trim()).map((line) => line.split(/\s+/)[0])
  );
}
function mergedBranches(repo, into) {
  const root2 = realpath(git(repo, ["rev-parse", "--show-toplevel"]));
  const target = git(root2, ["rev-parse", "--verify", `${into}^{commit}`]);
  const targetTree = git(root2, ["rev-parse", `${target}^{tree}`]);
  const current = git(root2, ["branch", "--show-current"]);
  const rows = [];
  for (const row of branches(root2)) {
    let status;
    if (gitRun(root2, ["merge-base", "--is-ancestor", row.tip, target]).code === 0) {
      status = "ancestor";
    } else {
      const base = gitRun(root2, ["merge-base", target, row.tip]);
      if (base.code === 1) {
        rows.push({ ...row, status: "unproven", current: row.branch === current });
        continue;
      }
      if (base.code) throw new WorkflowError(`git merge-base: ${base.stderr.trim()}`);
      const baseSha = base.stdout.trim();
      const own = patchIds(root2, git(root2, ["diff", baseSha, row.tip], false));
      const landed = patchIds(
        root2,
        git(root2, ["log", "-p", "--format=commit %H", `${baseSha}..${target}`], false)
      );
      const merge2 = gitRun(root2, ["merge-tree", "--write-tree", target, row.tip]);
      if (merge2.code !== 0 && merge2.code !== 1) {
        throw new WorkflowError(
          `Branch classification needs Git with merge-tree --write-tree support: ${merge2.stderr.trim()}`
        );
      }
      const clean = merge2.code === 0 && merge2.stdout.split("\n", 1)[0] === targetTree;
      if (clean && own.size && [...own].every((id) => landed.has(id))) status = "squash-merged";
      else if (clean) status = "content-in-target";
      else status = "unproven";
    }
    rows.push({ ...row, status, current: row.branch === current });
  }
  return { into, target, branches: rows };
}
var STABLE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
function newer(remote, local) {
  const a = remote.split(".").map(Number);
  const b = local.split(".").map(Number);
  for (let i = 0; i < 3; i++)
    if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
function freshRemoteState(repo, remote = "origin", versionPath) {
  try {
    if (remote.startsWith("-")) throw new WorkflowError("remote must be a remote name or URL");
    const listed = spawn(["git", "-C", repo, "ls-remote", "--symref", remote, "HEAD"]);
    if (listed.code) throw new WorkflowError(listed.stderr.trim() || "cannot query remote HEAD");
    const match = /^ref:\s+(refs\/heads\/\S+)\s+HEAD$/m.exec(listed.stdout);
    if (!match?.[1]) throw new WorkflowError("remote HEAD has no verifiable default branch");
    const branchRef = match[1];
    const fetched = spawn(
      ["git", "-C", repo, "fetch", "--no-tags", remote, branchRef],
      void 0,
      void 0,
      6e4
    );
    if (fetched.code) throw new WorkflowError(fetched.stderr.trim() || "fetch failed");
    const head = git(repo, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
    const output = {
      remote,
      default_branch: branchRef.replace(/^refs\/heads\//, ""),
      fetched_head: head,
      remote_state: "verified"
    };
    if (versionPath !== void 0) {
      const relativePath = normalize(versionPath);
      if (!versionPath || isAbsolute(versionPath) || relativePath.split("/").includes("..")) {
        throw new WorkflowError("version path must stay relative to the repository");
      }
      const local = JSON.parse(readFileSync2(join3(repo, relativePath), "utf8")).version;
      const remoteValue = JSON.parse(git(repo, ["show", `${head}:${relativePath}`])).version;
      if (!STABLE.test(local) || !STABLE.test(remoteValue)) {
        throw new WorkflowError("version comparison needs stable X.Y.Z versions");
      }
      Object.assign(output, {
        version_path: relativePath,
        local_version: local,
        remote_version: remoteValue
      });
      if (newer(remoteValue, local)) {
        throw new WorkflowError(
          `release version collision: remote ${branchRef} is ${remoteValue}, local ${relativePath} is ${local}; bump or reconcile before shipping`
        );
      }
      output.version_gate = "passed";
    }
    return output;
  } catch (error) {
    const message = error.message;
    if (/^(remote state unverified:|release version collision:)/.test(message)) throw error;
    throw new WorkflowError(`remote state unverified: ${message}`);
  }
}

// plugins/sidecut-solo/server/src/helper/lib/review.ts
var REVIEW_POLICIES = ["auto", "deep", "light"];
var DEEP = [
  [
    "sign-in, accounts or secrets",
    [
      /(^|[/_.-])(auth|authn|authz|authenticat\w*|authori[sz]\w*|oauth|oidc|saml|sso|log-?in|log-?out|sign-?in|sign-?up|session|password|passkey|mfa|otp|secret|credential|permission|rbac|acl|crypto|encrypt\w*|decrypt\w*)s?([/_.-]|$)/i,
      // Token code, not design tokens: only source files.
      /(^|[/_.-])(jwt|api-?keys?|tokens?)([/_.-][^/]*)?\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|swift|php)$/i,
      /(^|\/)\.env(\.[^/]+)?$/
    ]
  ],
  [
    "payments or billing",
    [
      /(^|[/_.-])(pay|payment|billing|invoice|checkout|stripe|subscription|price|pricing|refund|wallet)s?([/_.-]|$)/i
    ]
  ],
  [
    "stored data",
    [
      /(^|\/)(migrations?|schema|prisma|drizzle|supabase|db|database)\//i,
      /\.sql$/i,
      /(^|\/)schema\.(prisma|ts|sql|graphql)$/i
    ]
  ],
  [
    "delivery and its guards",
    [
      /(^|\/)\.github\/workflows\//,
      /(^|\/)(plugins\/[^/]+\/hooks|\.husky|\.githooks)\//,
      /^hooks\//,
      /(^|\/)hooks\/hooks\.json$/,
      /^(\.claude\/settings(\.local)?\.json|\.codex\/(config\.toml|hooks\.json))$/,
      /(^|\/)(release|deploy|publish)[^/]*\.[^/]+$/i,
      /^solo-workflow\.toml$/,
      /(^|\/)CODEOWNERS$/,
      /(^|\/)(lefthook\.ya?ml|vercel\.json|wrangler\.(toml|jsonc?)|netlify\.toml|fly\.toml|Dockerfile)$/i
    ]
  ]
];
var LIGHT = [
  /\.(md|mdx|rst|txt)$/i,
  /(^|\/)(LICENSE|NOTICE)$/,
  /(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|go\.sum)$/,
  /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i
];
var LOCKFILE = LIGHT[2];
var INSTRUCTIONS = [
  /(^|\/)(skills|agents|references|rules|prompts|\.claude|\.codex|\.cursor)\/.*\.md$/,
  /(^|\/)(AGENTS|CLAUDE|GEMINI|SECURITY)\.md$/,
  /(^|\/)specification\.md$/i,
  /(^|\/)agents\/[^/]+\.toml$/
];
var LARGE_FILES = 40;
var LARGE_LINES = 1500;
var SMALL_LINES = 10;
function reviewLevel(paths, lines, policy = "auto") {
  const files = [...new Set(paths)];
  const reasons = [];
  for (const [why, res] of DEEP) {
    if (files.some((p) => res.some((re) => re.test(p)))) reasons.push(why);
  }
  if (files.length > LARGE_FILES || lines > LARGE_LINES) reasons.push("a large change");
  let level;
  if (reasons.length || policy === "deep") level = "deep";
  else if (policy === "light" || files.every(
    (p) => (LIGHT.some((re) => re.test(p)) || /(^|\/)package\.json$/.test(p) && files.some((f) => LOCKFILE.test(f))) && !INSTRUCTIONS.some((re) => re.test(p))
  ) || lines <= SMALL_LINES && files.length === 1 && ![...INSTRUCTIONS, /(^|\/)package\.json$/].some((re) => re.test(files[0] ?? ""))) {
    level = "light";
  } else level = "standard";
  if (!reasons.length)
    reasons.push(policy === "auto" ? `${level} by its files and size` : `review = "${policy}"`);
  return { level, reasons, files: files.length, lines };
}

// plugins/sidecut-solo/server/src/helper/lib/config.ts
var LAYERS = ["solo-workflow.toml", "solo-workflow.local.toml"];
var MERGE_POLICIES = ["ask", "when-green", "never"];
var MERGE_METHODS = ["squash", "merge", "rebase"];
var WORKTREE_POLICIES = ["always", "when-overlapping", "never"];
var REVIEW_EFFORTS = ["low", "medium", "high"];
var KEYS = {
  base_branch: "string",
  checks: "table",
  merge: "string",
  merge_method: "string",
  required_checks: "list",
  worktrees: "string",
  protected_paths: "list",
  review: "string",
  review_model: "string",
  codex_review_model: "string",
  review_effort: "string"
};
var DEFAULTS = {
  merge: "ask",
  merge_method: "squash",
  worktrees: "when-overlapping",
  review: "auto",
  review_model: "sonnet",
  review_effort: "medium"
};
var CHOICES = {
  merge: MERGE_POLICIES,
  merge_method: MERGE_METHODS,
  worktrees: WORKTREE_POLICIES,
  review: REVIEW_POLICIES,
  review_effort: REVIEW_EFFORTS
};
function kindOf(value) {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "list";
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return "table";
  }
  return "other";
}
function problems(data, name) {
  const found = [];
  for (const [key, value] of Object.entries(data)) {
    const kind = KEYS[key];
    if (!kind) found.push([key, `${name}: unknown key '${key}'`]);
    else if (kindOf(value) !== kind) found.push([key, `${name}: '${key}' must be a ${kind}`]);
    else if (CHOICES[key] && !CHOICES[key].includes(value)) {
      found.push([key, `${name}: '${key}' must be one of ${CHOICES[key].join(", ")}`]);
    } else if (key === "checks" && !Object.values(value).every((v) => typeof v === "string")) {
      found.push([key, `${name}: every [checks] entry must be a command string`]);
    } else if (kind === "list" && !value.every((v) => typeof v === "string")) {
      found.push([key, `${name}: '${key}' must list strings`]);
    }
  }
  return found;
}
function repoRoot(repo) {
  try {
    return realpathSync2(git(repo, ["rev-parse", "--show-toplevel"]));
  } catch {
    return resolve2(repo);
  }
}
function present(path) {
  return existsSync4(path) || Boolean(lstatSync2(path, { throwIfNoEntry: false })?.isSymbolicLink());
}
function load(repo) {
  const root2 = repoRoot(repo);
  const merged = {};
  const files = [];
  const found = [];
  for (const name of LAYERS) {
    if (!present(join4(root2, name))) continue;
    let data;
    try {
      data = parse(readFileSync3(join4(root2, name), "utf8"));
    } catch (error) {
      found.push(`${name}: can't be read (${error.message})`);
      continue;
    }
    files.push(name);
    const issues = problems(data, name);
    found.push(...issues.map(([, message]) => message));
    const bad = new Set(issues.map(([key]) => key));
    for (const [key, value] of Object.entries(data)) {
      if (bad.has(key)) continue;
      const prior = merged[key];
      merged[key] = kindOf(value) === "table" && kindOf(prior) === "table" ? { ...prior, ...value } : value;
    }
  }
  const defaults = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => !(key in merged)));
  const result = { root: root2, files, config: merged, defaults, problems: found };
  if (!files.length) {
    result.hint = "No settings file; defaults apply. Use Sidecut Solo Setup to save some.";
  }
  return result;
}

// plugins/sidecut-solo/server/src/helper/lib/agents.ts
var SOURCE = join5(pluginRoot, "codex", "agents");
function codexAgents(repo, install) {
  const target = join5(repoRoot(repo), ".codex", "agents");
  const profiles = readdirSync3(SOURCE).filter((name) => name.endsWith(".toml")).sort();
  const rows = profiles.map((name) => {
    const wanted = readFileSync4(join5(SOURCE, name), "utf8");
    const path = join5(target, name);
    if (!existsSync5(path)) return { profile: name, status: "missing" };
    return {
      profile: name,
      status: readFileSync4(path, "utf8") === wanted ? "installed" : "different"
    };
  });
  if (install) {
    mkdirSync2(target, { recursive: true });
    for (const row of rows.filter((item) => item.status === "missing")) {
      writeFileSync(join5(target, row.profile), readFileSync4(join5(SOURCE, row.profile)), {
        flag: "wx"
      });
      row.status = "installed now";
    }
  }
  return {
    directory: target,
    profiles: rows,
    note: rows.some((row) => row.status === "different") ? "Some profiles differ from this Solo version; they were left alone. Compare and decide." : void 0
  };
}

// plugins/sidecut-solo/server/src/helper/lib/authorization.ts
var PUBLICATION_EFFECTS = ["none", "automatic", "unknown"];
var HOST_SCOPES = ["allowed", "approval_required", "unknown"];
function resolveAuthorization(mergePolicy, input) {
  const { userMerge, userPublication, publicationEffect, hostScope } = input;
  for (const [value, choices] of [
    [mergePolicy, MERGE_POLICIES],
    [publicationEffect, PUBLICATION_EFFECTS],
    [hostScope, HOST_SCOPES]
  ]) {
    if (!choices.includes(value)) {
      throw new Error(`Invalid authorization input: ${value}`);
    }
  }
  const mergeAuthorized = mergePolicy !== "never" && (userMerge || mergePolicy === "when-green");
  const missing = [];
  if (!mergeAuthorized && mergePolicy !== "never") missing.push("merge");
  if (publicationEffect === "automatic" && !userPublication) missing.push("publication");
  const unresolved = [];
  if (publicationEffect === "unknown") {
    unresolved.push("Inspect what merging triggers before proceeding");
  }
  if (hostScope === "unknown") {
    unresolved.push("Host permission scope is unknown; use the native tool approval flow");
  }
  return {
    merge_authorized: mergeAuthorized,
    publication_authorized: userPublication,
    missing_user_authorizations: missing,
    merge_vetoed: mergePolicy === "never",
    publication_effect: publicationEffect,
    host_scope: hostScope,
    host_approval_required: hostScope === "approval_required",
    unresolved,
    ready: mergeAuthorized && !missing.length && publicationEffect !== "unknown" && hostScope === "allowed"
  };
}

// plugins/sidecut-solo/server/src/helper/lib/delivery.ts
import { existsSync as existsSync7, lstatSync as lstatSync4, realpathSync as realpathSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join7, resolve as resolve4 } from "node:path";

// plugins/sidecut-solo/server/src/helper/lib/present.ts
function safeText(value) {
  return value.replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]+)\b/g, "[redacted]").replace(/\b(?:Bearer\s+\S+|(?:api[_-]?key|token|password)\s*[:=]\s*\S+)/gi, "[redacted]").replace(
    /(?<![\w/\\])[A-Za-z]:[\\/][^\s<>"']+|\/(?:Users|home|tmp)\/[^\s<>"']+/g,
    "[private path]"
  );
}
function validate(data) {
  const required = ["title", "changed", "checked", "remains", "end_state"];
  const keys = Object.keys(data ?? {});
  if (!required.every((key) => keys.includes(key)) || keys.some((key) => !required.includes(key) && key !== "links")) {
    throw new WorkflowError(
      `Report needs ${[...required].sort().join(", ")} and may add links; nothing else`
    );
  }
  const report2 = data;
  for (const name of ["title", "end_state"]) {
    if (typeof report2[name] !== "string" || !report2[name].trim()) {
      throw new WorkflowError(`Report ${name} must be nonempty text`);
    }
  }
  for (const name of ["changed", "checked", "remains"]) {
    if (!Array.isArray(report2[name]) || !report2[name].every((item) => typeof item === "string")) {
      throw new WorkflowError(`Report ${name} must be a list of text`);
    }
  }
  const links = report2.links ?? [];
  if (!Array.isArray(links) || !links.every(
    (item) => item && typeof item === "object" && Object.keys(item).sort().join() === "label,url" && typeof item.label === "string" && typeof item.url === "string"
  )) {
    throw new WorkflowError("Each link needs exactly a label and a url, as text");
  }
  return report2;
}
function publicUrl(url) {
  try {
    const parts = new URL(url);
    return parts.protocol === "https:" && Boolean(parts.hostname) && !parts.username && !parts.password && !parts.search && !url.includes("?") && !url.includes("#") && ![...url].some((char) => /\s/.test(char) || char.charCodeAt(0) < 32) && safeText(url) === url;
  } catch {
    return false;
  }
}
function textReport(data) {
  const report2 = validate(data);
  const lines = [safeText(report2.title), ""];
  for (const [label, field] of [
    ["Changed", "changed"],
    ["Checked", "checked"],
    ["Remains", "remains"]
  ]) {
    lines.push(`${label}: ${report2[field].map(safeText).join("; ") || "None recorded"}`);
  }
  lines.push(`End state: ${safeText(report2.end_state)}`);
  for (const link of report2.links ?? []) {
    lines.push(safeText(`Link: ${link.label}${publicUrl(link.url) ? ` ${link.url}` : ""}`));
  }
  return `${lines.join("\n")}
`;
}

// plugins/sidecut-solo/server/src/helper/lib/state.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync as existsSync6,
  fsyncSync,
  lstatSync as lstatSync3,
  mkdirSync as mkdirSync3,
  openSync,
  readdirSync as readdirSync4,
  readFileSync as readFileSync5,
  realpathSync as realpathSync3,
  renameSync,
  rmSync,
  writeSync
} from "node:fs";
import { dirname as dirname3, join as join6, resolve as resolve3 } from "node:path";
var RECORD_DIRS = ["solo-workflow"];
var OWNER_MARKERS = RECORD_DIRS.map((name) => `${name}-owner`);
var PHASES = ["explore", "investigate", "plan", "build", "verify", "review", "finish"];
var PHASE_ALIASES = {
  brainstorm: "explore",
  inspect: "investigate",
  qa: "verify"
};
var OPEN = /* @__PURE__ */ new Set(["started", "uncertain"]);
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function atomicJson(path, value) {
  mkdirSync3(dirname3(path), { recursive: true });
  const temp = join6(dirname3(path), `.write-${randomBytes(6).toString("hex")}`);
  try {
    const fd = openSync(temp, "wx", 384);
    try {
      writeSync(fd, `${JSON.stringify(value, null, 2)}
`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}
function owns(record) {
  const stat = lstatSync3(record.path, { throwIfNoEntry: false });
  if (!record.creation_token || !stat || stat.isSymbolicLink() || !stat.isDirectory()) return false;
  let admin;
  try {
    admin = git(record.path, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  } catch {
    return false;
  }
  const marker = OWNER_MARKERS.map((name) => join6(admin, name)).find((path) => existsSync6(path));
  return Boolean(marker) && readFileSync5(marker, "ascii") === record.creation_token;
}
function belongsTo(data, root2) {
  return root2 === data.repo || data.owned_worktrees.some(
    (item) => item.path === root2 && item.status === "created" && owns(item)
  );
}
function defaultTask(repo) {
  const root2 = realpathSync3(git(repo, ["rev-parse", "--show-toplevel"]));
  const legacy = join6(commonDir(repo), RECORD_DIRS[0], "default", "task.json");
  try {
    if (belongsTo(JSON.parse(readFileSync5(legacy, "utf8")), root2)) return "default";
  } catch {
  }
  const digest = createHash2("sha256").update(root2).digest("hex");
  return `default-${digest.slice(0, 12)}`;
}
function uncertain(data) {
  return Object.values(data.actions).some((action) => OPEN.has(action.status)) || OPEN.has(data.merge_intent?.status ?? "");
}
function priorEndState(data) {
  for (const item of [...data.reconciliations].reverse()) {
    if ("resolution" in item) break;
    const prior = item.prior_end_state;
    if (prior && prior !== "needs_reconciliation") return prior;
  }
  return "in_progress";
}
function finished(data) {
  if (uncertain(data)) return false;
  if (data.end_state === "merged") return true;
  return data.end_state === "needs_reconciliation" && priorEndState(data) === "merged";
}
function unstartedMerge(data) {
  return /^Merge PR \S+$/.test(data.goal) && !data.merge_intent && !data.merge_history?.length && Object.keys(data.actions).length === 0 && data.increments.length === 0 && data.evidence.length === 0 && data.owned_worktrees.length === 0;
}
var Store = class {
  repo;
  directory;
  others;
  path;
  lock;
  constructor(repo, task) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(task)) {
      throw new WorkflowError("Task ID must be a bounded filename, not a path");
    }
    this.repo = existsSync6(repo) ? realpathSync3(repo) : resolve3(repo);
    const common = commonDir(repo);
    const candidates2 = RECORD_DIRS.map((name) => join6(common, name, task));
    const existing = candidates2.filter((path) => existsSync6(path));
    if (existing.length > 1) {
      throw new WorkflowError(
        "Ambiguous task records: current and older record directories both exist"
      );
    }
    this.directory = existing[0] ?? candidates2[0];
    this.others = candidates2.filter((path) => path !== this.directory);
    this.path = join6(this.directory, "task.json");
    this.lock = join6(this.directory, "writer.lock");
  }
  acquire() {
    if (this.others.some((path) => existsSync6(path))) {
      throw new WorkflowError(
        "Task directory changed or is ambiguous; inspect both records before resuming"
      );
    }
    mkdirSync3(this.directory, { recursive: true });
    let fd;
    try {
      fd = openSync(this.lock, "wx", 384);
    } catch {
      throw new WorkflowError(
        `Writer lock exists: ${this.lock}. Verify the owner stopped before removing it.`
      );
    }
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, created_at: now() }));
    } finally {
      closeSync(fd);
    }
  }
  release() {
    rmSync(this.lock, { force: true });
  }
  writer(body) {
    this.acquire();
    try {
      return body();
    } finally {
      this.release();
    }
  }
  async writerAsync(body) {
    this.acquire();
    try {
      return await body();
    } finally {
      this.release();
    }
  }
  exists() {
    return existsSync6(this.path);
  }
  /** Other task records here with an uncertain action or merge, or awaiting reconciliation. */
  openElsewhere() {
    const common = commonDir(this.repo);
    const names = [];
    for (const dir of RECORD_DIRS) {
      const base = join6(common, dir);
      if (!existsSync6(base)) continue;
      for (const name of readdirSync4(base)) {
        const path = join6(base, name, "task.json");
        if (path === this.path || !existsSync6(path)) continue;
        try {
          const data = JSON.parse(readFileSync5(path, "utf8"));
          if (finished(data) || unstartedMerge(data)) continue;
          if (data.end_state === "needs_reconciliation" || uncertain(data)) names.push(name);
        } catch {
          names.push(name);
        }
      }
    }
    return names.sort();
  }
  load() {
    let text;
    try {
      text = readFileSync5(this.path, "utf8");
    } catch {
      const name = this.directory.split("/").pop();
      throw new WorkflowError(
        `No task record for '${name}'. Merge requires task state even for a short task. If the task already exists, use its original --task ID and resume; otherwise run:
` + [
          "sh",
          join6(pluginRoot, "server", "data", "helper", "solo"),
          "--repo",
          this.repo,
          "--task",
          name,
          "start",
          "Describe this task"
        ].map(shellQuote).join(" ")
      );
    }
    const data = JSON.parse(text);
    if (data.schema_version !== 1) {
      throw new WorkflowError("Unsupported task schema; preserve and migrate explicitly");
    }
    const root2 = inventory(this.repo).root;
    if (!belongsTo(data, root2)) {
      const name = this.directory.split("/").pop();
      throw new WorkflowError(
        `Task record '${name}' belongs to another worktree (${data.repo}), not ${root2}. Run the command from there, or pick a new --task ID for work in this worktree.`
      );
    }
    return data;
  }
  save(data) {
    atomicJson(this.path, data);
  }
  start(goal, constraints, budget) {
    return this.writer(() => {
      if (existsSync6(this.path))
        throw new WorkflowError("Task exists; use resume instead of overwriting");
      if (!goal.trim() || budget !== void 0 && budget < 1) {
        throw new WorkflowError("Goal required and increment budget must be positive");
      }
      const actual = inventory(this.repo);
      const data = {
        schema_version: 1,
        repo: actual.root,
        goal,
        constraints,
        budget_increments: budget ?? null,
        phase: "investigate",
        next_action: "Choose one bounded increment",
        created_at: now(),
        updated_at: now(),
        snapshot: actual,
        increments: [],
        actions: {},
        evidence: [],
        owned_worktrees: [],
        reconciliations: [],
        end_state: "in_progress"
      };
      this.save(data);
      return data;
    });
  }
  resume() {
    return this.writer(() => {
      const data = this.load();
      const actual = inventory(this.repo);
      const stale = actual.fingerprint !== data.snapshot.fingerprint;
      const pending = Object.entries(data.actions).filter(([, action]) => OPEN.has(action.status)).map(([key]) => key);
      const intent = data.merge_intent;
      const uncertainMerge = Boolean(intent && OPEN.has(intent.status));
      const reconciliation = {
        at: now(),
        prior_end_state: data.end_state,
        stale,
        uncertain_actions: pending,
        uncertain_merge: uncertainMerge ? { ...intent } : null,
        prior_head: data.snapshot.head,
        actual_head: actual.head,
        ci: "unknown; re-check CI"
      };
      data.reconciliations.push(reconciliation);
      data.snapshot = actual;
      data.updated_at = now();
      if (stale || pending.length || uncertainMerge || data.end_state === "needs_reconciliation") {
        data.end_state = "needs_reconciliation";
      }
      this.save(data);
      return { reconciliation, task: data };
    });
  }
  reconcile(evidence) {
    if (!evidence.trim()) throw new WorkflowError("Describe observed effects and preserved work");
    return this.writer(() => {
      const data = this.load();
      let endState = data.end_state;
      if (endState === "needs_reconciliation") endState = priorEndState(data);
      endState = endState === "merged" && !uncertain(data) ? "merged" : "in_progress";
      for (const action of Object.values(data.actions)) {
        if (OPEN.has(action.status))
          Object.assign(action, { status: "reconciled", resolution: evidence });
      }
      const intent = data.merge_intent;
      if (intent && OPEN.has(intent.status)) {
        Object.assign(intent, { status: "reconciled", resolution: evidence });
        data.merge_history = [...data.merge_history ?? [], intent];
        delete data.merge_intent;
      }
      data.reconciliations.push({ at: now(), resolution: evidence });
      Object.assign(data, {
        snapshot: inventory(this.repo),
        end_state: endState,
        updated_at: now()
      });
      this.save(data);
      return data;
    });
  }
  checkpoint(phase, nextAction, acceptance) {
    const name = PHASE_ALIASES[phase] ?? phase;
    if (!PHASES.includes(name)) throw new WorkflowError("Unknown phase");
    if (!nextAction.trim() || !acceptance.trim()) {
      throw new WorkflowError("Next action and acceptance criteria required");
    }
    return this.writer(() => {
      const data = this.load();
      if (data.end_state === "needs_reconciliation" || uncertain(data)) {
        throw new WorkflowError("Reconcile uncertain work before checkpointing");
      }
      if (inventory(this.repo).fingerprint !== data.snapshot.fingerprint) {
        throw new WorkflowError("Working state changed; resume and reconcile before checkpointing");
      }
      const limit = data.budget_increments;
      if (limit !== null && data.increments.length >= limit) {
        throw new WorkflowError("Increment budget exhausted; revisit scope with user");
      }
      data.increments.push({ phase: name, next_action: nextAction, acceptance, at: now() });
      Object.assign(data, {
        phase: name,
        end_state: name === "build" ? "in_progress" : data.end_state,
        next_action: nextAction,
        updated_at: now(),
        snapshot: inventory(this.repo)
      });
      this.save(data);
      return data;
    });
  }
};
function shellQuote(value) {
  return /^[\w./=:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

// plugins/sidecut-solo/server/src/helper/lib/delivery.ts
var REVIEWERS = ["same-agent", "independent", "user"];
var PROVEN = ["ancestor", "squash-merged", "content-in-target", "pr-merged"];
var BUCKETS = {
  success: "pass",
  failure: "fail",
  error: "fail",
  timed_out: "fail",
  action_required: "fail",
  startup_failure: "fail",
  stale: "fail",
  cancelled: "cancel",
  skipped: "skipping",
  neutral: "skipping",
  pending: "pending"
};
var testHooks = {};
function gh(repo, args, okCodes = [0], timeoutMs = 6e4) {
  let result;
  try {
    result = spawn(["gh", ...args], repo, void 0, timeoutMs);
  } catch (error) {
    throw new WorkflowError(`GitHub check data unavailable: ${error.message}`);
  }
  if (!okCodes.includes(result.code) || !result.stdout.trim()) {
    const detail = result.stderr.trim() || `exit ${result.code}`;
    if (/unknown flag|unknown json field/i.test(detail)) {
      throw new WorkflowError(
        `Installed GitHub CLI lacks a required command option or JSON field: ${detail}`
      );
    }
    throw new WorkflowError(`GitHub query failed: ${detail}`);
  }
  return JSON.parse(result.stdout);
}
function markPrMerged(repo, result) {
  const unproven = result.branches.filter((row) => row.status === "unproven");
  if (!unproven.length) return result;
  let base = result.into;
  for (const remote of git(repo, ["remote"]).split("\n").filter(Boolean)) {
    if (base.startsWith(`${remote}/`)) base = base.slice(remote.length + 1);
  }
  let prs;
  try {
    const pages = gh(repo, [
      "api",
      "--paginate",
      "--slurp",
      `repos/{owner}/{repo}/pulls?state=closed&base=${encodeURIComponent(base)}&per_page=100`
    ]);
    prs = pages.flat().filter((pr) => pr.merged_at).map((pr) => ({
      number: pr.number,
      headRefOid: pr.head?.sha,
      mergeCommit: pr.merge_commit_sha ? { oid: pr.merge_commit_sha } : null
    }));
  } catch (error) {
    return { ...result, pr_lookup: `unavailable: ${error.message}` };
  }
  const heads = new Map(prs.map((pr) => [pr.headRefOid, pr]));
  for (const row of unproven) {
    const pr = heads.get(row.tip);
    const mergeCommit = pr?.mergeCommit?.oid;
    if (!mergeCommit) continue;
    if (gitRun(repo, ["merge-base", "--is-ancestor", mergeCommit, result.target]).code) continue;
    Object.assign(row, { status: "pr-merged", pr: pr.number });
  }
  return { ...result, pr_lookup: `checked ${prs.length} merged PRs into ${base}` };
}
function deleteMerged(repo, into, names) {
  if (!names.length) throw new WorkflowError("Name the branches to delete");
  const result = markPrMerged(repo, mergedBranches(repo, into));
  const rows = new Map(result.branches.map((row) => [row.branch, row]));
  const checkedOut = new Set(
    worktrees(repo).map((tree) => tree.branch).filter(Boolean)
  );
  const target = gitRun(repo, ["rev-parse", "--symbolic-full-name", into]).stdout.trim() || into;
  const selected = [...new Set(names)];
  const refused = [];
  for (const name of selected) {
    const row = rows.get(name);
    if (!row) refused.push(`${name}: no such local branch`);
    else if (target === `refs/heads/${name}`) refused.push(`${name}: it is the target`);
    else if (checkedOut.has(name)) refused.push(`${name}: checked out in a worktree`);
    else if (!PROVEN.includes(row.status))
      refused.push(`${name}: ${row.status}, not proven to be in ${into}`);
  }
  if (refused.length) throw new WorkflowError(`Deleted nothing. ${refused.join("; ")}`);
  const transaction = ["start"];
  if (target.startsWith("refs/")) transaction.push(`verify ${target} ${result.target}`);
  for (const name of selected) transaction.push(`delete refs/heads/${name} ${rows.get(name)?.tip}`);
  transaction.push("prepare", "commit");
  testHooks.beforeRefTransaction?.();
  const completed = gitRun(repo, ["update-ref", "--stdin"], `${transaction.join("\n")}
`);
  if (completed.code) {
    throw new WorkflowError(`Deleted nothing. Ref transaction failed: ${completed.stderr.trim()}`);
  }
  const deleted = [];
  const cleanupErrors = [];
  for (const name of selected) {
    const row = rows.get(name);
    const cleanup = gitRun(repo, ["config", "--remove-section", `branch.${name}`]);
    if (cleanup.code !== 0 && cleanup.code !== 5) {
      cleanupErrors.push({ branch: name, error: cleanup.stderr.trim() || `exit ${cleanup.code}` });
    }
    deleted.push({
      branch: name,
      tip: row?.tip,
      status: row?.status,
      restore: `git branch ${name} ${row?.tip}`
    });
  }
  return { into, deleted, cleanup_errors: cleanupErrors, pr_lookup: result.pr_lookup };
}
function validatePr(pr) {
  if (!/^[1-9][0-9]*$/.test(pr) && !/^https:\/\/[a-zA-Z0-9.-]+\/[\w.-]+\/[\w.-]+\/pull\/[1-9][0-9]*$/.test(pr)) {
    throw new WorkflowError("PR must be a positive number or an HTTPS pull-request URL");
  }
}
function prApi(pr) {
  const url = pr.match(/^https:\/\/([^/]+)\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/);
  const repoPath = url ? `repos/${url[2]}/${url[3]}` : "repos/{owner}/{repo}";
  const hostname = url?.[1];
  return {
    host: hostname && hostname !== "github.com" ? ["--hostname", hostname] : [],
    repoPath,
    prPath: `${repoPath}/pulls/${url ? url[4] : pr}`
  };
}
function viewPr(repo, pr) {
  const api = prApi(pr);
  const raw = gh(repo, ["api", ...api.host, api.prPath]);
  return {
    number: raw?.number,
    url: raw?.html_url,
    headRefOid: raw?.head?.sha,
    baseRefName: raw?.base?.ref,
    state: raw?.merged_at ? "MERGED" : String(raw?.state ?? "").toUpperCase(),
    mergeable: raw?.mergeable === true ? "MERGEABLE" : raw?.mergeable === false ? "CONFLICTING" : "UNKNOWN",
    mergeStateStatus: String(raw?.mergeable_state ?? "unknown").toUpperCase(),
    mergeCommit: raw?.merged_at && raw.merge_commit_sha ? { oid: raw.merge_commit_sha } : null
  };
}
function commitChecks(repo, pr, sha) {
  const api = prApi(pr);
  const commit = `${api.repoPath}/commits/${sha}`;
  const pages = gh(repo, [
    "api",
    ...api.host,
    "--paginate",
    "--slurp",
    `${commit}/check-runs?per_page=100`
  ]);
  const runs = pages.flatMap((page) => page?.check_runs ?? []).map((run2) => {
    const done = run2.status === "completed";
    const outcome = String((done ? run2.conclusion : run2.status) ?? "").toLowerCase();
    return {
      name: run2.name,
      state: outcome.toUpperCase(),
      bucket: done ? BUCKETS[outcome] ?? "fail" : "pending",
      link: run2.html_url ?? ""
    };
  });
  const combined = gh(repo, ["api", ...api.host, `${commit}/status?per_page=100`]);
  const statuses = (combined?.statuses ?? []).map((status) => ({
    name: status.context,
    state: String(status.state ?? "").toUpperCase(),
    bucket: BUCKETS[status.state] ?? "fail",
    link: status.target_url ?? ""
  }));
  return [...runs, ...statuses];
}
function protectedChecks(repo, pr, base) {
  const api = prApi(pr);
  const path = `${api.repoPath}/branches/${encodeURIComponent(base)}/protection/required_status_checks`;
  let required;
  try {
    required = gh(repo, ["api", ...api.host, path]);
  } catch (error) {
    if (/HTTP 404/.test(error.message)) return [];
    throw error;
  }
  return [
    .../* @__PURE__ */ new Set([
      ...required?.contexts ?? [],
      ...(required?.checks ?? []).map((check) => check.context)
    ])
  ];
}
function collectChecks(repo, pr, require2 = [], reviewedHead) {
  validatePr(pr);
  if (reviewedHead !== void 0 && !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(reviewedHead)) {
    throw new WorkflowError("--reviewed-head must be the full commit SHA you reviewed");
  }
  const before = viewPr(repo, pr);
  if (reviewedHead !== void 0 && before.headRefOid !== reviewedHead) {
    throw new WorkflowError(
      `PR head moved: it is ${before.headRefOid}, not the reviewed head ${reviewedHead}. Review the new head before relying on its checks.`
    );
  }
  const names = require2.length ? require2 : protectedChecks(repo, pr, before.baseRefName);
  const checks = commitChecks(repo, pr, before.headRefOid).filter(
    (check) => names.includes(check.name)
  );
  const seen = new Set(checks.map((check) => check.name));
  for (const name of names) {
    if (!seen.has(name)) checks.push({ name, state: "MISSING", bucket: "missing", link: "" });
  }
  const after = viewPr(repo, pr);
  if (before.headRefOid !== after.headRefOid)
    throw new WorkflowError("PR head changed during check collection");
  return {
    head: after.headRefOid,
    ...reviewedHead === void 0 ? {} : { reviewed_head: reviewedHead },
    observed_at: now(),
    source: "live-gh",
    policy: require2.length ? "local-require" : "branch-protection",
    pr: after,
    required_checks: checks
  };
}
function gate(head, evidence, authorized, review, maxAgeSeconds = 300) {
  const reasons = [];
  if (!authorized) reasons.push("merge authorization missing");
  if (evidence?.source !== "live-gh") {
    reasons.push("live GitHub check results required; fixture data cannot authorize a merge");
  }
  if (evidence?.head !== head) reasons.push("CI results are for a different commit than HEAD");
  const stamp = evidence?.observed_at;
  const iso = typeof stamp === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(stamp);
  const observed = iso ? Date.parse(stamp) : Number.NaN;
  if (Number.isNaN(observed)) reasons.push("CI observation time missing or invalid");
  else {
    const age = (Date.now() - observed) / 1e3;
    if (!(age >= 0 && age <= maxAgeSeconds))
      reasons.push("CI results are stale or timestamped in the future");
  }
  const checks = evidence?.required_checks;
  if (!Array.isArray(checks) || !checks.length) reasons.push("required check set empty or unknown");
  else {
    const names = /* @__PURE__ */ new Set();
    for (const check of checks) {
      if (!check?.name || names.has(check.name) || check.state !== "SUCCESS" || check.bucket !== "pass") {
        reasons.push("required checks are missing, duplicated or not successful");
      }
      names.add(check?.name);
    }
  }
  const pr = evidence?.pr ?? {};
  if (pr.headRefOid !== head || pr.state !== "OPEN") reasons.push("PR is not open at current HEAD");
  if (pr.mergeable !== "MERGEABLE" || pr.mergeStateStatus !== "CLEAN") {
    reasons.push("PR mergeability is not confirmed clean");
  }
  if (review.head !== head) reasons.push("review does not cover current HEAD");
  reasons.push(...reviewProblems(review));
  return { allowed: !reasons.length, reasons, head };
}
function reviewProblems(review) {
  const reasons = [];
  if (!REVIEWERS.includes(review.reviewer ?? "")) {
    reasons.push("review must disclose reviewer as same-agent, independent or user");
  }
  const found = review.blocking_findings;
  if (typeof found !== "number" || !Number.isInteger(found) || found < 0)
    reasons.push(
      "review must state its blocking findings as a whole number (--blocking-findings <n>)"
    );
  else if (found) reasons.push(`review has ${found} unresolved blocking findings`);
  if (!review.notes) reasons.push("review file needs notes on what was reviewed");
  return reasons;
}
function headElsewhere(repo, pr, head, prHead) {
  const mismatch = `HEAD here is ${head.slice(0, 12)}, not PR ${pr}'s head ${prHead.slice(0, 12)}`;
  const there = worktrees(repo).find((tree) => tree.head === prHead && !tree.current);
  return there ? `${mismatch}; it is checked out in ${there.path}: run the merge from there (--repo ${JSON.stringify(there.path)})` : `${mismatch}; check out the PR head, or run from the worktree that has it (--repo <worktree>)`;
}
function merge(store, pr, authorized, review, method = "squash", require2 = [], problems2 = []) {
  if (!MERGE_METHODS.includes(method)) {
    throw new WorkflowError("Merge method must be squash, merge or rebase");
  }
  return store.writer(() => {
    const data = store.load();
    const actual = inventory(store.repo);
    if (finished(data)) {
      Object.assign(data, { end_state: "merged", snapshot: actual });
    }
    if (unstartedMerge(data) && (data.end_state === "needs_reconciliation" || data.snapshot.fingerprint !== actual.fingerprint)) {
      data.reconciliations.push({
        at: now(),
        resolution: "superseded",
        note: `${data.goal} never started; this record now serves PR ${pr}`
      });
      Object.assign(data, { goal: `Merge PR ${pr}`, end_state: "in_progress", snapshot: actual });
    }
    if (data.end_state === "needs_reconciliation" || Object.values(data.actions).some((a) => a.status === "started" || a.status === "uncertain")) {
      throw new WorkflowError("Reconcile uncertain work before delivery");
    }
    if (data.snapshot.fingerprint !== actual.fingerprint) {
      throw new WorkflowError("Working state changed; resume and reconcile before delivery");
    }
    const reasons = [...problems2];
    if (actual.status.length) {
      const shown = actual.status.slice(0, 3).join(", ");
      const more = actual.status.length > 3 ? ` and ${actual.status.length - 3} more` : "";
      reasons.push(
        `Delivery worktree must be clean (${shown}${more}); preserve user work separately`
      );
    }
    if (problems2.length) {
      reasons.push(
        ...reviewProblems(review),
        "the PR's checks and head are read once these are fixed"
      );
      throw new WorkflowError(`Merge blocked: ${reasons.join("; ")}`);
    }
    let evidence;
    try {
      evidence = collectChecks(store.repo, pr, require2);
    } catch (error) {
      if (!reasons.length) throw error;
      reasons.push(`couldn't read the PR's checks: ${error.message}`);
      throw new WorkflowError(`Merge blocked: ${reasons.join("; ")}`);
    }
    if (evidence.head !== actual.head)
      reasons.push(headElsewhere(store.repo, pr, actual.head, evidence.head));
    reasons.push(...gate(evidence.head, evidence, authorized, review).reasons);
    if (reasons.length) throw new WorkflowError(`Merge blocked: ${reasons.join("; ")}`);
    const intent = {
      pr,
      head: actual.head,
      reviewer: review.reviewer,
      status: "started",
      at: now()
    };
    const prior = data.merge_intent;
    if (prior?.status === "verified") {
      data.merge_history = [...data.merge_history ?? [], prior];
      delete data.merge_intent;
    } else if (prior) {
      throw new WorkflowError("Prior merge intent exists; query provider before any repeat");
    }
    data.merge_intent = intent;
    store.save(data);
    let failure = null;
    try {
      const api = prApi(pr);
      const completed = spawn(
        [
          "gh",
          "api",
          ...api.host,
          "--method",
          "PUT",
          `${api.prPath}/merge`,
          "-f",
          `merge_method=${method}`,
          "-f",
          `sha=${actual.head}`
        ],
        store.repo,
        void 0,
        12e4
      );
      if (completed.code)
        failure = completed.stderr.trim().slice(-2e3) || `exit ${completed.code}`;
    } catch (error) {
      failure = error.message;
    }
    if (failure !== null) {
      Object.assign(intent, { status: "uncertain", error: failure });
      Object.assign(data, { end_state: "needs_reconciliation", updated_at: now() });
      store.save(data);
      throw new WorkflowError(
        "Merge did not confirm success; inspect the provider, then reconcile before retry"
      );
    }
    let after;
    try {
      after = viewPr(store.repo, pr);
      if (after?.state !== "MERGED" || !after.mergeCommit || after.headRefOid !== actual.head) {
        throw new WorkflowError("Post-merge state unconfirmed; do not claim delivery");
      }
    } catch (error) {
      Object.assign(intent, { status: "uncertain", error: error.message.slice(-2e3) });
      Object.assign(data, { end_state: "needs_reconciliation", updated_at: now() });
      store.save(data);
      throw new WorkflowError(
        "Post-merge state unconfirmed; inspect the provider, then reconcile before retry"
      );
    }
    Object.assign(intent, { status: "verified", after });
    data.merge_history = [...data.merge_history ?? [], intent];
    delete data.merge_intent;
    data.evidence.push(evidence);
    Object.assign(data, { end_state: "merged", updated_at: now() });
    store.save(data);
    return after;
  });
}
var BRANCH_NAME = /^[A-Za-z0-9][\w./-]*$/;
function defaultBranch(repo, remote) {
  const local = gitRun(repo, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  if (!local.code) return local.stdout.trim().slice(remote.length + 1);
  const listed = spawn(
    ["git", "-C", repo, "ls-remote", "--symref", remote, "HEAD"],
    void 0,
    void 0,
    6e4
  );
  return /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(listed.stdout)?.[1] ?? "";
}
function push(repo, baseBranch, options = {}) {
  const head = git(repo, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const local = git(repo, ["branch", "--show-current"]);
  const config = (key) => gitRun(repo, ["config", "--get", key]).stdout.trim();
  const trackedRemote = local ? config(`branch.${local}.remote`) : "";
  const trackedRef = local ? config(`branch.${local}.merge`) : "";
  const tracked = Boolean(trackedRemote) && trackedRemote !== "." && trackedRef.startsWith("refs/heads/");
  const remote = options.remote ?? (tracked ? trackedRemote : "origin");
  const branch = options.to ?? (tracked ? trackedRef.slice("refs/heads/".length) : local);
  if (!branch) throw new WorkflowError("Detached HEAD: name the remote branch with --to");
  if (!BRANCH_NAME.test(branch) || gitRun(repo, ["check-ref-format", `refs/heads/${branch}`]).code) {
    throw new WorkflowError(`Not a usable branch name: ${JSON.stringify(branch)}`);
  }
  if (!git(repo, ["remote"]).split("\n").includes(remote)) {
    throw new WorkflowError(`No remote named ${JSON.stringify(remote)}`);
  }
  const base = baseBranch ?? defaultBranch(repo, remote);
  if (base && branch === base) {
    throw new WorkflowError(
      `Refusing to push ${branch}: it is the base branch, which changes only through a merged PR`
    );
  }
  const tip = () => {
    const listed = spawn(
      ["git", "-C", repo, "ls-remote", "--heads", remote, `refs/heads/${branch}`],
      void 0,
      void 0,
      6e4
    );
    if (listed.code) {
      throw new WorkflowError(`Remote ${remote} unreachable: ${listed.stderr.trim()}`);
    }
    return listed.stdout.split(/\s+/)[0] || null;
  };
  const before = tip();
  const setUpstream = Boolean(local) && !tracked;
  const result = { remote, branch, head, before, after: before, status: "up-to-date" };
  if (before === head) return result;
  let pushed;
  try {
    pushed = spawn(
      [
        "git",
        "-C",
        repo,
        "push",
        ...setUpstream ? ["--set-upstream"] : [],
        remote,
        `HEAD:refs/heads/${branch}`
      ],
      void 0,
      void 0,
      6e5
    );
  } catch (error) {
    throw new WorkflowError(
      `${error.message}; the remote may or may not have moved. Run push again: it reads the remote first`
    );
  }
  if (pushed.code) {
    const tail2 = (text) => safeText(text.trim()).split("\n").slice(-20).join("\n").slice(-1e3);
    const detail = [pushed.stdout, pushed.stderr].map(tail2).filter(Boolean).join("\n");
    throw new WorkflowError(`Push refused (exit ${pushed.code}):
${detail}`);
  }
  const after = tip();
  if (after !== head) {
    throw new WorkflowError(
      `Push unconfirmed: ${remote}/${branch} is at ${after ?? "no such branch"}, HEAD is ${head}`
    );
  }
  return { ...result, after, status: "pushed", upstream_set: setUpstream };
}
function createWorktree(store, destination, ref) {
  const path = resolve4(destination);
  if (existsSync7(path)) throw new WorkflowError("Task worktree destination must not exist");
  return store.writer(() => {
    const data = store.load();
    const oid = git(store.repo, ["rev-parse", "--verify", `${ref}^{commit}`]);
    const record = {
      path,
      created_from: oid,
      status: "creating",
      at: now(),
      creation_token: crypto.randomUUID().replaceAll("-", "")
    };
    data.owned_worktrees.push(record);
    store.save(data);
    git(store.repo, ["worktree", "add", "--detach", path, oid]);
    record.path = realpathSync4(path);
    const admin = git(record.path, ["rev-parse", "--path-format=absolute", "--git-dir"]);
    writeFileSync2(join7(admin, "solo-workflow-owner"), record.creation_token, "ascii");
    record.status = "created";
    Object.assign(data, { snapshot: inventory(record.path), updated_at: now() });
    store.save(data);
    return record;
  });
}
function cleanupWorktree(store, destination, preservedRef) {
  const path = existsSync7(destination) ? realpathSync4(destination) : resolve4(destination);
  return store.writer(() => {
    const data = store.load();
    const owned = data.owned_worktrees.find(
      (item) => item.path === path && item.status === "created"
    );
    if (!owned || path === store.repo || lstatSync4(path, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new WorkflowError("Cleanup limited to this task's recorded worktrees");
    }
    const before = inventory(path);
    if (!owns(owned))
      throw new WorkflowError("Worktree creation identity changed; preserve replacement worktree");
    if (git(path, ["status", "--porcelain", "--untracked-files=all", "--ignored"])) {
      throw new WorkflowError("Worktree has tracked, untracked or ignored work; preserve first");
    }
    const durableRef = git(store.repo, ["rev-parse", "--symbolic-full-name", preservedRef]);
    if (!durableRef.startsWith("refs/heads/") && !durableRef.startsWith("refs/tags/")) {
      throw new WorkflowError(
        "Preservation requires a named local branch or tag, not HEAD or a SHA"
      );
    }
    const target = git(store.repo, ["rev-parse", "--verify", `${durableRef}^{commit}`]);
    if (gitRun(store.repo, ["merge-base", "--is-ancestor", before.head, target]).code) {
      throw new WorkflowError(
        `Worktree HEAD ${before.head} is not contained in ${durableRef}; anchor its commits before cleanup`
      );
    }
    git(store.repo, ["worktree", "remove", path]);
    const listing = git(store.repo, ["worktree", "list", "--porcelain"]);
    const slash = (item) => item.replaceAll("\\", "/");
    const spellings = new Set([path, resolve4(destination)].map(slash));
    const listed = listing.split("\n").map((line) => slash(line.replace(/^worktree /, "")));
    if (existsSync7(path) || listed.some((item) => spellings.has(item))) {
      throw new WorkflowError("Cleanup postcondition failed");
    }
    if (git(store.repo, ["rev-parse", `${durableRef}^{commit}`]) !== target) {
      throw new WorkflowError(
        "Preservation reference changed during cleanup; investigate immediately"
      );
    }
    Object.assign(owned, { status: "removed", preserved_at: target, removed_at: now() });
    store.save(data);
    return owned;
  });
}

// plugins/sidecut-solo/server/src/helper/lib/docs.ts
import { existsSync as existsSync9, readdirSync as readdirSync6, readFileSync as readFileSync7, statSync as statSync2 } from "node:fs";
import { dirname as dirname4, join as join9, normalize as normalize2, relative } from "node:path";

// plugins/sidecut-solo/server/src/helper/lib/names.ts
import { existsSync as existsSync8, readdirSync as readdirSync5, readFileSync as readFileSync6, statSync } from "node:fs";
import { basename, join as join8 } from "node:path";
var BARE_SKILLS = {
  dogfood: "solo-compare-plugin",
  "improve-workflow": "solo-prevent-mistake",
  "design-review": "solo-review-design",
  troubleshoot: "solo-diagnose-problem",
  investigate: "solo-diagnose-problem",
  explore: "solo-research-topic",
  decide: "solo-choose-approach",
  research: "solo-research-topic",
  plan: "solo-plan-change",
  build: "solo-build-change",
  review: "solo-review-code",
  verify: "solo-test-behavior",
  finish: "solo-deliver-change",
  setup: "solo-configure-project",
  status: "solo-list-work"
};
var COMMON_WORDS = /* @__PURE__ */ new Set([
  "explore",
  "decide",
  "research",
  "plan",
  "build",
  "review",
  "verify",
  "finish",
  "setup",
  "status"
]);
var RETIRED_PLUGINS = ["sidecut-solo-workflow", "solo-workflow"];
var RETIRED_DISPLAY = ["Sidecut Solo Workflow", "Solo Workflow"];
var RETIRED_HELPERS = ["scripts/solo.ts"];
var CURRENT_AFTER = /^(?:\.toml|\.local\.toml|:start|:end|-owner| marker|\/(?:TASK|<task>))/;
var CURRENT_DIR = /(?:\.git\/|state\/|\)\/|_HOME\/|\$\{?[A-Z_]*STATE[A-Z_]*\}?\/)$/;
function manifest() {
  const data = JSON.parse(readFileSync6(join8(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const name = String(data.name);
  const repository = String(data.repository ?? "").replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const skills = readdirSync5(join8(pluginRoot, "skills")).filter(
    (entry) => existsSync8(join8(pluginRoot, "skills", entry, "SKILL.md"))
  );
  const agentDir = join8(pluginRoot, "codex", "agents");
  const agents = (existsSync8(agentDir) ? readdirSync5(agentDir) : []).filter((entry) => entry.endsWith(".toml")).map((entry) => entry.replace(/\.toml$/, ""));
  const owner = repository.split("/")[0] || "SidecutStudio";
  return {
    name,
    repository,
    owner,
    helper: `plugins/${name}/server/data/helper/solo`,
    skills,
    agents
  };
}
function candidates(root2) {
  let listed;
  try {
    listed = git(root2, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], false).split("\0").filter(Boolean);
  } catch {
    listed = ["AGENTS.md", "CLAUDE.md", ".agents/plugins/marketplace.json"];
  }
  return [...new Set(listed)].filter((path) => {
    if (path.includes("node_modules/") || /(^|\/)CHANGELOG[^/]*$/i.test(path)) return false;
    if (path.includes("/server/data/helper/")) return false;
    if (/^\.(agents|claude|codex)\//.test(path)) return true;
    if (path.endsWith(".md")) return true;
    return /solo/i.test(basename(path));
  });
}
function scan(text, current) {
  const known = /* @__PURE__ */ new Set([...current.skills, ...current.agents]);
  const hits = [];
  const taken = [];
  const add = (at, found, use) => {
    if (taken.some(([start, end]) => at < end && at + found.length > start)) return;
    taken.push([at, at + found.length]);
    hits.push({ at, found, use });
  };
  for (const [old, now2] of SOLO_SKILL_ALIASES) {
    if (old === now2 || known.has(old) || RETIRED_PLUGINS.includes(old)) continue;
    for (const match of text.matchAll(new RegExp(`(?<![\\w/-])${old}(?![\\w-])`, "g"))) {
      add(match.index, old, now2);
    }
  }
  for (const old of RETIRED_PLUGINS) {
    for (const match of text.matchAll(new RegExp(`(?<![\\w-])${old}(?![\\w-])`, "g"))) {
      const after = text.slice(match.index + old.length);
      const before = text.slice(Math.max(0, match.index - 60), match.index);
      if (CURRENT_AFTER.test(after)) continue;
      if (after.startsWith("/") && CURRENT_DIR.test(before)) continue;
      const owner = /github\.com\/([\w.-]+)\/$/.exec(before)?.[1] ?? new RegExp(`(?<![\\w./$-])(${current.owner})\\/$`).exec(before)?.[1];
      if (owner) {
        add(match.index - owner.length - 1, `${owner}/${old}`, current.repository);
      } else add(match.index, old, `${current.name} (plugin) or solo (router skill)`);
    }
  }
  for (const old of RETIRED_DISPLAY) {
    for (const match of text.matchAll(new RegExp(`\\b${old}\\b`, "g"))) {
      add(match.index, old, "Sidecut Solo");
    }
  }
  for (const old of RETIRED_HELPERS) {
    for (const match of text.matchAll(new RegExp(`(?<![\\w-])${old.replace(".", "\\.")}`, "g"))) {
      add(match.index, old, current.helper);
    }
  }
  for (const match of text.matchAll(/`([a-z][a-z-]*[a-z])`( skill)?/g)) {
    const [, name = "", skill] = match;
    const old = BARE_SKILLS[name];
    if (old && (!COMMON_WORDS.has(name) || skill)) add(match.index, name, old);
    else if (skill && name.startsWith("solo-") && !known.has(name)) {
      add(match.index, name, "a skill in this Solo version");
    }
  }
  return hits.map((hit) => ({
    line: text.slice(0, hit.at).split("\n").length,
    found: hit.found,
    use: hit.use
  }));
}
function retiredNames(repo) {
  const root2 = repoRoot(repo);
  const current = manifest();
  const files = candidates(root2);
  const findings = [];
  for (const file of files) {
    const path = join8(root2, file);
    let text;
    try {
      if (!statSync(path).isFile() || statSync(path).size > 1e6) continue;
      text = readFileSync6(path, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    for (const hit of scan(text, current)) findings.push({ file, ...hit });
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    plugin: {
      name: current.name,
      repository: current.repository,
      helper: current.helper,
      skills: current.skills
    },
    scanned: files.length,
    findings,
    note: findings.length ? "These name a retired Solo plugin, repository, helper path or skill. Replace each with the current name." : void 0
  };
}

// plugins/sidecut-solo/server/src/helper/lib/docs.ts
var SKIP = /(^|\/)(node_modules|vendor|third_party|dist|build|\.agents\/skills|\.claude\/skills)\//;
var DOC = /^(?:(?:.*\/)?(?:AGENTS|CLAUDE|README)\.md|[^/]+\.md|docs\/.*\.md)$/;
var NOT_DOCS = /^(?:CHANGELOG|LICENSE|NOTICE)[^/]*$/i;
var ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|no|Mr|Ms|Dr|St)\.$/i;
function listFiles(root2) {
  try {
    return git(root2, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], false).split("\0").filter((path) => path && existsSync9(join9(root2, path)));
  } catch {
    const found = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = readdirSync6(join9(root2, dir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory() && ![".git", "node_modules"].includes(entry.name)) walk(path);
        else if (entry.isFile()) found.push(path);
      }
    };
    walk("");
    return found;
  }
}
function ignored(root2, paths) {
  if (!paths.length) return /* @__PURE__ */ new Set();
  const asked = paths.flatMap((path) => [path, `${path.replace(/\/$/, "")}/`]);
  const result = gitRun(root2, ["check-ignore", "--no-index", "--stdin", "-z"], asked.join("\0"));
  return new Set(
    result.stdout.split("\0").filter(Boolean).flatMap((path) => [path, path.replace(/\/$/, "")])
  );
}
function proseLines(text) {
  const lines = [];
  let fence;
  text.split("\n").forEach((raw, index) => {
    const marker = raw.trimStart().match(/^(`{3,}|~{3,})/)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? void 0 : marker;
      return;
    }
    if (!fence) lines.push([index + 1, raw]);
  });
  return lines;
}
function anchors(text) {
  const found = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Map();
  let previous = "";
  for (const [, line] of proseLines(text)) {
    for (const [, id] of line.matchAll(/<a\s[^>]*(?:id|name)="([^"]+)"/g)) found.add(id);
    const setext = /^ {0,3}(?:=+|-+)\s*$/.test(line) && previous.trim() && !/^\s*([-*+>|#]|\d+\.)/.test(previous) ? previous.trim() : void 0;
    previous = line;
    const heading = setext ?? /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === void 0) continue;
    const plain = heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "").replace(/[*`]/g, "").replace(/(^|\s)_+|_+(\s|$)/g, "$1$2");
    const base = plain.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const count2 = seen.get(base) ?? 0;
    seen.set(base, count2 + 1);
    found.add(count2 ? `${base}-${count2}` : base);
  }
  return found;
}
function globRegex(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else if (char === "{") out += "(?:";
    else if (char === "}") out += ")";
    else if (char === "," && out.includes("(?:")) out += "|";
    else out += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}(?:/.*)?$`);
}
function extraSentences(line) {
  const trimmed = line.trim();
  if (!trimmed || /^(#|\||<|>\s*\[!|\[[^\]]+\]:)/.test(trimmed)) return 0;
  const prose = trimmed.replace(/`[^`]*`/g, "code").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "url");
  let count2 = 0;
  for (const match of prose.matchAll(/[.!?]["')\]]*\s+(?=["'(]?[A-Z0-9])/g)) {
    const before = prose.slice(0, match.index + 1);
    if (ABBREVIATIONS.test(before) || /\b[A-Z]\.$/.test(before) || /\d\.$/.test(before)) continue;
    count2++;
  }
  return count2;
}
function namesOtherRepo(line, self, owner) {
  for (const [, who, name = ""] of line.matchAll(/\b([A-Z][\w-]*)\/([\w.-]+)/g)) {
    if (name !== self && !name.includes(".") && (name.includes("-") || who === owner)) return true;
  }
  return /\b[\w]+-[\w-]+(?:'s|')(?=\s)/.test(line);
}
function manifestScripts(root2, files) {
  const manifests = files.filter(
    (file) => /(^|\/)package\.json$/.test(file) && !SKIP.test(`/${file}`)
  );
  if (!manifests.length) return void 0;
  const names = /* @__PURE__ */ new Set();
  for (const file of manifests) {
    try {
      for (const name of Object.keys(
        JSON.parse(readFileSync7(join9(root2, file), "utf8")).scripts ?? {}
      ))
        names.add(name);
    } catch {
      return void 0;
    }
  }
  return names;
}
function docsCheck(repo, options = {}) {
  const root2 = repoRoot(repo);
  const files = listFiles(root2);
  const known = new Set(files);
  const dirs = /* @__PURE__ */ new Set();
  for (const file of files) {
    for (let at = file.indexOf("/"); at !== -1; at = file.indexOf("/", at + 1)) {
      dirs.add(file.slice(0, at));
    }
  }
  let self = "";
  let owner = "";
  try {
    const url = git(root2, ["remote", "get-url", "origin"]);
    [, owner = "", self = ""] = /([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url) ?? [];
  } catch {
  }
  const top = new Set(files.map((file) => file.split("/")[0]));
  const deletedFiles = gitRun(root2, [
    "log",
    "--no-renames",
    "--diff-filter=D",
    "--format=",
    "--name-only",
    "-n",
    "2000"
  ]).stdout.split("\n").filter((file) => file.includes("/") && !known.has(file));
  const deleted = new Set(deletedFiles);
  for (const file of deletedFiles)
    for (let at = file.indexOf("/"); at !== -1; at = file.indexOf("/", at + 1))
      deleted.add(file.slice(0, at));
  const protectedPaths = load(root2).config.protected_paths ?? [];
  const docs = files.filter(
    (file) => DOC.test(file) && !NOT_DOCS.test(file) && !SKIP.test(`/${file}`) && !protectedPaths.includes(file)
  );
  const exists = (path) => {
    const clean = normalize2(path).replace(/\/$/, "");
    return known.has(clean) || dirs.has(clean) || clean === ".";
  };
  const matchesGlob = (glob) => {
    const pattern = globRegex(glob.replace(/\/$/, ""));
    return files.some((file) => pattern.test(file));
  };
  const scripts = manifestScripts(root2, files);
  const problems2 = [];
  const missing = [];
  const texts = /* @__PURE__ */ new Map();
  const read = (file) => {
    if (!texts.has(file)) {
      try {
        texts.set(file, readFileSync7(join9(root2, file), "utf8"));
      } catch {
        texts.set(file, "");
      }
    }
    return texts.get(file);
  };
  for (const file of docs) {
    const path = join9(root2, file);
    if (!statSync2(path).isFile() || statSync2(path).size > 1e6) continue;
    const text = read(file);
    const here = dirname4(file);
    const own = anchors(text);
    for (const [line, raw] of proseLines(text)) {
      for (const match of raw.matchAll(/(?<!`)`([^`\s]+)`(?!`)/g)) {
        const span2 = match[1];
        const next = raw.slice(match.index + match[0].length, match.index + match[0].length + 30);
        if (/^\W{0,3}(?:was |is |has been )?(?:deleted|removed|retired|renamed|gone)\b/i.test(next))
          continue;
        const token = span2.replace(/^\.\//, "").replace(/(?::\d+(?:-\d+)?|#.*)$/, "").replace(/[.,;:]$/, "");
        if (!token || /[<>$|=()@~\\]|:\/\/|^\//.test(token)) continue;
        if (token.split("/").some((part) => /^[A-Z][A-Z0-9_]+$/.test(part))) continue;
        const fromDoc = relative(".", join9(here, token));
        const first = token.split("/")[0];
        const relativeToDoc = token.startsWith("../") || here !== "." && exists(fromDoc);
        const wasHere = !top.has(first) && deleted.has(token.replace(/\/$/, "")) && !/\b(?:deleted|removed|retired|renamed|moved|gone|dropped|formerly|used to)\b/i.test(raw);
        if (!top.has(first) && !wasHere && !relativeToDoc) continue;
        if (!token.includes("/") && !/\.\w+$/.test(token) && !dirs.has(token)) continue;
        const ok = /[*?{]/.test(token) ? matchesGlob(token) || matchesGlob(fromDoc) : exists(token) || exists(fromDoc);
        if (!ok && !namesOtherRepo(raw, self, owner)) {
          const problem = {
            file,
            line,
            kind: "path",
            found: span2,
            detail: "no such file or folder in the repository"
          };
          missing.push({ problem, path: token });
        }
      }
      const outsideCode = raw.replace(/`[^`]*`/g, (code) => " ".repeat(code.length));
      const targets = [
        ...[...outsideCode.matchAll(/\]\(\s*<?([^()\s<>[\]]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
          (m) => m[1]
        ),
        ...[...outsideCode.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/g)].map((m) => m[1])
      ];
      for (const target of targets) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const [rawPath = "", fragment] = target.split("#");
        let linked;
        try {
          linked = decodeURIComponent(rawPath);
        } catch {
          linked = rawPath;
        }
        const resolved = linked ? relative(".", linked.startsWith("/") ? `.${linked}` : join9(here, linked)) : file;
        if (resolved.startsWith("..")) continue;
        if (linked && !exists(resolved) && !existsSync9(join9(root2, resolved))) {
          problems2.push({
            file,
            line,
            kind: "link",
            found: target,
            detail: "link target not found"
          });
          continue;
        }
        if (fragment && resolved.endsWith(".md") && !/^L\d+/.test(fragment)) {
          const ids = resolved === file ? own : anchors(read(resolved));
          if (!ids.has(fragment.toLowerCase()) && !ids.has(fragment)) {
            problems2.push({
              file,
              line,
              kind: "anchor",
              found: target,
              detail: `no heading #${fragment} in ${resolved}`
            });
          }
        }
      }
      for (const [, , name] of raw.matchAll(/\b(npm|pnpm|yarn|bun) run ([\w:.@/-]+)/g)) {
        const script = name.replace(/[.,;:]$/, "");
        if (!scripts || /[/]|\.\w+$/.test(script)) continue;
        if (!scripts.has(script)) {
          problems2.push({
            file,
            line,
            kind: "script",
            found: `run ${script}`,
            detail: "no such script in package.json"
          });
        }
      }
      if (options.oneSentencePerLine && extraSentences(raw)) {
        problems2.push({
          file,
          line,
          kind: "sentences",
          found: raw.trim().slice(0, 80),
          detail: "more than one sentence on this line"
        });
      }
    }
  }
  const skip = ignored(
    root2,
    missing.map((item) => item.path)
  );
  for (const { problem, path } of missing) if (!skip.has(path)) problems2.push(problem);
  for (const hit of retiredNames(root2).findings) {
    problems2.push({
      file: hit.file,
      line: hit.line,
      kind: "retired-name",
      found: hit.found,
      detail: `use ${hit.use}`
    });
  }
  problems2.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const counts = {};
  for (const problem of problems2) counts[problem.kind] = (counts[problem.kind] ?? 0) + 1;
  return { ok: problems2.length === 0, checked: docs, counts, problems: problems2 };
}

// plugins/sidecut-solo/server/src/helper/lib/execution.ts
import { spawn as spawn2 } from "node:child_process";
import { createHash as createHash3 } from "node:crypto";
var KEEP = 2e4;
function tail(chunks) {
  return Buffer.concat(chunks).subarray(-8e4).toString("utf8").slice(-KEEP);
}
function execute(argv, cwd2, timeoutMs) {
  return new Promise((done, fail) => {
    const child = spawn2(argv[0], argv.slice(1), {
      cwd: cwd2,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const out = [];
    const err = [];
    const keep = (target) => {
      let size = 0;
      return (chunk) => {
        target.push(chunk);
        size += chunk.length;
        while (target.length > 1 && size - target[0].length >= 8e4) {
          size -= target.shift().length;
        }
      };
    };
    child.stdout.on("data", keep(out));
    child.stderr.on("data", keep(err));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      done({ code: null, stdout: tail(out), stderr: tail(err), timedOut });
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!timedOut) done({ code, stdout: tail(out), stderr: tail(err), timedOut });
    });
  });
}
async function run(store, key, argv, timeout = 120) {
  if (!argv.length || !(timeout >= 1 && timeout <= 900) || !key.trim()) {
    throw new WorkflowError("Command, action key and timeout of 1\u2013900 seconds required");
  }
  const signature = createHash3("sha256").update(JSON.stringify(argv)).digest("hex");
  return store.writerAsync(async () => {
    const data = store.load();
    const intent = data.merge_intent?.status ?? "";
    if (data.end_state === "needs_reconciliation" || intent === "started" || intent === "uncertain") {
      throw new WorkflowError("Reconcile changed state and uncertain actions before execution");
    }
    const previous = data.actions[key];
    if (previous) {
      if (previous.signature !== signature) {
        throw new WorkflowError("Action ID reused for a different command");
      }
      if (previous.status === "started") {
        throw new WorkflowError("Uncertain action; inspect effects, never replay automatically");
      }
      return { ...previous, replayed: false, cached: true };
    }
    const actual = inventory(store.repo);
    if (actual.fingerprint !== data.snapshot.fingerprint) {
      throw new WorkflowError("Working state changed; resume and checkpoint before execution");
    }
    const action = {
      signature,
      argv,
      status: "started",
      started_at: now(),
      before: actual
    };
    data.actions[key] = action;
    store.save(data);
    try {
      const outcome = await execute(argv, store.repo, timeout * 1e3);
      if (outcome.timedOut) {
        Object.assign(action, { status: "uncertain", error: "TimeoutExpired" });
        data.end_state = "needs_reconciliation";
      } else {
        Object.assign(action, {
          status: outcome.code === 0 ? "passed" : "failed",
          returncode: outcome.code,
          stdout: outcome.stdout,
          stderr: outcome.stderr
        });
      }
    } catch (error) {
      Object.assign(action, { status: "uncertain", error: error.name || "OSError" });
      data.end_state = "needs_reconciliation";
    }
    action.finished_at = now();
    action.after = inventory(store.repo);
    data.snapshot = action.after;
    data.updated_at = now();
    data.evidence.push({
      kind: "command",
      action: key,
      head: action.after.head,
      status: action.status,
      fingerprint: action.after.fingerprint,
      at: now()
    });
    store.save(data);
    return action;
  });
}

// plugins/sidecut-solo/server/src/helper/lib/qa.ts
import { readFileSync as readFileSync8 } from "node:fs";
import { join as join10 } from "node:path";
var SCHEMAS = join10(pluginRoot, "server", "data", "qa");
function typeMatches(type, value) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object")
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}
function schemaErrors(schema2, value, at = "$") {
  if (schema2.anyOf) {
    const options = schema2.anyOf.map((option) => schemaErrors(option, value, at));
    return options.some((errors2) => !errors2.length) ? [] : [`${at}: matches no allowed form`];
  }
  const errors = [];
  for (const part of schema2.allOf ?? []) errors.push(...schemaErrors(part, value, at));
  if (schema2.if) {
    const branch = schemaErrors(schema2.if, value, at).length ? schema2.else : schema2.then;
    if (branch) errors.push(...schemaErrors(branch, value, at));
  }
  if (schema2.not && !schemaErrors(schema2.not, value, at).length)
    errors.push(`${at}: matches a forbidden form`);
  if (schema2.contains && Array.isArray(value) && !value.some((item) => !schemaErrors(schema2.contains, item).length)) {
    errors.push(`${at}: has no matching item`);
  }
  if ("const" in schema2 && value !== schema2.const)
    errors.push(`${at}: must be ${JSON.stringify(schema2.const)}`);
  if (schema2.enum && !schema2.enum.includes(value))
    errors.push(`${at}: must be one of ${schema2.enum.join(", ")}`);
  if (schema2.type && !typeMatches(schema2.type, value))
    return [...errors, `${at}: must be ${schema2.type}`];
  if (typeof value === "string") {
    if (schema2.minLength !== void 0 && value.length < schema2.minLength)
      errors.push(`${at}: too short`);
    if (schema2.pattern && !new RegExp(schema2.pattern, "u").test(value))
      errors.push(`${at}: does not match ${schema2.pattern}`);
    if (schema2.format === "date-time" && Number.isNaN(Date.parse(value)))
      errors.push(`${at}: not a date-time`);
  }
  if (typeof value === "number" && schema2.minimum !== void 0 && value < schema2.minimum) {
    errors.push(`${at}: below ${schema2.minimum}`);
  }
  if (typeof value === "number" && schema2.maximum !== void 0 && value > schema2.maximum) {
    errors.push(`${at}: above ${schema2.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema2.minItems !== void 0 && value.length < schema2.minItems)
      errors.push(`${at}: needs ${schema2.minItems}+ items`);
    if (schema2.items)
      value.forEach((item, i) => {
        errors.push(...schemaErrors(schema2.items, item, `${at}[${i}]`));
      });
  }
  if (typeMatches("object", value) && (schema2.properties || schema2.required)) {
    const record = value;
    for (const key of schema2.required ?? [])
      if (!(key in record)) errors.push(`${at}.${key}: required`);
    for (const [key, item] of Object.entries(record)) {
      const property = schema2.properties?.[key];
      if (property) errors.push(...schemaErrors(property, item, `${at}.${key}`));
      else if (schema2.additionalProperties === false) errors.push(`${at}.${key}: not allowed`);
    }
  }
  return errors;
}
function schema(name) {
  return JSON.parse(readFileSync8(join10(SCHEMAS, `${name}.schema.json`), "utf8"));
}
function runProblems(scenario, run2) {
  const found = [
    ...schemaErrors(schema("scenario"), scenario).map((e) => `scenario ${e}`),
    ...schemaErrors(schema("run"), run2).map((e) => `run ${e}`)
  ];
  if (run2?.kind === "session" && run2.comparison)
    found.push("A session record is single-arm; a with/without pair needs dogfood runs");
  if (found.length) return found;
  if (run2.skills?.length) {
    const used = [...new Set(run2.skills.map((skill) => skill.invocation))];
    const summary3 = used.length === 1 ? used[0] : "mixed";
    if (run2.invocation !== summary3)
      found.push(`Run invocation must be ${summary3} to match its skills`);
  } else if (run2.invocation === "mixed") found.push("A mixed invocation needs a skills list");
  if (run2.scenario_id !== scenario.id || run2.scenario_version !== scenario.version) {
    found.push("Scenario ID/version mismatch");
  }
  const expected = scenario.checks.map((check) => check.id);
  const actual = run2.checks.map((check) => check.id);
  if (new Set(expected).size !== expected.length || new Set(actual).size !== actual.length) {
    found.push("Duplicate check IDs");
  }
  if ([...new Set(expected)].sort().join() !== [...new Set(actual)].sort().join()) {
    found.push("Missing or unknown check IDs");
  }
  const statuses = new Set(run2.checks.map((check) => check.status));
  const summary2 = ["fail", "blocked", "not_run"].find((status) => statuses.has(status)) ?? "pass";
  if (run2.status !== summary2) found.push("Summary status does not match check results");
  const byId = new Map(run2.checks.map((check) => [check.id, check]));
  const ids = run2.findings.map((finding) => finding.id);
  if (new Set(ids).size !== ids.length) found.push("Duplicate finding IDs");
  for (const finding of run2.findings) {
    const check = finding.check_id === null ? void 0 : byId.get(finding.check_id);
    if (finding.check_id !== null && !check) found.push("Finding references an unknown check ID");
    if (finding.kind === "defect" && check?.status !== "fail")
      found.push("Defect must reference a failed check");
  }
  const { started_at: start, finished_at: finish } = run2;
  if (start === null !== (finish === null))
    found.push("Capture both timestamps or leave both unknown");
  if (start !== null && finish !== null && Date.parse(finish) < Date.parse(start)) {
    found.push("Run finished before it started");
  }
  return found;
}
function runNotes(run2) {
  if (run2.kind === "regression" || run2.comparison) return [];
  return [
    "Single-arm record: what helped is observed, not attributed. Attribution to the plugin is inconclusive without a with/without pair."
  ];
}
function canonical(value) {
  return JSON.stringify(
    value,
    (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : 1)) : item
  );
}
var IDENTITY = ["host", "host_version", "requested_model", "resolved_model"];
function pairProblems(scenario, withRun, withoutRun) {
  const found = [
    ...runProblems(scenario, withRun).map((e) => `with-plugin: ${e}`),
    ...runProblems(scenario, withoutRun).map((e) => `without-plugin: ${e}`)
  ];
  const [a, b] = [withRun?.comparison, withoutRun?.comparison];
  if (!a || !b) return [...found, "Both runs need a comparison block"];
  if (a.arm !== "with-plugin" || b.arm !== "without-plugin")
    found.push("Arms must be with-plugin then without-plugin");
  if (a.pair_id !== b.pair_id) found.push("Runs belong to different pairs");
  if (withRun.kind !== withoutRun.kind) found.push("Both arms must be the same kind of run");
  if (canonical(withRun.subject) !== canonical(withoutRun.subject))
    found.push("Both arms must test the same subject");
  for (const field of IDENTITY) {
    const [left, right] = [withRun.environment?.[field], withoutRun.environment?.[field]];
    if (left && right && left !== right) found.push(`Both arms must use the same ${field}`);
  }
  return found;
}
function identityKnown(withRun, withoutRun) {
  for (const run2 of [withRun, withoutRun]) {
    const subject = run2.subject;
    if (!(subject.fingerprint || subject.revision && !subject.dirty)) return false;
    if (!IDENTITY.every((key) => run2.environment[key])) return false;
  }
  return canonical(withRun.subject) === canonical(withoutRun.subject) && IDENTITY.every((key) => withRun.environment[key] === withoutRun.environment[key]);
}
var VERDICTS = {
  "pass,fail": "attributable",
  "fail,pass": "regressed",
  "pass,pass": "both-pass",
  "fail,fail": "neither"
};
function comparePair(withRun, withoutRun) {
  const without = new Map(withoutRun.checks.map((check) => [check.id, check.status]));
  const known = identityKnown(withRun, withoutRun);
  const lines = withRun.checks.map((check) => {
    const pair = `${check.status},${without.get(check.id)}`;
    const verdict = known && VERDICTS[pair] || "inconclusive";
    return `${check.id}: with=${check.status} without=${without.get(check.id)} -> ${verdict}`;
  });
  const [a, b] = [withRun.comparison, withoutRun.comparison];
  lines.push(`Sample counts: with=${a.runs} without=${b.runs}; differences are descriptive.`);
  if (a.score !== null && b.score !== null) {
    const delta = a.score - b.score;
    lines.push(
      `score: with=${a.score.toFixed(2)} without=${b.score.toFixed(2)} delta=${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`
    );
  }
  lines.push(
    known ? "Pair context matches; differences are observations for these samples, not causal proof." : "Pair observations retained; attribution inconclusive because identity is unknown.",
    "Prompt, tool and fixture equivalence must also be established by the operator."
  );
  return lines;
}
function qaCommand(command, paths) {
  const [scenario, ...runs] = paths.map((path) => JSON.parse(readFileSync8(path, "utf8")));
  const [first, second] = runs;
  const compare = command === "qa-compare";
  const found = compare ? pairProblems(scenario, first, second) : runProblems(scenario, first);
  for (const error of found) console.error(error);
  if (found.length) return 1;
  if (compare) {
    console.log(comparePair(first, second).join("\n"));
  } else {
    console.log("Scenario and run records are consistent; this is not a behavioral pass.");
    for (const note of runNotes(first)) console.log(note);
  }
  return 0;
}

// plugins/sidecut-solo/server/src/helper/lib/surface.ts
import { readFileSync as readFileSync9 } from "node:fs";
import { join as join11 } from "node:path";
var NOT_SEEN = [
  /(^|\/)(tests?|__tests__|e2e|fixtures|__snapshots__|node_modules|\.github)\//i,
  /^(dist|build|out)\//,
  /\.(test|spec)\.[^/]+$/i,
  /^docs\/(?!(.*\/)?DESIGN\.md$).*\.(md|rst|txt|png|jpe?g|gif|svg|webp)$/i,
  // Code generators' templates for code, settings or Markdown, such as a plugin scaffold's
  // README.md.tmpl or .gitignore.tmpl, outside folders people see; markup templates still count.
  /^(?!(.*\/)?(emails?|public|static|assets|content|copy|locales?|i18n|translations|lang|messages)\/)(.*\/)?[^/]*\.(md|ya?ml|json|toml|[cm]?[jt]s|sh)\.tmpl$/i,
  /^(?!(.*\/)?(emails?|public|static|assets|content|copy|locales?|i18n|translations|lang|messages)\/)(.*\/)?\.[^/.]+\.tmpl$/i
];
var SEEN = [
  ["design rules", [/(^|\/)DESIGN\.md$/, /(^|\/)components\.json$/i]],
  [
    "styles",
    [
      /\.(css|scss|sass|less|styl|pcss)$/i,
      /(^|\/)(tailwind|postcss)\.config\.[^/]+$/i,
      /(^|\/)(theme|tokens|design-tokens)\.[^/]+$/i
    ]
  ],
  [
    "markup or components",
    [
      /\.(tsx|jsx|vue|svelte|astro|html?|mjml|hbs|handlebars|liquid|njk|erb|ejs|pug|twig|xib|storyboard)$/i,
      /(View|Screen)\.(swift|kt)$/,
      /(^|\/)res\/(layout|drawable|values|menu)[^/]*\/[^/]+\.xml$/
    ]
  ],
  [
    "copy",
    [
      /(^|\/)(locales?|i18n|translations|lang|content)\//i,
      /(^|\/)(content|copy|strings)\.(json|ya?ml|[cm]?[jt]sx?)$/i,
      /(^|\/)messages(\.|\/[^/]+\.)(json|ya?ml)$/i,
      /\.(po|xliff|xcstrings|strings|arb|mdx)$/i
    ]
  ],
  [
    "images, fonts and downloads",
    [
      /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i,
      /(^|\/)(public|static|assets)\/.+\.pdf$/i
    ]
  ],
  [
    "screens and public files",
    [
      /(^|\/)(components|ui|pages|views|screens|layouts|templates|emails?|styles|public|static|assets)\//i
    ]
  ]
];
function seenBecause(path) {
  if (NOT_SEEN.some((re) => re.test(path))) return null;
  return SEEN.find(([, res]) => res.some((re) => re.test(path)))?.[0] ?? null;
}
function classify(paths) {
  const user_facing = [...new Set(paths)].sort().flatMap((path) => {
    const reason = seenBecause(path);
    return reason ? [{ path, reason }] : [];
  });
  return {
    changed: new Set(paths).size,
    user_facing,
    design_review: user_facing.length ? "needed" : "not needed"
  };
}
var BINARY_LINES = 50;
function userFacing(dir, base, head, policy) {
  const repo = git(dir, ["rev-parse", "--show-toplevel"]);
  const baseSha = git(repo, ["rev-parse", "--verify", `${base}^{commit}`]);
  const lines = (out) => out.split("\0").filter(Boolean);
  const changedLines = (range) => git(repo, ["diff", "--numstat", "--no-renames", range], false).split("\n").reduce((sum, row) => {
    const [added, deleted] = row.split("	");
    if (added === "-") return sum + BINARY_LINES;
    return sum + (Number(added) || 0) + (Number(deleted) || 0);
  }, 0);
  let headLabel;
  let paths;
  let changed;
  if (head) {
    headLabel = git(repo, ["rev-parse", "--verify", `${head}^{commit}`]);
    paths = lines(
      git(repo, ["diff", "--name-only", "--no-renames", "-z", `${baseSha}...${headLabel}`], false)
    );
    changed = changedLines(`${baseSha}...${headLabel}`);
  } else {
    headLabel = "working tree";
    const from = git(repo, ["merge-base", baseSha, "HEAD"]);
    const untracked = lines(git(repo, ["ls-files", "--others", "--exclude-standard", "-z"], false));
    paths = [
      ...lines(git(repo, ["diff", "--name-only", "--no-renames", "-z", from], false)),
      ...untracked
    ];
    changed = changedLines(from) + untracked.reduce((sum, p) => {
      try {
        return sum + readFileSync9(join11(repo, p), "utf8").split("\n").length;
      } catch {
        return sum;
      }
    }, 0);
  }
  return {
    base: baseSha,
    head: headLabel,
    ...classify(paths),
    review: reviewLevel(paths, changed, policy)
  };
}

// plugins/sidecut-solo/server/src/helper/solo.ts
var AUTHORIZATION = {
  authorized: { kind: "flag" },
  "publication-authorized": { kind: "flag" },
  "publication-effect": { kind: "string", choices: PUBLICATION_EFFECTS },
  "host-scope": { kind: "string", choices: HOST_SCOPES }
};
var REQUIRE = { "require-check": { kind: "list" } };
var COMMANDS = {
  config: { help: "Show merged settings, defaults for unset keys and any problems" },
  inventory: { help: "Branch, head, uncommitted files, worktrees and branches; no fetch" },
  "remote-state": {
    help: "Fetch and verify the remote default branch; --version-path blocks a version collision",
    options: { remote: { kind: "string" }, "version-path": { kind: "string" } }
  },
  push: {
    help: "Push HEAD to the branch's upstream by name, never force, and confirm the remote tip",
    options: { to: { kind: "string" }, remote: { kind: "string" } }
  },
  "user-facing": {
    help: "List changed files people would see, say whether the change needs a design review and suggest its review level",
    options: {
      base: { kind: "string", about: "where the change starts (default: base_branch)" },
      head: {
        kind: "string",
        about: "commit to stop at (default: the working tree, untracked included)"
      }
    }
  },
  authorization: { help: "Resolve task permissions; no writes", options: AUTHORIZATION },
  merged: {
    help: "Classify local branches by whether their content is already in a ref",
    options: { into: { kind: "string", required: true } }
  },
  "delete-merged": {
    help: "Delete named local branches that `merged` proves are in a ref",
    options: { into: { kind: "string", required: true } },
    positionals: ["branches..."]
  },
  start: {
    help: "Create a task record",
    options: { constraint: { kind: "list" }, budget: { kind: "string" } },
    positionals: ["goal"]
  },
  resume: { help: "Compare a task record with the current state" },
  reconcile: {
    help: "Record what is actually present now",
    options: { found: { kind: "string", required: true } }
  },
  checkpoint: {
    help: "Record a phase boundary",
    options: {
      next: { kind: "string", required: true },
      acceptance: { kind: "string", required: true }
    },
    positionals: ["phase"]
  },
  run: {
    help: "Run a command once per key: run --key <name> [--timeout 120] -- <argv...>",
    options: { key: { kind: "string", required: true }, timeout: { kind: "string" } },
    rest: true
  },
  checks: {
    help: "Read required checks for the current PR head",
    options: {
      "reviewed-head": {
        kind: "string",
        about: "full SHA you reviewed; fails if the PR head has moved off it"
      },
      ...REQUIRE
    },
    positionals: ["pr"]
  },
  gate: {
    help: "Check merge readiness only; does not merge",
    options: {
      checks: { kind: "string", required: true },
      review: { kind: "string", required: true },
      ...AUTHORIZATION
    }
  },
  merge: {
    help: "Merge the PR at the reviewed head once every requirement holds; starts a task record if there is none",
    options: {
      review: {
        kind: "string",
        about: "review JSON file; or give the review inline with the next four"
      },
      "reviewed-head": { kind: "string", about: "full SHA the review covered" },
      reviewer: { kind: "string", choices: ["same-agent", "independent", "user"] },
      "review-notes": { kind: "string", about: "what was reviewed and found" },
      "blocking-findings": {
        kind: "string",
        about: "unresolved blocker or major findings; required inline"
      },
      method: { kind: "string", choices: MERGE_METHODS },
      ...AUTHORIZATION,
      ...REQUIRE
    },
    positionals: ["pr"]
  },
  worktree: {
    help: "Create a task-owned worktree",
    options: { ref: { kind: "string" } },
    positionals: ["path"]
  },
  cleanup: {
    help: "Remove a task-owned worktree whose work is preserved",
    options: { "preserved-ref": { kind: "string", required: true } },
    positionals: ["path"]
  },
  report: { help: "Print a shareable text report from a JSON summary", positionals: ["content"] },
  "qa-check": { help: "Validate a QA run against its scenario", positionals: ["scenario", "run"] },
  "qa-compare": {
    help: "Compare with/without-plugin runs",
    positionals: ["scenario", "with", "without"]
  },
  usage: {
    help: "Solo's skills from Claude Code's usage export or the skill hook log, plus the helper's own refusals",
    options: {
      days: { kind: "string", about: "how far back to look (default 7)" },
      share: {
        kind: "flag",
        about: "print only one line of skill run counts to paste somewhere yourself; sends nothing"
      },
      html: {
        kind: "string",
        about: "also save the usage dashboard as a self-contained HTML file"
      },
      json: { kind: "flag", about: "print the report and the dashboard summary as JSON instead" }
    }
  },
  "codex-agents": {
    help: "Show or install Solo's agent profiles in this project's .codex/agents/",
    options: { install: { kind: "flag" } }
  },
  "docs-check": {
    help: "Check instructions and docs against the repository: paths, links and anchors, package scripts and Solo names; exits 1 on problems",
    options: {
      "one-sentence-per-line": {
        kind: "flag",
        about: "also report prose lines that hold more than one sentence"
      }
    }
  },
  "retired-names": {
    help: "Find retired Solo plugin, repository, helper and skill names in instructions, the Codex marketplace file and hooks"
  }
};
function parse2(command, args, globals) {
  const spec = COMMANDS[command];
  const options = spec.options ?? {};
  const out = { _: [], rest: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--" && spec.rest) {
      out.rest = args.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (name === "repo" || name === "task") {
        const value2 = inline ?? args[++i];
        if (value2 === void 0) throw new WorkflowError(`--${name} needs a value`);
        if (globals[name] !== void 0 && globals[name] !== value2) {
          throw new WorkflowError(`--${name} given twice`);
        }
        globals[name] = value2;
        continue;
      }
      const option = options[name];
      if (!option)
        throw new WorkflowError(
          `${command}: unknown option --${name}; \`${command} --help\` lists its options`
        );
      if (option.kind === "flag") {
        if (inline !== void 0) throw new WorkflowError(`${command}: --${name} takes no value`);
        out[name] = true;
        continue;
      }
      const value = inline ?? args[++i];
      if (value === void 0) throw new WorkflowError(`${command}: --${name} needs a value`);
      if (option.choices && !option.choices.includes(value)) {
        throw new WorkflowError(
          `${command}: --${name} must be one of ${option.choices.join(", ")}`
        );
      }
      if (option.kind === "list") out[name] = [...out[name] ?? [], value];
      else out[name] = value;
    } else if (spec.rest && !spec.positionals) {
      out.rest = args.slice(i);
      break;
    } else out._.push(arg);
  }
  for (const [name, option] of Object.entries(options)) {
    if (option.required && out[name] === void 0)
      throw new WorkflowError(`${command}: --${name} is required`);
  }
  const wanted = spec.positionals ?? [];
  const variadic = wanted.at(-1)?.endsWith("...");
  if (variadic ? out._.length < wanted.length : out._.length !== wanted.length) {
    throw new WorkflowError(`${command}: expects ${wanted.join(" ") || "no arguments"}`);
  }
  return out;
}
function wantsHelp(command, args) {
  const spec = COMMANDS[command];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return true;
    if (arg === "--") return false;
    if (arg.startsWith("--")) {
      const name = arg.slice(2).split("=")[0];
      const flag = (spec.options?.[name]?.kind ?? "flag") === "flag";
      if (!arg.includes("=") && (name === "repo" || name === "task" || !flag)) i++;
    } else if (spec.rest && !spec.positionals) return false;
  }
  return false;
}
function commandHelp(command) {
  const spec = COMMANDS[command];
  const positionals = (spec.positionals ?? []).map((name) => `<${name}>`).join(" ");
  const lines = [
    `usage: sh server/data/helper/solo ${command}${positionals ? ` ${positionals}` : ""} [--repo <path>] [--task <id>]${spec.options ? " [options]" : ""}${spec.rest ? " -- <argv...>" : ""}`,
    "",
    spec.help
  ];
  const options = Object.entries(spec.options ?? {});
  if (options.length) lines.push("", "options:");
  for (const [name, option] of options) {
    const value = option.kind === "flag" ? "" : option.choices ? ` <${option.choices.join("|")}>` : " <value>";
    const notes = [
      option.required ? "required" : "",
      option.kind === "list" ? "may repeat" : "",
      option.about ?? ""
    ].filter(Boolean);
    lines.push(`  --${name}${value}${notes.length ? `  ${notes.join("; ")}` : ""}`);
  }
  return `${lines.join("\n")}
`;
}
function usage() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    "usage: sh server/data/helper/solo <command> [--repo <path>] [--task <id>] [options]  (--repo/--task may also come first)",
    "",
    ...Object.entries(COMMANDS).map(([name, spec]) => `  ${name.padEnd(width)}  ${spec.help}`)
  ].join("\n");
}
function summary(data) {
  const last = data.increments.at(-1);
  return {
    goal: data.goal,
    phase: data.phase,
    next_action: data.next_action,
    acceptance: last?.acceptance ?? null,
    increments: `${data.increments.length}/${data.budget_increments ?? "unbounded"}`,
    end_state: data.end_state,
    head: data.snapshot.head,
    branch: data.snapshot.branch,
    dirty_entries: data.snapshot.status.length,
    fingerprint: data.snapshot.fingerprint
  };
}
function json(path) {
  return JSON.parse(readFileSync10(path, "utf8"));
}
function reviewFrom(args) {
  const inline = ["reviewed-head", "reviewer", "review-notes", "blocking-findings"].filter(
    (name) => args[name] !== void 0
  );
  if (args.review !== void 0) {
    if (inline.length)
      throw new WorkflowError("merge: give --review or the inline review, not both");
    return json(args.review);
  }
  if (!inline.length)
    throw new WorkflowError(
      "merge: needs a review: --review <file>, or --reviewed-head <sha> --reviewer <kind> --review-notes <text> --blocking-findings <n>"
    );
  const count2 = args["blocking-findings"];
  const findings = count2 !== void 0 && /^none$/i.test(count2) ? 0 : count2 !== void 0 && /^\d+$/.test(count2) ? Number(count2) : void 0;
  return {
    head: args["reviewed-head"],
    reviewer: args.reviewer,
    notes: args["review-notes"],
    blocking_findings: findings
  };
}
var VERSION = (() => {
  try {
    return json(join12(pluginRoot, ".codex-plugin", "plugin.json")).version ?? "?";
  } catch {
    return "?";
  }
})();
async function main(argv) {
  const leading = {};
  while (argv[0] === "--repo" || argv[0] === "--task") {
    const [flag, value] = argv.splice(0, 2);
    if (value === void 0) throw new WorkflowError(`${flag} needs a value`);
    leading[flag === "--repo" ? "repo" : "task"] = value;
  }
  const [command, ...rest] = argv;
  if (command === "help" && rest[0] && COMMANDS[rest[0]]) {
    process.stdout.write(commandHelp(rest[0]));
    return 0;
  }
  if (command && COMMANDS[command] && wantsHelp(command, rest)) {
    process.stdout.write(commandHelp(command));
    return 0;
  }
  if (!command || command === "--help" || command === "-h" || command === "help" || !COMMANDS[command]) {
    console.log(usage());
    return command && !["--help", "-h", "help"].includes(command) ? 2 : 0;
  }
  const later = {};
  const args = parse2(command, rest, later);
  for (const name of ["repo", "task"]) {
    const first = leading[name];
    if (first !== void 0 && later[name] !== void 0 && first !== later[name]) {
      throw new WorkflowError(`--${name} given twice`);
    }
  }
  let repo = leading.repo ?? later.repo;
  repo ??= cwd();
  const explicitTask = leading.task ?? later.task;
  const loaded = load(repo);
  const settings = loaded.config;
  if (loaded.problems.length && ["checks", "merge", "gate", "authorization"].includes(command)) {
    throw new WorkflowError(`fix Sidecut Solo settings first: ${loaded.problems.join("; ")}`);
  }
  const required = [
    .../* @__PURE__ */ new Set([
      ...settings.required_checks ?? [],
      ...args["require-check"] ?? []
    ])
  ];
  const permission = () => resolveAuthorization(settings.merge ?? DEFAULTS.merge, {
    userMerge: Boolean(args.authorized),
    userPublication: Boolean(args["publication-authorized"]),
    publicationEffect: args["publication-effect"] ?? "unknown",
    hostScope: args["host-scope"] ?? "unknown"
  });
  const positional = (index) => args._[index];
  let result;
  switch (command) {
    case "config":
      result = loaded;
      break;
    case "inventory":
      result = inventory(repo);
      break;
    case "remote-state":
      result = freshRemoteState(
        repo,
        args.remote ?? "origin",
        args["version-path"]
      );
      break;
    case "push":
      result = push(repo, settings.base_branch, {
        to: args.to,
        remote: args.remote
      });
      break;
    case "user-facing": {
      const base = args.base ?? settings.base_branch;
      if (!base) throw new WorkflowError("user-facing: pass --base, or set base_branch");
      result = userFacing(
        repo,
        base,
        args.head,
        settings.review
      );
      break;
    }
    case "authorization":
      result = permission();
      break;
    case "merged":
      result = markPrMerged(repo, mergedBranches(repo, args.into));
      break;
    case "delete-merged":
      result = deleteMerged(repo, args.into, args._);
      break;
    case "report":
      process.stdout.write(textReport(json(positional(0))));
      return 0;
    case "qa-check":
      return qaCommand(command, [positional(0), positional(1)]);
    case "qa-compare":
      return qaCommand(command, [positional(0), positional(1), positional(2)]);
    case "usage": {
      const days = Number(args.days ?? 7);
      if (!(days > 0)) throw new WorkflowError("--days must be a positive number");
      const records = readJsonl(usageFile());
      const refusals = readRefusals();
      const runs = readSkillRuns();
      const since = new Date(Date.now() - days * 864e5);
      if (args.share) {
        if (args.json || args.html !== void 0)
          throw new WorkflowError("usage: give --share alone, without --json or --html");
        console.log(shareLine(records, runs, since, days, VERSION));
        return 0;
      }
      if (args.json) {
        if (args.html !== void 0)
          throw new WorkflowError("usage: give --json or --html, not both");
        const output = {
          report: soloReport(records, refusals, since, /* @__PURE__ */ new Date(), runs),
          summary: summarize(records, refusals, since, /* @__PURE__ */ new Date(), runs)
        };
        console.log(JSON.stringify(output));
        return 0;
      }
      console.log(soloReport(records, refusals, since, /* @__PURE__ */ new Date(), runs));
      if (typeof args.html === "string") {
        writeFileSync3(
          args.html,
          dashboardPage(summarize(records, refusals, since, /* @__PURE__ */ new Date(), runs))
        );
        console.log(`
Dashboard saved to ${args.html}`);
      }
      return 0;
    }
    case "codex-agents":
      result = codexAgents(repo, Boolean(args.install));
      break;
    case "docs-check":
      result = docsCheck(repo, { oneSentencePerLine: Boolean(args["one-sentence-per-line"]) });
      break;
    case "retired-names":
      result = retiredNames(repo);
      break;
    case "checks":
      result = collectChecks(
        repo,
        positional(0),
        required,
        args["reviewed-head"]
      );
      break;
    case "gate": {
      const resolved = permission();
      result = {
        ...gate(
          inventory(repo).head,
          json(args.checks),
          resolved.ready,
          json(args.review)
        ),
        authorization: resolved
      };
      break;
    }
    default: {
      const task = explicitTask ?? defaultTask(repo);
      const store = new Store(repo, task);
      if (command === "start") {
        const budget = args.budget === void 0 ? void 0 : Number(args.budget);
        if (budget !== void 0 && !Number.isInteger(budget))
          throw new WorkflowError("--budget must be a whole number");
        result = summary(store.start(positional(0), args.constraint ?? [], budget));
      } else if (command === "resume") result = store.resume();
      else if (command === "reconcile") result = summary(store.reconcile(args.found));
      else if (command === "checkpoint") {
        result = summary(
          store.checkpoint(positional(0), args.next, args.acceptance)
        );
      } else if (command === "run") {
        result = await run(store, args.key, args.rest, Number(args.timeout ?? 120));
      } else if (command === "merge") {
        const review = reviewFrom(args);
        const resolved = permission();
        if (resolved.merge_vetoed)
          throw new WorkflowError('repo settings set merge = "never"; configuration veto');
        const problems2 = [];
        if (resolved.missing_user_authorizations.includes("merge"))
          problems2.push("the user has not allowed this merge (--authorized)");
        if (resolved.missing_user_authorizations.includes("publication"))
          problems2.push(
            "merging publishes a release the user has not allowed (--publication-authorized)"
          );
        if (resolved.publication_effect === "unknown")
          problems2.push(
            "inspect what merging triggers first (--publication-effect none or automatic)"
          );
        if (resolved.host_scope !== "allowed")
          problems2.push(
            `host permission scope is ${resolved.host_scope.replace("_", " ")}; use the native tool approval flow (--host-scope)`
          );
        if (!store.exists()) {
          const open = store.openElsewhere();
          if (open.length)
            throw new WorkflowError(
              `Task ${open.map((name) => `'${name}'`).join(", ")} still has uncertain work; resume and reconcile it before merging under a new task record`
            );
          store.start(`Merge PR ${positional(0)}`, []);
          console.error(`Started task record '${task}' for this merge.`);
        }
        result = merge(
          store,
          positional(0),
          resolved.merge_authorized,
          review,
          args.method ?? settings.merge_method ?? DEFAULTS.merge_method,
          required,
          problems2
        );
      } else if (command === "worktree")
        result = createWorktree(store, positional(0), args.ref ?? "HEAD");
      else result = cleanupWorktree(store, positional(0), args["preserved-ref"]);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  const status = result ?? {};
  if (command === "gate" && !status.allowed || command === "docs-check" && !result.ok || command === "run" && !["passed", "reconciled"].includes(status.status ?? "")) {
    return 1;
  }
  return 0;
}
if (import.meta.main) {
  try {
    const code = await main(process.argv.slice(2));
    await new Promise((done) => process.stdout.write("", done));
    process.exit(code);
  } catch (error) {
    const message = error.message;
    const argv = process.argv.slice(2);
    let at = 0;
    while (/^--(repo|task)(=|$)/.test(argv[at] ?? ""))
      at += argv[at].includes("=") ? 1 : 2;
    const name = argv[at] ?? "";
    logRefusal(COMMANDS[name] ? name : "?", message, VERSION);
    console.error(`Blocked: ${message}`);
    if (name === "merge")
      console.error(
        `Merges follow Deliver Change, which lists every requirement: read ${join12(pluginRoot, "skills", "solo-deliver-change", "SKILL.md")}`
      );
    process.exit(2);
  }
}
export {
  main
};
/*! Bundled license information:

smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/date.js:
smol-toml/dist/extract.js:
smol-toml/dist/util.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
