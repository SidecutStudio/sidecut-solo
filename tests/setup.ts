// Loaded before every test file (vitest.config.ts).
import { quietGitEnv } from './git-env.ts';

// sidecut:start git-env
// A git hook exports GIT_DIR and friends, so a test's git run from one would act on this checkout
// instead of its fixture repo. Dropping them here covers every test and the processes it starts.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];
// sidecut:end git-env

process.env.SIDECUT_SKILL_LOG = '0';
quietGitEnv();
