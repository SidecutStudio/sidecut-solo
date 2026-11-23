// How much review a change gets, from the files it touches and how many lines it changes, so the
// choice is the same every time. Review may raise the level after reading the diff, never lower it.

export const REVIEW_POLICIES = ['auto', 'deep', 'light'] as const;
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number];
export type ReviewLevel = 'light' | 'standard' | 'deep';

/** Areas where a missed defect costs money, data, access or a bad release. */
const DEEP: [string, RegExp[]][] = [
  [
    'sign-in, accounts or secrets',
    [
      /(^|[/_.-])(auth|authn|authz|authenticat\w*|authori[sz]\w*|oauth|oidc|saml|sso|log-?in|log-?out|sign-?in|sign-?up|session|password|passkey|mfa|otp|secret|credential|permission|rbac|acl|crypto|encrypt\w*|decrypt\w*)s?([/_.-]|$)/i,
      // Token code, not design tokens: only source files.
      /(^|[/_.-])(jwt|api-?keys?|tokens?)([/_.-][^/]*)?\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|swift|php)$/i,
      /(^|\/)\.env(\.[^/]+)?$/,
    ],
  ],
  [
    'payments or billing',
    [
      /(^|[/_.-])(pay|payment|billing|invoice|checkout|stripe|subscription|price|pricing|refund|wallet)s?([/_.-]|$)/i,
    ],
  ],
  [
    'stored data',
    [
      /(^|\/)(migrations?|schema|prisma|drizzle|supabase|db|database)\//i,
      /\.sql$/i,
      /(^|\/)schema\.(prisma|ts|sql|graphql)$/i,
    ],
  ],
  [
    'delivery and its guards',
    [
      /(^|\/)\.github\/workflows\//,
      /(^|\/)(plugins\/[^/]+\/hooks|\.husky|\.githooks)\//,
      /^hooks\//,
      /(^|\/)hooks\/hooks\.json$/,
      /^(\.claude\/settings(\.local)?\.json|\.codex\/(config\.toml|hooks\.json))$/,
      /(^|\/)(release|deploy|publish)[^/]*\.[^/]+$/i,
      /^solo-workflow\.toml$/,
      /(^|\/)CODEOWNERS$/,
      /(^|\/)(lefthook\.ya?ml|vercel\.json|wrangler\.(toml|jsonc?)|netlify\.toml|fly\.toml|Dockerfile)$/i,
    ],
  ],
];

/** Files whose changes rarely hide a behavior defect: prose, lockfiles, images. A package.json
 * counts only beside a lockfile, the shape of a dependency bump. */
const LIGHT = [
  /\.(md|mdx|rst|txt)$/i,
  /(^|\/)(LICENSE|NOTICE)$/,
  /(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|go\.sum)$/,
  /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i,
];
const LOCKFILE = LIGHT[2] as RegExp;
/** Markdown that steers an agent, or states the product's rules, is behavior, not prose. */
const INSTRUCTIONS = [
  /(^|\/)(skills|agents|references|rules|prompts|\.claude|\.codex|\.cursor)\/.*\.md$/,
  /(^|\/)(AGENTS|CLAUDE|GEMINI|SECURITY)\.md$/,
  /(^|\/)specification\.md$/i,
  /(^|\/)agents\/[^/]+\.toml$/,
];

const LARGE_FILES = 40;
const LARGE_LINES = 1500;
const SMALL_LINES = 10;

export function reviewLevel(paths: string[], lines: number, policy: ReviewPolicy = 'auto') {
  const files = [...new Set(paths)];
  const reasons: string[] = [];
  for (const [why, res] of DEEP) {
    if (files.some((p) => res.some((re) => re.test(p)))) reasons.push(why);
  }
  if (files.length > LARGE_FILES || lines > LARGE_LINES) reasons.push('a large change');
  let level: ReviewLevel;
  if (reasons.length || policy === 'deep') level = 'deep';
  else if (
    policy === 'light' ||
    files.every(
      (p) =>
        (LIGHT.some((re) => re.test(p)) ||
          (/(^|\/)package\.json$/.test(p) && files.some((f) => LOCKFILE.test(f)))) &&
        !INSTRUCTIONS.some((re) => re.test(p)),
    ) ||
    (lines <= SMALL_LINES &&
      files.length === 1 &&
      ![...INSTRUCTIONS, /(^|\/)package\.json$/].some((re) => re.test(files[0] ?? '')))
  ) {
    level = 'light';
  } else level = 'standard';
  if (!reasons.length)
    reasons.push(policy === 'auto' ? `${level} by its files and size` : `review = "${policy}"`);
  return { level, reasons, files: files.length, lines };
}
