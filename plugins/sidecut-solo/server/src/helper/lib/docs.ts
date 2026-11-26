// Checks a project's instructions and docs against the repository: backticked paths exist,
// relative links and #anchors resolve, `<pm> run <script>` names a real script, Solo names are
// current and, when asked, each prose line holds one sentence. Read-only. Claims a script can't
// judge (status, completeness, copied facts) are left to solo-maintain-context's reality check.
import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { load, repoRoot } from './config.ts';
import { git, gitRun } from './git.ts';
import { retiredNames } from './names.ts';

type DocsProblem = {
  file: string;
  line: number;
  kind: 'path' | 'link' | 'anchor' | 'script' | 'retired-name' | 'sentences';
  found: string;
  detail: string;
};

// Vendored and generated copies: their docs belong to someone else.
const SKIP =
  /(^|\/)(node_modules|vendor|third_party|dist|build|\.agents\/skills|\.claude\/skills)\//;
const DOC = /^(?:(?:.*\/)?(?:AGENTS|CLAUDE|README)\.md|[^/]+\.md|docs\/.*\.md)$/;
const NOT_DOCS = /^(?:CHANGELOG|LICENSE|NOTICE)[^/]*$/i;
// Abbreviations that end in a full stop without ending a sentence.
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|no|Mr|Ms|Dr|St)\.$/i;

function listFiles(root: string): string[] {
  try {
    return git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], false)
      .split('\0')
      .filter((path) => path && existsSync(join(root, path)));
  } catch {
    // Not a Git checkout: walk the folder, without following symlinked folders.
    const found: string[] = [];
    const walk = (dir: string) => {
      let entries: Dirent[];
      try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
      } catch {
        return; // An unreadable folder is skipped, not fatal.
      }
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory() && !['.git', 'node_modules'].includes(entry.name)) walk(path);
        else if (entry.isFile()) found.push(path);
      }
    };
    walk('');
    return found;
  }
}

function ignored(root: string, paths: string[]): Set<string> {
  if (!paths.length) return new Set();
  // Exit 1 just means none of them is ignored.
  // Ask about each path as a file and as a folder, since a missing path's kind is unknown.
  const asked = paths.flatMap((path) => [path, `${path.replace(/\/$/, '')}/`]);
  const result = gitRun(root, ['check-ignore', '--no-index', '--stdin', '-z'], asked.join('\0'));
  return new Set(
    result.stdout
      .split('\0')
      .filter(Boolean)
      .flatMap((path) => [path, path.replace(/\/$/, '')]),
  );
}

/** Lines outside fenced code blocks, with inline code kept, as [line number, text]. */
function proseLines(text: string): [number, string][] {
  const lines: [number, string][] = [];
  let fence: string | undefined;
  text.split('\n').forEach((raw, index) => {
    const marker = raw.trimStart().match(/^(`{3,}|~{3,})/)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) {
      fence = fence ? undefined : marker;
      return;
    }
    if (!fence) lines.push([index + 1, raw]);
  });
  return lines;
}

/** GitHub's heading anchors for a Markdown file: lowercase, punctuation dropped, spaces to -. */
export function anchors(text: string): Set<string> {
  const found = new Set<string>();
  const seen = new Map<string, number>();
  let previous = '';
  for (const [, line] of proseLines(text)) {
    for (const [, id] of line.matchAll(/<a\s[^>]*(?:id|name)="([^"]+)"/g)) found.add(id as string);
    // An underlined (setext) heading: a paragraph line followed by === or ---.
    const setext =
      /^ {0,3}(?:=+|-+)\s*$/.test(line) && previous.trim() && !/^\s*([-*+>|#]|\d+\.)/.test(previous)
        ? previous.trim()
        : undefined;
    previous = line;
    const heading = setext ?? /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const plain = heading
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*`]/g, '')
      .replace(/(^|\s)_+|_+(\s|$)/g, '$1$2');
    const base = plain
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count ? `${base}-${count}` : base);
  }
  return found;
}

