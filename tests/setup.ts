// Loaded before every test file (vitest.config.ts).
import { quietGitEnv } from './git-env.ts';

process.env.SIDECUT_SKILL_LOG = '0';
quietGitEnv();
