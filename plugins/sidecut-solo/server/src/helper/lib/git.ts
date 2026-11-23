import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// Reads real Git state without fetching, changing branches or hiding user work.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';

export class WorkflowError extends Error {}

type Run = { code: number; stdout: string; stderr: string };

export function spawn(argv: string[], cwd?: string, input?: string, timeoutMs = 30_000): Run {
  try {
    const [command, ...args] = argv;
    if (!command) throw new WorkflowError('Missing command');
    const result = spawnSync(command, args, {
      cwd,
      env: process.env,
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT')
      throw new WorkflowError(command + ' timed out');
    if (result.error) throw result.error;
    return { code: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError(`${argv[0]}: ${(error as Error).message}`);
  }
}

export function gitRun(repo: string, args: string[], input?: string): Run {
  return spawn(['git', '-C', repo, ...args], undefined, input);
}

export function git(repo: string, args: string[], strip = true): string {
  const result = gitRun(repo, args);
  if (result.code) throw new WorkflowError(`git ${args.join(' ')}: ${result.stderr.trim()}`);
  // Porcelain -z output is positional: stripping would eat the leading space of " M path".
  return strip ? result.stdout.trim() : result.stdout;
}

function countStatus(raw: string) {
  const fields = raw.split('\0');
  let changed = 0;
  let untracked = 0;
  for (let index = 0; index < fields.length; index++) {
    const entry = fields[index];
    if (!entry) continue;
    if (entry.startsWith('??')) untracked++;
    else {
      changed++;
      if (/[RC]/.test(entry.slice(0, 2))) index++; // a rename or copy carries its source path next
    }
  }
  return { changed, untracked };
}

const WORKTREE_KEYS = new Set([
  'worktree',
  'HEAD',
  'branch',
  'bare',
  'detached',
  'locked',
  'prunable',
]);
const C_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  f: 12,
  n: 10,
  r: 13,
  t: 9,
  v: 11,
  '\\': 92,
  '"': 34,
};

let cachedVersion: [number, number] | undefined;

/** Tests use this to take the Git < 2.36 path on any installed Git. */
export function forceGitVersion(version: [number, number] | undefined): void {
  cachedVersion = version;
}

function gitVersion(): [number, number] {
  if (cachedVersion) return cachedVersion;
  const result = spawn(['git', 'version']);
  const match = /(\d+)\.(\d+)/.exec(result.stdout);
  if (result.code || !match) {
    throw new WorkflowError(
      `git version: unreadable output ${JSON.stringify(result.stdout.trim())}`,
    );
  }
  cachedVersion = [Number(match[1]), Number(match[2])];
  return cachedVersion;
}

/** Undo Git's C-style quoting ("r\303\251sum\303\251") used without -z. */
export function cUnquote(value: string): string {
  if (!(value.length >= 2 && value.startsWith('"') && value.endsWith('"'))) return value;
  const body = value.slice(1, -1);
  const out: number[] = [];
  let index = 0;
  while (index < body.length) {
    const char = body[index] as string;
    if (char !== '\\') {
      out.push(...new TextEncoder().encode(char));
      index++;
    } else if (/^[0-3][0-7]{2}$/.test(body.slice(index + 1, index + 4))) {
      out.push(Number.parseInt(body.slice(index + 1, index + 4), 8));
      index += 4;
    } else if (index + 1 < body.length && (body[index + 1] as string) in C_ESCAPES) {
      out.push(C_ESCAPES[body[index + 1] as string] as number);
      index += 2;
    } else {
      throw new WorkflowError(
        `git worktree list: unreadable quoted value ${JSON.stringify(value)}`,
      );
    }
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

export function commonDir(repo: string): string {
  return git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
}

/**
 * `worktree list --porcelain` records, one list of lines per worktree. `-z` needs Git 2.36+.
 * Older Git prints paths unquoted, so a newline in a stored path is ambiguous: refuse instead.
 */
function worktreeBlocks(root: string): string[][] {
  const [major, minor] = gitVersion();
  if (major > 2 || (major === 2 && minor >= 36)) {
    const raw = git(root, ['worktree', 'list', '--porcelain', '-z'], false);
    return raw
      .split('\0\0')
      .filter(Boolean)
      .map((block) => block.split('\0'));
  }
  const common = commonDir(root);
  const stored = [common];
  const admin = join(common, 'worktrees');
  if (existsSync(admin)) {
    for (const name of readdirSync(admin).sort()) {
      try {
        stored.push(readFileSync(join(admin, name, 'gitdir'), 'utf8').replace(/\n$/, ''));
      } catch {}
    }
  }
  if (stored.some((path) => path.includes('\n'))) {
    throw new WorkflowError(
      `git worktree list: Git ${major}.${minor} has no -z and a worktree path contains a newline, ` +
        'so the listing is ambiguous. Upgrade to Git 2.36+ or move that worktree.',
    );
  }
  const raw = git(root, ['worktree', 'list', '--porcelain'], false);
  const blocks = raw
    .split('\n\n')
    .map((block) => block.split('\n').filter(Boolean))
    .filter((lines) => lines.length);
  for (const lines of blocks) {
    if (
      !lines[0]?.startsWith('worktree ') ||
      lines.some((line) => !WORKTREE_KEYS.has(line.split(' ')[0] as string))
    ) {
      throw new WorkflowError(
        `git worktree list: unexpected porcelain output: ${JSON.stringify(lines)}`,
      );
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;
      if (line.startsWith('locked ')) lines[i] = `locked ${cUnquote(line.slice(7))}`;
    }
  }
  return blocks;
}

function realpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export type Worktree = {
  path: string;
  branch: string | null;
  head?: string;
  current?: boolean;
  files?: { changed: number; untracked: number } | null;
  missing?: boolean;
  [flag: string]: unknown;
};

/** Every worktree with its branch and counts. --no-optional-locks never rewrites another index. */
export function worktrees(root: string): Worktree[] {
  const rows: Worktree[] = [];
  for (const lines of worktreeBlocks(root)) {
    const entry: Worktree = { path: (lines[0] as string).slice('worktree '.length), branch: null };
    for (const line of lines.slice(1)) {
      const space = line.indexOf(' ');
      const key = space < 0 ? line : line.slice(0, space);
      const value = space < 0 ? '' : line.slice(space + 1);
      if (key === 'HEAD') entry.head = value;
      else if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '');
      else if (['bare', 'detached', 'locked', 'prunable'].includes(key)) entry[key] = value || true;
    }
    entry.current = realpath(entry.path) === realpath(root);
    if (entry.bare) entry.files = null;
    else if (!existsSync(entry.path) || !lstatSync(entry.path).isDirectory()) {
      entry.files = null;
      entry.missing = true;
    } else {
      const raw = git(
        entry.path,
        ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
        false,
      );
      entry.files = countStatus(raw);
    }
    rows.push(entry);
  }
  return rows;
}

type Branch = {
  branch: string;
  tip: string;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  sync: string;
};

function sync(track: string, hasUpstream: boolean): [number | null, number | null, string] {
  if (!hasUpstream) return [null, null, 'no upstream'];
  if (track === 'gone') return [null, null, 'upstream gone'];
  const counts: Record<string, number> = {};
  for (const part of track.split(', ').filter(Boolean)) {
    const [name, count] = part.split(' ');
    counts[name as string] = Number(count);
  }
  return [counts.ahead ?? 0, counts.behind ?? 0, track || 'in sync'];
}

/** Local branches with their upstream and ahead/behind counts as of the last fetch. */
function branches(root: string): Branch[] {
  const format =
    '%(refname:short)%09%(objectname)%09%(upstream:short)%09%(upstream:track,nobracket)';
  const refs = git(root, ['for-each-ref', `--format=${format}`, 'refs/heads'], false);
  return refs
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', tip = '', upstream = '', track = ''] = line.split('\t');
      const [ahead, behind, state] = sync(track, Boolean(upstream));
      return { branch: name, tip, upstream: upstream || null, ahead, behind, sync: state };
    });
}

export type Inventory = {
  root: string;
  head: string;
  branch: string;
  status: string[];
  fingerprint: string;
  /** Untracked agent-host files (see HOST_PATHS), which never block delivery. */
  host_untracked: string[];
  branches: Branch[];
  worktrees: Worktree[];
  remotes: string[];
  pr_status: string;
};

// The agent host's own files: Claude Code's worktrees, personal settings and the desktop app's
// launch settings. Other .claude/ files (skills, agents, commands) can belong to the change.
const HOST_PATHS = ['.claude/worktrees/', '.claude/settings.local.json', '.claude/launch.json'];
const hostPath = (name: string) =>
  HOST_PATHS.some((path) => (path.endsWith('/') ? name.startsWith(path) : name === path));

export function inventory(repo: string): Inventory {
  const root = realpath(git(repo, ['rev-parse', '--show-toplevel']));
  let head: string;
  try {
    head = git(root, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    head = '(unborn)';
  }
  const branch = git(root, ['branch', '--show-current']) || '(detached)';
  const raw = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], false)
    .split('\0')
    .filter(Boolean);
  // Untracked host files aren't part of the change: they don't block delivery or change the
  // snapshot, but stay listed.
  const host = raw.filter((entry) => entry.startsWith('?? ') && hostPath(entry.slice(3)));
  const status = raw.filter((entry) => !host.includes(entry));
  const digest = createHash('sha256');
  digest.update(head);
  digest.update(branch);
  digest.update(status.join('\0'));
  digest.update(git(root, ['ls-files', '--stage', '-z'], false));
  digest.update(git(root, ['diff', '--binary']));
  digest.update(git(root, ['diff', '--cached', '--binary']));
  const others = git(root, ['ls-files', '--others', '--exclude-standard', '-z'], false);
  for (const name of others
    .split('\0')
    .filter((name) => name && !hostPath(name))
    .sort()) {
    const path = join(root, name);
    digest.update(name);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) digest.update(readlinkSync(path));
    else if (stat?.isFile()) digest.update(readFileSync(path));
  }
  return {
    root,
    head,
    branch,
    status,
    host_untracked: host.map((entry) => entry.slice(3)),
    fingerprint: digest.digest('hex'),
    branches: branches(root),
    worktrees: worktrees(root),
    remotes: git(root, ['remote']).split('\n').filter(Boolean),
    pr_status: 'unknown; query the authenticated host provider',
  };
}

