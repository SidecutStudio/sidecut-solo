#!/usr/bin/env node
// Notes the Solo skills a prompt names, for the Stop hook to hold the session to. See
// lib/turn-guard.mjs.
import { notePrompt, runHook } from './lib/turn-guard.mjs';

await runHook(notePrompt);
