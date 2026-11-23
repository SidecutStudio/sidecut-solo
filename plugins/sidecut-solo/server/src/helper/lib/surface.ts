// Which changed files people would see: markup, components, styles, copy, images, fonts and the
// product's design rules. Review uses it to decide whether a change also gets a design review, so a
// visual change can't pass as code-only because nobody looked at its file list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './git.ts';
import { type ReviewPolicy, reviewLevel } from './review.ts';

// The deep-review workflow keeps a copy of these patterns (it can't import); a test keeps them equal.
/** Paths that never reach a person: tests, CI, dependencies, build output, prose docs. */
const NOT_SEEN = [
  /(^|\/)(tests?|__tests__|e2e|fixtures|__snapshots__|node_modules|\.github)\//i,
  /^(dist|build|out)\//,
  /\.(test|spec)\.[^/]+$/i,
  /^docs\/(?!(.*\/)?DESIGN\.md$).*\.(md|rst|txt|png|jpe?g|gif|svg|webp)$/i,
  // Code generators' templates for code, settings or Markdown, such as a plugin scaffold's
  // README.md.tmpl or .gitignore.tmpl, outside folders people see; markup templates still count.
  /^(?!(.*\/)?(emails?|public|static|assets|content|copy|locales?|i18n|translations|lang|messages)\/)(.*\/)?[^/]*\.(md|ya?ml|json|toml|[cm]?[jt]s|sh)\.tmpl$/i,
  /^(?!(.*\/)?(emails?|public|static|assets|content|copy|locales?|i18n|translations|lang|messages)\/)(.*\/)?\.[^/.]+\.tmpl$/i,
];

const SEEN: [string, RegExp[]][] = [
  ['design rules', [/(^|\/)DESIGN\.md$/, /(^|\/)components\.json$/i]],
  [
    'styles',
    [
      /\.(css|scss|sass|less|styl|pcss)$/i,
      /(^|\/)(tailwind|postcss)\.config\.[^/]+$/i,
      /(^|\/)(theme|tokens|design-tokens)\.[^/]+$/i,
    ],
  ],
  [
    'markup or components',
    [
      /\.(tsx|jsx|vue|svelte|astro|html?|mjml|hbs|handlebars|liquid|njk|erb|ejs|pug|twig|xib|storyboard)$/i,
      /(View|Screen)\.(swift|kt)$/,
      /(^|\/)res\/(layout|drawable|values|menu)[^/]*\/[^/]+\.xml$/,
    ],
  ],
  [
    'copy',
    [
      /(^|\/)(locales?|i18n|translations|lang|content)\//i,
      /(^|\/)(content|copy|strings)\.(json|ya?ml|[cm]?[jt]sx?)$/i,
      /(^|\/)messages(\.|\/[^/]+\.)(json|ya?ml)$/i,
      /\.(po|xliff|xcstrings|strings|arb|mdx)$/i,
    ],
  ],
  [
    'images, fonts and downloads',
    [
      /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i,
      /(^|\/)(public|static|assets)\/.+\.pdf$/i,
    ],
  ],
  [
    'screens and public files',
    [
      /(^|\/)(components|ui|pages|views|screens|layouts|templates|emails?|styles|public|static|assets)\//i,
    ],
  ],
];

/** Why a person would see this file, or null when they wouldn't. */
function seenBecause(path: string): string | null {
  if (NOT_SEEN.some((re) => re.test(path))) return null;
  return SEEN.find(([, res]) => res.some((re) => re.test(path)))?.[0] ?? null;
}

export function classify(paths: string[]) {
  const user_facing = [...new Set(paths)].sort().flatMap((path) => {
    const reason = seenBecause(path);
    return reason ? [{ path, reason }] : [];
  });
  return {
    changed: new Set(paths).size,
    user_facing,
    design_review: user_facing.length ? ('needed' as const) : ('not needed' as const),
  };
}

/**
 * The files changed since `base` (from where the branch left it), up to `head`, or up to the
 * working tree, untracked files included, when no head is given. A moved file counts by both its
 * old and new path, so a component moved out of the UI still shows.
 */
const BINARY_LINES = 50;

export function userFacing(dir: string, base: string, head?: string, policy?: ReviewPolicy) {
  // Diff paths are relative to the top folder; untracked ones only list from where Git runs.
  const repo = git(dir, ['rev-parse', '--show-toplevel']);
  const baseSha = git(repo, ['rev-parse', '--verify', `${base}^{commit}`]);
  const lines = (out: string) => out.split('\0').filter(Boolean);
  // Added plus deleted lines.
  const changedLines = (range: string) =>
    git(repo, ['diff', '--numstat', '--no-renames', range], false)
      .split('\n')
      .reduce((sum, row) => {
        const [added, deleted] = row.split('\t');
        // numstat prints '-' for a binary file; count it as a mid-sized change, not as nothing.
        if (added === '-') return sum + BINARY_LINES;
        return sum + (Number(added) || 0) + (Number(deleted) || 0);
      }, 0);
  let headLabel: string;
  let paths: string[];
  let changed: number;
  if (head) {
    headLabel = git(repo, ['rev-parse', '--verify', `${head}^{commit}`]);
    paths = lines(
      git(repo, ['diff', '--name-only', '--no-renames', '-z', `${baseSha}...${headLabel}`], false),
    );
    changed = changedLines(`${baseSha}...${headLabel}`);
  } else {
    headLabel = 'working tree';
    const from = git(repo, ['merge-base', baseSha, 'HEAD']);
    const untracked = lines(git(repo, ['ls-files', '--others', '--exclude-standard', '-z'], false));
    paths = [
      ...lines(git(repo, ['diff', '--name-only', '--no-renames', '-z', from], false)),
      ...untracked,
    ];
    changed =
      changedLines(from) +
      untracked.reduce((sum, p) => {
        try {
          return sum + readFileSync(join(repo, p), 'utf8').split('\n').length;
        } catch {
          return sum;
        }
      }, 0);
  }
  return {
    base: baseSha,
    head: headLabel,
    ...classify(paths),
    review: reviewLevel(paths, changed, policy),
  };
}