function patchIds(repo: string, patch: string): Set<string> {
  const result = gitRun(repo, ['patch-id', '--stable'], patch);
  if (result.code) throw new WorkflowError(`git patch-id: ${result.stderr.trim()}`);
  return new Set(
    result.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.split(/\s+/)[0] as string),
  );
}

type MergedRow = Branch & { status: string; current: boolean; pr?: number };
export type Merged = { into: string; target: string; branches: MergedRow[]; pr_lookup?: string };

/**
 * Classify local branches by whether their content is provably in `into`. Read-only for refs,
 * index and working tree (merge-tree may add unreferenced objects). Only "unproven" branches can
 * hold work that the target lacks.
 */
export function mergedBranches(repo: string, into: string): Merged {
  const root = realpath(git(repo, ['rev-parse', '--show-toplevel']));
  const target = git(root, ['rev-parse', '--verify', `${into}^{commit}`]);
  const targetTree = git(root, ['rev-parse', `${target}^{tree}`]);
  const current = git(root, ['branch', '--show-current']);
  const rows: MergedRow[] = [];
  for (const row of branches(root)) {
    let status: string;
    if (gitRun(root, ['merge-base', '--is-ancestor', row.tip, target]).code === 0) {
      status = 'ancestor';
    } else {
      const base = gitRun(root, ['merge-base', target, row.tip]);
      if (base.code === 1) {
        rows.push({ ...row, status: 'unproven', current: row.branch === current });
        continue;
      }
      if (base.code) throw new WorkflowError(`git merge-base: ${base.stderr.trim()}`);
      const baseSha = base.stdout.trim();
      const own = patchIds(root, git(root, ['diff', baseSha, row.tip], false));
      const landed = patchIds(
        root,
        git(root, ['log', '-p', '--format=commit %H', `${baseSha}..${target}`], false),
      );
      const merge = gitRun(root, ['merge-tree', '--write-tree', target, row.tip]);
      if (merge.code !== 0 && merge.code !== 1) {
        throw new WorkflowError(
          `Branch classification needs Git with merge-tree --write-tree support: ${merge.stderr.trim()}`,
        );
      }
      const clean = merge.code === 0 && merge.stdout.split('\n', 1)[0] === targetTree;
      // Historical patch IDs alone do not prove preservation: the target may have reverted the
      // patch. Require the current target tree to contain the branch before labelling history.
      if (clean && own.size && [...own].every((id) => landed.has(id))) status = 'squash-merged';
      else if (clean) status = 'content-in-target';
      else status = 'unproven';
    }
    rows.push({ ...row, status, current: row.branch === current });
  }
  return { into, target, branches: rows };
}