function globRegex(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i] as string;
    if (char === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') out += '[^/]*';
    else if (char === '?') out += '[^/]';
    else if (char === '{') out += '(?:';
    else if (char === '}') out += ')';
    else if (char === ',' && out.includes('(?:')) out += '|';
    else out += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}(?:/.*)?$`);
}

/** Splits one line's prose (inline code and links removed) into sentence ends that start a new one. */
function extraSentences(line: string): number {
  const trimmed = line.trim();
  if (!trimmed || /^(#|\||<|>\s*\[!|\[[^\]]+\]:)/.test(trimmed)) return 0;
  const prose = trimmed
    .replace(/`[^`]*`/g, 'code')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'url');
  let count = 0;
  for (const match of prose.matchAll(/[.!?]["')\]]*\s+(?=["'(]?[A-Z0-9])/g)) {
    const before = prose.slice(0, match.index + 1);
    if (ABBREVIATIONS.test(before) || /\b[A-Z]\.$/.test(before) || /\d\.$/.test(before)) continue;
    count++;
  }
  return count;
}

/** The line names another repository, so its paths may be that repository's. */
function namesOtherRepo(line: string, self: string, owner: string): boolean {
  // OWNER/repo-name, or any repo under this project's owner; not words like Read/Write.
  for (const [, who, name = ''] of line.matchAll(/\b([A-Z][\w-]*)\/([\w.-]+)/g)) {
    if (name !== self && !name.includes('.') && (name.includes('-') || who === owner)) return true;
  }
  return /\b[\w]+-[\w-]+(?:'s|')(?=\s)/.test(line);
}

/** Scripts from the project's own package.json files; none means the project has no manifest. */
function manifestScripts(root: string, files: string[]): Set<string> | undefined {
  const manifests = files.filter(
    (file) => /(^|\/)package\.json$/.test(file) && !SKIP.test(`/${file}`),
  );
  if (!manifests.length) return undefined;
  const names = new Set<string>();
  for (const file of manifests) {
    try {
      for (const name of Object.keys(
        JSON.parse(readFileSync(join(root, file), 'utf8')).scripts ?? {},
      ))
        names.add(name);
    } catch {
      return undefined;
    }
  }
  return names;
}

export function docsCheck(repo: string, options: { oneSentencePerLine?: boolean } = {}) {
  const root = repoRoot(repo);
  const files = listFiles(root);
  const known = new Set(files);
  const dirs = new Set<string>();
  for (const file of files) {
    for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1)) {
      dirs.add(file.slice(0, at));
    }
  }
  let self = '';
  let owner = '';
  try {
    const url = git(root, ['remote', 'get-url', 'origin']);
    [, owner = '', self = ''] = /([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url) ?? [];
  } catch {}
  const top = new Set(files.map((file) => file.split('/')[0] as string));
  // Top-level folders Git history shows were deleted: a doc pointing into one is stale, not a
  // pointer to another repository.
  const removed = new Set(
    gitRun(root, [
      'log',
      '--no-renames',
      '--diff-filter=D',
      '--format=',
      '--name-only',
      '-n',
      '2000',
    ])
      .stdout.split('\n')
      .filter((file) => file.includes('/'))
      .map((file) => file.split('/')[0] as string)
      .filter((first) => !top.has(first)),
  );
  const protectedPaths = load(root).config.protected_paths ?? [];
  const docs = files.filter(
    (file) =>
      DOC.test(file) &&
      !NOT_DOCS.test(file) &&
      !SKIP.test(`/${file}`) &&
      !protectedPaths.includes(file),
  );
  const exists = (path: string) => {
    const clean = normalize(path).replace(/\/$/, '');
    return known.has(clean) || dirs.has(clean) || clean === '.';
  };
  const matchesGlob = (glob: string) => {
    const pattern = globRegex(glob.replace(/\/$/, ''));
    return files.some((file) => pattern.test(file));
  };
  const scripts = manifestScripts(root, files);
  const problems: DocsProblem[] = [];
  const missing: { problem: DocsProblem; path: string }[] = [];
  const texts = new Map<string, string>();
  const read = (file: string) => {
    if (!texts.has(file)) {
      try {
        texts.set(file, readFileSync(join(root, file), 'utf8'));
      } catch {
        texts.set(file, '');
      }
    }
    return texts.get(file) as string;
  };

  for (const file of docs) {
    const path = join(root, file);
    if (!statSync(path).isFile() || statSync(path).size > 1_000_000) continue;
    const text = read(file);
    const here = dirname(file);
    const own = anchors(text);
    for (const [line, raw] of proseLines(text)) {
      // 1. Backticked repository paths.
      for (const match of raw.matchAll(/(?<!`)`([^`\s]+)`(?!`)/g)) {
        const span = match[1] as string;
        // A path the line says is gone is history, not a pointer.
        const next = raw.slice(match.index + match[0].length, match.index + match[0].length + 30);
        if (/^\W{0,3}(?:was |is |has been )?(?:deleted|removed|retired|renamed|gone)\b/i.test(next))
          continue;
        const token = span
          .replace(/^\.\//, '')
          .replace(/(?::\d+(?:-\d+)?|#.*)$/, '')
          .replace(/[.,;:]$/, '');
        if (!token || /[<>$|=()@~\\]|:\/\/|^\//.test(token)) continue;
        if (token.split('/').some((part) => /^[A-Z][A-Z0-9_]+$/.test(part))) continue;
        const fromDoc = relative('.', join(here, token));
        const first = token.split('/')[0] as string;
        const relativeToDoc = token.startsWith('../') || (here !== '.' && exists(fromDoc));
        if (!top.has(first) && !removed.has(first) && !relativeToDoc) continue;
        if (!token.includes('/') && !/\.\w+$/.test(token) && !dirs.has(token)) continue;
        const ok = /[*?{]/.test(token)
          ? matchesGlob(token) || matchesGlob(fromDoc)
          : exists(token) || exists(fromDoc);
        if (!ok && !namesOtherRepo(raw, self, owner)) {
          const problem: DocsProblem = {
            file,
            line,
            kind: 'path',
            found: span,
            detail: 'no such file or folder in the repository',
          };
          missing.push({ problem, path: token });
        }
      }
      // 2. Relative links and their anchors.
      // Links shown as inline code are examples, not links.
      const outsideCode = raw.replace(/`[^`]*`/g, (code) => ' '.repeat(code.length));
      const targets = [
        ...[...outsideCode.matchAll(/\]\(\s*<?([^()\s<>[\]]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(
          (m) => m[1],
        ),
        ...[...outsideCode.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/g)].map((m) => m[1]),
      ];
      for (const target of targets as string[]) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const [rawPath = '', fragment] = target.split('#');
        let linked: string;
        try {
          linked = decodeURIComponent(rawPath);
        } catch {
          linked = rawPath;
        }
        const resolved = linked
          ? relative('.', linked.startsWith('/') ? `.${linked}` : join(here, linked))
          : file;
        if (resolved.startsWith('..')) continue;
        if (linked && !exists(resolved) && !existsSync(join(root, resolved))) {
          problems.push({
            file,
            line,
            kind: 'link',
            found: target,
            detail: 'link target not found',
          });
          continue;
        }
        if (fragment && resolved.endsWith('.md') && !/^L\d+/.test(fragment)) {
          const ids = resolved === file ? own : anchors(read(resolved));
          if (!ids.has(fragment.toLowerCase()) && !ids.has(fragment)) {
            problems.push({
              file,
              line,
              kind: 'anchor',
              found: target,
              detail: `no heading #${fragment} in ${resolved}`,
            });
          }
        }
      }
      // 3. Package scripts.
      for (const [, , name] of raw.matchAll(/\b(npm|pnpm|yarn|bun) run ([\w:.@/-]+)/g)) {
        const script = (name as string).replace(/[.,;:]$/, '');
        if (!scripts || /[/]|\.\w+$/.test(script)) continue;
        if (!scripts.has(script)) {
          problems.push({
            file,
            line,
            kind: 'script',
            found: `run ${script}`,
            detail: 'no such script in package.json',
          });
        }
      }
      // 5. One sentence per line, when the project asks for it.
      if (options.oneSentencePerLine && extraSentences(raw)) {
        problems.push({
          file,
          line,
          kind: 'sentences',
          found: raw.trim().slice(0, 80),
          detail: 'more than one sentence on this line',
        });
      }
    }
  }
  // Paths a project deliberately keeps out of Git (local settings, secrets) are not missing.
  const skip = ignored(
    root,
    missing.map((item) => item.path),
  );
  for (const { problem, path } of missing) if (!skip.has(path)) problems.push(problem);
  // 4. Retired Solo names.
  for (const hit of retiredNames(root).findings) {
    problems.push({
      file: hit.file,
      line: hit.line,
      kind: 'retired-name',
      found: hit.found,
      detail: `use ${hit.use}`,
    });
  }
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const counts: Record<string, number> = {};
  for (const problem of problems) counts[problem.kind] = (counts[problem.kind] ?? 0) + 1;
  return { ok: problems.length === 0, checked: docs, counts, problems };
}
