// Keeps your own Claude Code and Codex usage on this machine. `serve` receives either host's
// OpenTelemetry export (OTLP over HTTP/JSON) on 127.0.0.1:4318 and appends allowlisted fields to a
// JSONL file, each record marked with its host; `report [days]` sums skills, MCP tools, subagents,
// tokens and Claude Code's cost from that file, and how long each skill's
// runs took (see `skillMinutes`), so Decide and Plan can quote measured times instead of guessing.
// Installed copies read the same file with `solo.ts usage`. Nothing leaves the
// machine, and prompts, commands, tool inputs and identities are never written.
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { dashboardPage } from '../plugins/sidecut-solo/server/src/helper/dashboard/page.ts';
import { summarize } from '../plugins/sidecut-solo/server/src/helper/dashboard/summary.ts';
import {
  readJsonl,
  readRefusals,
  readSkillRuns,
  report,
  type UsageRecord,
  usageFile,
} from '../plugins/sidecut-solo/server/src/helper/lib/usage.ts';

export {
  report,
  skillMinutes,
} from '../plugins/sidecut-solo/server/src/helper/lib/usage.ts';

const file = usageFile();
const port = Number(process.env.CLAUDE_USAGE_PORT ?? 4318);

// Only these attributes are stored. Anything else Claude Code sends is dropped on arrival.
const claudeKept = new Set([
  'session.id',
  'skill.name',
  'skill.source',
  'invocation_trigger',
  'plugin.name',
  'plugin.version',
  'marketplace.name',
  'tool_name',
  'tool_source',
  'success',
  'duration_ms',
  'error_type',
  'decision',
  'source',
  'status',
  'transport_type',
  'server_name',
  'is_plugin',
  'agent_type',
  'agent.name',
  'total_tool_uses',
  'model',
  'query_source',
  'effort',
  'type',
  'cost_usd',
  'mcp_server.name',
  'mcp_tool.name',
  'vcs.repository.name',
]);
// Only these attributes of Codex's events are stored: never user.email, user.account_id, tool
// arguments or output, or prompts. conversation.id is stored as session.id.
const codexKept = new Set([
  'conversation.id',
  'model',
  'skill.name',
  'skill.invocation_type',
  'skill.plugin_id',
  'event.kind',
  'input_token_count',
  'output_token_count',
  'cached_token_count',
  'reasoning_token_count',
  'tool_token_count',
  'model_reasoning_effort',
  'tool_name',
  'tool_namespace',
  'duration_ms',
  'success',
  'mcp_server',
  'agent_name',
]);
// tool_parameters also carries Bash commands; keep only the names.
const keptParameters = ['skill_name', 'mcp_server_name', 'mcp_tool_name', 'subagent_type'];

type Value = {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
};
type Attribute = { key: string; value?: Value };
type DataPoint = {
  attributes?: Attribute[];
  timeUnixNano?: string;
  asDouble?: number;
  asInt?: string | number;
};
type Metric = {
  name: string;
  sum?: { dataPoints?: DataPoint[] };
  gauge?: { dataPoints?: DataPoint[] };
};

function scalar(value: Value | undefined) {
  if (!value) return undefined;
  const raw = value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue;
  return raw === undefined ? undefined : String(raw);
}

type Host = 'claude-code' | 'codex';
const hostOf = (name: string): Host => (/^codex[._]/.test(name) ? 'codex' : 'claude-code');

function pick(host: Host, ...lists: (Attribute[] | undefined)[]) {
  const attrs: Record<string, string> = {};
  for (const { key, value } of lists.flatMap((list) => list ?? [])) {
    const text = scalar(value);
    if (text === undefined) continue;
    if (host === 'codex') {
      if (codexKept.has(key)) attrs[key === 'conversation.id' ? 'session.id' : key] = text;
      continue;
    }
    if (claudeKept.has(key)) attrs[key] = text;
    if (key !== 'tool_parameters') continue;
    try {
      const parameters = JSON.parse(text) as Record<string, unknown>;
      for (const name of keptParameters)
        if (typeof parameters[name] === 'string') attrs[name] = parameters[name];
    } catch {}
  }
  return attrs;
}

function isoFrom(nanos: string | undefined) {
  const millis = nanos ? Number(BigInt(nanos) / 1_000_000n) : Date.now();
  return new Date(millis || Date.now()).toISOString();
}

