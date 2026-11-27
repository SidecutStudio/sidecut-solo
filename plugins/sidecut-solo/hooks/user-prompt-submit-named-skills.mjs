#!/usr/bin/env node
// Notes the Solo skills the user asks for with a slash command, for the Stop hook to name if they
// never load, and gives a new prompt fresh refusals for open handoffs. See lib/turn-guard.mjs.
import { notePrompt, runHook } from './lib/turn-guard.mjs';

await runHook(notePrompt);
