import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Starts the bundled MCP server over stdio from an unrelated folder, as a host would, and calls it.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { runCommand } from './process.ts';

const BUNDLE = join(import.meta.dirname, '..', 'plugins', 'sidecut-solo', 'server', 'index.mjs');
const home = mkdtempSync(join(tmpdir(), 'solo-server-test-'));
const repo = join(home, 'project');

type Reply = { id: number; result?: Record<string, unknown>; error?: { message: string } };
let proc: ChildProcessWithoutNullStreams;
const pending = new Map<number, (reply: Reply) => void>();
let nextId = 1;

function send(message: object) {
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function request(method: string, params: object = {}): Promise<Reply> {
  const id = nextId++;
  const reply = new Promise<Reply>((done) => pending.set(id, done));
  send({ id, method, params });
  return reply;
}

async function call(name: string, args: object) {
  const reply = await request('tools/call', { name, arguments: args });
  return reply.result as {
    isError?: boolean;
    content: { text: string }[];
    structuredContent?: Record<string, unknown>;
  };
}

beforeAll(async () => {
  const git = (...args: string[]) => runCommand(['git', '-C', repo, ...args]);
  runCommand(['git', 'init', '-q', '-b', 'main', repo]);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(repo, 'solo-workflow.toml'), 'base_branch = "main"\n');
  git('add', '.');
  git('commit', '-qm', 'start');
  writeFileSync(join(home, 'usage.jsonl'), '');
  proc = spawn(process.execPath, [BUNDLE], {
    cwd: home,
    stdio: 'pipe',
    env: {
      ...process.env,
      CLAUDE_USAGE_FILE: join(home, 'usage.jsonl'),
      SOLO_HELPER_LOG: join(home, 'helper.jsonl'),
    },
  });
  (async () => {
    let buffer = '';
    for await (const chunk of proc.stdout) {
      buffer += new TextDecoder().decode(chunk);
      let at = buffer.indexOf('\n');
      while (at >= 0) {
        const reply = JSON.parse(buffer.slice(0, at)) as Reply;
        buffer = buffer.slice(at + 1);
        pending.get(reply.id)?.(reply);
        at = buffer.indexOf('\n');
      }
    }
  })();
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  send({ method: 'notifications/initialized' });
});

afterAll(() => {
  proc.kill();
  rmSync(home, { recursive: true, force: true });
});

test('every tool is read-only and says so', async () => {
  const { result } = await request('tools/list');
  const tools = (result?.tools ?? []) as {
    name: string;
    annotations: Record<string, boolean>;
    outputSchema?: object;
    _meta?: { ui?: { resourceUri?: string } };
  }[];
  expect(tools.map((t) => t.name).sort()).toEqual([
    'get_pr_checks',
    'get_settings',
    'get_usage',
    'get_user_facing_changes',
    'get_work_state',
    'list_merged_branches',
  ]);
  for (const tool of tools) {
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(typeof tool.annotations.openWorldHint).toBe('boolean');
    expect(tool.outputSchema).toBeDefined();
  }
  expect(tools.find((t) => t.name === 'get_usage')?._meta?.ui?.resourceUri).toBe(
    'ui://solo/usage.html',
  );
});

test('get_work_state reads the project, not the server folder', async () => {
  const out = await call('get_work_state', { repo });
  expect(out.isError).toBeFalsy();
  const result = out.structuredContent?.result as { branch?: string };
  expect(result.branch).toBe('main');
});

test('without a repo, the folder the host started the server in is the project', async () => {
  const out = await call('get_work_state', {});
  expect(out.isError).toBe(true);
  expect(out.content[0]?.text).toContain('not a git repository');
});

test('get_settings returns merged settings', async () => {
  const out = await call('get_settings', { repo });
  const result = out.structuredContent?.result as { config?: { base_branch?: string } };
  expect(result.config?.base_branch).toBe('main');
});

test('a relative project path is refused', async () => {
  const out = await call('get_work_state', { repo: 'project' });
  expect(out.isError).toBe(true);
  expect(out.content[0]?.text).toBe('Give the project as an absolute path.');
});

test('option values that git would read as flags never reach it', async () => {
  for (const into of ['--upload-pack=touch /tmp/x', '-x', 'main..evil']) {
    const out = await call('list_merged_branches', { repo, into });
    expect(out.isError).toBe(true);
  }
  const nul = await call('get_pr_checks', { repo, pr: 1, requireChecks: ['a\0b'] });
  expect(nul.isError).toBe(true);
  expect(nul.content[0]?.text).toContain('one line');
  const head = await call('get_user_facing_changes', {
    repo,
    base: 'main',
    head: '--output=/tmp/x',
  });
  expect(head.isError).toBe(true);
});

test('a helper refusal comes back as one sentence', async () => {
  const out = await call('list_merged_branches', { repo, into: 'no-such-branch' });
  expect(out.isError).toBe(true);
  expect(out.content[0]?.text).not.toContain('Blocked:');
});

test('get_usage returns a report and a summary the dashboard can draw', async () => {
  const out = await call('get_usage', { days: 7 });
  expect(out.isError).toBeFalsy();
  expect(typeof out.structuredContent?.report).toBe('string');
  expect(out.structuredContent?.summary).toHaveProperty('totals');
  const { result } = await request('resources/read', { uri: 'ui://solo/usage.html' });
  const [view] = (result?.contents ?? []) as { mimeType: string; text: string }[];
  expect(view?.mimeType).toBe('text/html;profile=mcp-app');
  expect(view?.text).toContain('function render(S)');
});

test('started in its own folder, as Codex does, it asks for the project instead of guessing', async () => {
  const lines = [
    {
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      },
    },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/call', params: { name: 'get_work_state', arguments: {} } },
  ].map((m) => JSON.stringify({ jsonrpc: '2.0', ...m }));
  const codex = spawn(process.execPath, ['server/index.mjs'], {
    cwd: join(BUNDLE, '..', '..'),
    stdio: 'pipe',
  });
  codex.stdin.end(lines.join('\n') + '\n');
  let text = '';
  for await (const chunk of codex.stdout) {
    text += new TextDecoder().decode(chunk);
    if (text.includes('"id":2')) break;
  }
  codex.kill();
  const reply = text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Reply)
    .find((r) => r.id === 2);
  const result = reply?.result as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toContain("Give the project's absolute path as repo");
});
