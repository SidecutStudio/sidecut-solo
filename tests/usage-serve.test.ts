import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'usage-serve-'));
const port = 40000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, [join(import.meta.dirname, '../scripts/usage.ts'), 'serve'], {
    env: {
      ...process.env,
      CLAUDE_USAGE_PORT: String(port),
      CLAUDE_USAGE_FILE: join(dir, 'usage.jsonl'),
      SOLO_HELPER_LOG: join(dir, 'helper.jsonl'),
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      await sleep(50);
    }
  }
});
afterAll(() => {
  server.kill();
  rmSync(dir, { recursive: true, force: true });
});

const log = {
  resourceLogs: [
    {
      scopeLogs: [
        {
          logRecords: [
            {
              attributes: [
                { key: 'event.name', value: { stringValue: 'skill_activated' } },
                { key: 'skill.name', value: { stringValue: 'from-test' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('the receiver serves the dashboard and takes JSON exports from this machine', async () => {
  const page = await fetch(`${base}/?days=7`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Solo usage');
  const post = await fetch(`${base}/v1/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(log),
  });
  expect(post.status).toBe(200);
  expect(readFileSync(join(dir, 'usage.jsonl'), 'utf8')).toContain('from-test');
});

test('a rebinding page (foreign Host) can neither read nor write, and text/plain is refused', async () => {
  const foreignRequest = (method: string, path: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          method,
          path,
          headers: {
            host: 'attacker.example:' + port,
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end(method === 'POST' ? JSON.stringify(log) : undefined);
    });
  expect(await foreignRequest('GET', '/')).toBe(403);
  expect(await foreignRequest('POST', '/v1/logs')).toBe(403);
  const plain = await fetch(`${base}/v1/logs`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;x=json' },
    body: JSON.stringify(log),
  });
  expect(plain.status).toBe(415);
});
