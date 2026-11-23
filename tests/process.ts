import { type SpawnSyncOptionsWithBufferEncoding, spawnSync } from 'node:child_process';
export function runCommand(argv: string[], options: SpawnSyncOptionsWithBufferEncoding = {}) {
  const [command, ...args] = argv;
  if (!command) throw new Error('Missing command');
  return spawnSync(command, args, { maxBuffer: 32 * 1024 * 1024, ...options });
}
