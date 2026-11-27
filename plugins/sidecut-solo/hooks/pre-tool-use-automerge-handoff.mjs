#!/usr/bin/env node
// Records a command that hands a PR to automerge, so the Stop hook can keep the turn going until
// `solo wait-merge` waits on it. See lib/turn-guard.mjs.
import { recordHandoff, runHook } from './lib/turn-guard.mjs';

await runHook(recordHandoff);
