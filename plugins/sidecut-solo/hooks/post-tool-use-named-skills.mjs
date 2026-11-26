#!/usr/bin/env node
// Notes each Solo skill the session loads, so the Stop hook knows which named skills ran. See
// lib/turn-guard.mjs.
import { noteSkill, runHook } from './lib/turn-guard.mjs';

await runHook(noteSkill);
