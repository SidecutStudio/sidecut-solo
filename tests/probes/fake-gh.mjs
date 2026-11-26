// A scripted `gh` for probe.sh and the helper tests' fakeGh(): argv is <state dir> <gh args...>. rules.json in the state dir lists
// { args, replies }: the first rule whose args prefix the call answers with its replies in order,
// repeating the last, after `sleep` seconds when a reply sets it. Every call is appended to
// calls.jsonl. Plain JavaScript, so each call skips loading TypeScript.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [dir = '', ...args] = process.argv.slice(2);
appendFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify(args)}\n`);
const rules = JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8'));
const index = rules.findIndex((rule) => rule.args.every((arg, i) => args[i] === arg));
const rule = rules[index];
if (!rule) {
  console.error(`fake gh: no rule for ${args.join(' ')}`);
  process.exit(4);
}
const counter = join(dir, `count-${index}`);
const count = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
writeFileSync(counter, String(count + 1));
const reply = rule.replies[Math.min(count, rule.replies.length - 1)] ?? {};
if (reply.sleep) await sleep(reply.sleep * 1000);
if (reply.stdout !== undefined)
  process.stdout.write(
    typeof reply.stdout === 'string' ? reply.stdout : JSON.stringify(reply.stdout),
  );
if (reply.stderr) process.stderr.write(reply.stderr);
process.exit(reply.code ?? 0);
