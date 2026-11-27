#!/usr/bin/env node
// Refuses to end a turn while this session's PR is handed to automerge with nothing waiting on it,
// and raises once a skill the task named that never loaded. See lib/turn-guard.mjs.
import { judgeStop, runHook } from './lib/turn-guard.mjs';

await runHook(judgeStop);