const STABLE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function newer(remote: string, local: string): boolean {
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let i = 0; i < 3; i++)
    if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) > (b[i] as number);
  return true; // equal versions also collide
}

/**
 * Fetch the remote default branch first; fail closed on stale or unavailable remote state.
 * Does not check out or merge. The optional version comparison is for an intended release.
 */
export function freshRemoteState(repo: string, remote = 'origin', versionPath?: string) {
  try {
    // A leading dash would reach git as its own option (--upload-pack runs a program).
    if (remote.startsWith('-')) throw new WorkflowError('remote must be a remote name or URL');
    const listed = spawn(['git', '-C', repo, 'ls-remote', '--symref', remote, 'HEAD']);
    if (listed.code) throw new WorkflowError(listed.stderr.trim() || 'cannot query remote HEAD');
    const match = /^ref:\s+(refs\/heads\/\S+)\s+HEAD$/m.exec(listed.stdout);
    if (!match?.[1]) throw new WorkflowError('remote HEAD has no verifiable default branch');
    const branchRef = match[1];
    const fetched = spawn(
      ['git', '-C', repo, 'fetch', '--no-tags', remote, branchRef],
      undefined,
      undefined,
      60_000,
    );
    if (fetched.code) throw new WorkflowError(fetched.stderr.trim() || 'fetch failed');
    const head = git(repo, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    const output: Record<string, string> = {
      remote,
      default_branch: branchRef.replace(/^refs\/heads\//, ''),
      fetched_head: head,
      remote_state: 'verified',
    };
    if (versionPath !== undefined) {
      const relativePath = normalize(versionPath);
      if (!versionPath || isAbsolute(versionPath) || relativePath.split('/').includes('..')) {
        throw new WorkflowError('version path must stay relative to the repository');
      }
      const local = JSON.parse(readFileSync(join(repo, relativePath), 'utf8')).version;
      const remoteValue = JSON.parse(git(repo, ['show', `${head}:${relativePath}`])).version;
      if (!STABLE.test(local) || !STABLE.test(remoteValue)) {
        throw new WorkflowError('version comparison needs stable X.Y.Z versions');
      }
      Object.assign(output, {
        version_path: relativePath,
        local_version: local,
        remote_version: remoteValue,
      });
      if (newer(remoteValue, local)) {
        throw new WorkflowError(
          `release version collision: remote ${branchRef} is ${remoteValue}, local ${relativePath} is ${local}; bump or reconcile before shipping`,
        );
      }
      output.version_gate = 'passed';
    }
    return output;
  } catch (error) {
    const message = (error as Error).message;
    if (/^(remote state unverified:|release version collision:)/.test(message)) throw error;
    throw new WorkflowError(`remote state unverified: ${message}`);
  }
}