// The Codex events the report reads; any other Codex event (prompts, API requests) is dropped.
const codexEvents = new Set(['codex.skill_invocation', 'codex.sse_event', 'codex.tool_result']);

// Turns one OTLP/JSON export (logs or metrics) into the records the file keeps.
export function toRecords(body: unknown): UsageRecord[] {
  const request = body as {
    resourceLogs?: {
      resource?: { attributes?: Attribute[] };
      scopeLogs?: {
        logRecords?: { timeUnixNano?: string; attributes?: Attribute[]; body?: Value }[];
      }[];
    }[];
    resourceMetrics?: {
      resource?: { attributes?: Attribute[] };
      scopeMetrics?: { metrics?: Metric[] }[];
    }[];
  };
  const records: UsageRecord[] = [];
  for (const resource of request.resourceLogs ?? [])
    for (const scope of resource.scopeLogs ?? [])
      for (const log of scope.logRecords ?? []) {
        const name =
          scalar(log.attributes?.find((a) => a.key === 'event.name')?.value) ?? scalar(log.body);
        if (!name) continue;
        const host = hostOf(name);
        const attrs = pick(host, resource.resource?.attributes, log.attributes);
        // Keep only the Codex events the report reads. Codex sends one sse_event per streamed event;
        // only the completed response carries tokens.
        if (host === 'codex' && !codexEvents.has(name)) continue;
        if (name === 'codex.sse_event' && attrs['event.kind'] !== 'response.completed') continue;
        records.push({
          time: isoFrom(log.timeUnixNano),
          name: name.replace(/^(claude_code|codex)\./, ''),
          attrs,
          host,
        });
      }
  for (const resource of request.resourceMetrics ?? [])
    for (const scope of resource.scopeMetrics ?? [])
      for (const metric of scope.metrics ?? [])
        for (const point of (metric.sum ?? metric.gauge)?.dataPoints ?? [])
          records.push({
            time: isoFrom(point.timeUnixNano),
            name: metric.name,
            attrs: pick(hostOf(metric.name), resource.resource?.attributes, point.attributes),
            value: point.asDouble ?? Number(point.asInt ?? 0),
            host: hostOf(metric.name),
          });
  return records;
}

// GET / on the collector: the dashboard for the last ?days= days (default 7), read fresh each time.
function dashboard(url: URL) {
  const asked = Number(url.searchParams.get('days') ?? 7);
  const days = asked > 0 && asked <= 366 ? asked : 7;
  const summary = summarize(
    readJsonl<UsageRecord>(file),
    readRefusals(),
    new Date(Date.now() - days * 86_400_000),
    new Date(),
    readSkillRuns(),
  );
  return new Response(dashboardPage(summary, { days, live: true }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const localHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

function serve() {
  mkdirSync(dirname(file), { recursive: true });
  createServer(async (request, response) => {
    const send = (status: number, text: string, type = 'text/plain') => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      response.end(text);
    };
    try {
      if (!localHosts.has(request.headers.host ?? '')) return send(403, 'Forbidden');
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/') {
        return send(200, await dashboard(url).text(), 'text/html; charset=utf-8');
      }
      if (request.method !== 'POST' || !url.pathname.startsWith('/v1/'))
        return send(404, 'Not found');
      if (!/^application\/json\s*(;|$)/i.test(request.headers['content-type'] ?? ''))
        return send(415, 'Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) return send(413, 'Payload too large');
        chunks.push(chunk);
      }
      const records = toRecords(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (records.length)
        appendFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
      return send(200, '{}', 'application/json');
    } catch {
      return send(400, 'Invalid request');
    }
  }).listen(port, '127.0.0.1');
  console.log(
    `Receiving Claude Code and Codex telemetry on http://127.0.0.1:${port}, writing ${file}`,
  );
  console.log(`Dashboard: http://127.0.0.1:${port}/`);
}

function main() {
  const [command, days = '30'] = process.argv.slice(2);
  if (command === 'serve') return serve();
  if (command !== 'report') {
    console.error('Usage: node scripts/usage.ts serve | report [days]');
    process.exit(2);
  }
  const records = readJsonl<UsageRecord>(file);
  console.log(report(records, new Date(Date.now() - Number(days) * 86_400_000)));
}

if (import.meta.main) main();
