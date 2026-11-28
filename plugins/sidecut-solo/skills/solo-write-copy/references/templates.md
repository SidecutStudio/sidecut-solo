# Homepage and listing copy templates

Use these shapes for homepage and listing copy. For READMEs and technical docs, use [readme-shape.md](readme-shape.md) and write directly from the code instead.

Fill each slot with facts from the product's own repo. Never copy lines from the examples linked below. Read those sources live for full context, and keep quotes to a short line.

## Core habits

1. **Say what it is before what it does.** Open with a plain category noun the reader already knows ("the design skill", "a CLI and library"), not a vague claim.
2. **Make the reader the subject.** Use verbs they already do rather than stacking what the software does internally.
3. **One fact per sentence.** Stop instead of joining three or four clauses with commas and colons.
4. **Name the bad default, then the change.** Use the reader's frustration in their own words (inspired by [Superpowers](https://github.com/obra/superpowers)).
5. **Machinery goes last.** Save implementation words (`worktree`, `MCP`, `manifest`, `CI`, `trace`, `harness`, `orchestration`, `pipeline`, `workflow`, `lifecycle`) and vanity counts (tests, PRs, skills, tools) for later on the page, after the reader knows what the tool does for them (see [Orca](https://orca.dev) and [Hermes Agent](https://hermes-agent.nousresearch.com)).
6. **Take a stance.** Open with a point of view the reader can agree or disagree with, such as [AI Hero](https://www.aihero.dev) ("Bad code is now the most expensive it has ever been."), [Compound Engineering](https://every.to/compound-engineering) ("Each unit of work should make the next one easier."), or [pstack](https://github.com/backnotprop/pstack).
7. **Show the prompt the reader would type.** Real lowercase requests or before-and-after lines sell faster than describing mechanics (see [pstack](https://github.com/backnotprop/pstack) and [Matt Pocock's skills](https://github.com/mattpocock/skills)).
8. **Rhythm and a wink.** Use short contrast pairs once or twice a page, as in [shadcn/ui](https://github.com/shadcn-ui/ui) ("Open Source. Open Code."), [Compound Engineering](https://every.to/compound-engineering), or [Plannotator](https://plannotator.ai) ("Your next plan deserves more than a rubber stamp.").
9. **Fail the competitor-swap test and rewrite.** Avoid generic stats, job-title blocks and boilerplate that could sit unchanged on a competitor's site (counterexample: [promptfoo](https://www.promptfoo.dev)).

## 1. Homepage hero

Choose one shape:

- **Thesis shape** (good for a multi-product site or methodology, as in [AI Hero](https://www.aihero.dev) and [Compound Engineering](https://every.to/compound-engineering)): state the stance as the headline, add two or three short sentences on why it is true, then show what you built about it.
- **Category shape** (as in [Taste Skill](https://tasteskill.dev) and [Orca](https://orca.dev)):
  - **Headline** (at most 8 words): `The [category] for [who]` or `[Thing it does], [the twist]`. Plain nouns only.
  - **Line 2** (one or two sentences): `[Verb the reader does] [their real tools], and [what they get back]. [The surprising convenience].`
  - **One action:** one install command or download button, not three.

Watch for: headlines that name only the company or stack three jobs in a row. Ask whether someone hearing only the headline can tell what the thing is.

## 2. Product section

For one product on a multi-product page:

- **Name and status pill:** a two- or three-word status ("Open source", "Opens with v2").
- **Headline** (at most 8 words): what changes for the reader, never a slogan.
- **Body** (at most two sentences): the bad default, then what the product does as a scene with real tools ("You ask for X. Normally Y. With this, Z.").
- **Up to two labelled lines:** `**Bold label.** One plain sentence.`
- **Proof:** a screenshot or worked example, plus one install action.

Every section on the page must open differently (a question, a scene, a bad default, a command). Check each section's first move so no two match.

## 3. Feature blurb

```markdown
### Plain title, 2 to 4 words

[Reader verb] [object], and [result]. [Optional: where else it works.]
```

Use a noun phrase for the title, not a slogan (see [Orca](https://orca.dev)). Stop after two sentences; if a blurb needs a third, split it into two features.

## 4. How it works

Pick either shape:

- **Three-step shape** (from [Plannotator](https://plannotator.ai)):
  1. "Use your agent normally": the reader changes nothing.
  2. Where the tool steps in, and what the reader sees.
  3. What flows back, plus one line on the effort saved ("No copy-pasting, no retyping.").
- **Story shape** (from [Superpowers](https://github.com/obra/superpowers)): four or five short paragraphs in time order led by time words ("It starts when…", "Once…", "After you've…", "Next…"), ending with one line on how little the reader has to do.

## 5. Why it exists

Numbered problems phrased the way a user complains (from [Matt Pocock's skills](https://github.com/mattpocock/skills)):

1. **"The agent ignored half my instructions"**
   - **The problem:** two sentences naming the bad default.
   - **The fix:** what changes and which feature or skill handles it, plus a short `BEFORE` and `AFTER` line where it clarifies the difference.

## 6. Example prompts

Two or three real requests in fenced code blocks, written the way the reader actually types: lowercase, impatient, specific (from [pstack](https://github.com/backnotprop/pstack)). Put each prompt right after the feature it demonstrates, grounded in what the product really does.

## 7. Closing line

One line with a touch of personality, followed immediately by the install command or main action (examples at [Plannotator](https://plannotator.ai), [pstack](https://github.com/backnotprop/pstack), and [Matt Pocock's skills](https://github.com/mattpocock/skills)).

## 8. Status

State coming-soon items, previews or caveats once, as a two- or three-word pill ("Developer preview") or a single plain sentence (see [DeepSeek Harness](https://deepseek.com/en/harness/)). Never apologize in captions for earlier names or explain in prose why something is not out yet.

## Sources

Read live; keep borrowed quotes to a short line and avoid copying pages:

- [Orca](https://orca.dev) ([GitHub](https://github.com/stablyai/orca))
- [Taste Skill](https://tasteskill.dev) ([GitHub](https://github.com/Leonxlnx/taste-skill))
- [Addy Osmani's Agent Skills](https://skills.addy.ie) ([GitHub](https://github.com/addyosmani/agent-skills))
- [Superpowers](https://github.com/obra/superpowers)
- [Hermes Agent](https://hermes-agent.nousresearch.com) ([GitHub](https://github.com/NousResearch/hermes-agent))
- [DeepSeek Harness](https://deepseek.com/en/harness/) ([GitHub](https://github.com/deepseek-ai/deepseek-harness))
- [Matt Pocock's skills](https://github.com/mattpocock/skills) and [AI Hero](https://www.aihero.dev)
- [pstack](https://github.com/backnotprop/pstack)
- [Plannotator](https://plannotator.ai)
- [shadcn/ui](https://github.com/shadcn-ui/ui)
- [Compound Engineering](https://every.to/compound-engineering) ([GitHub](https://github.com/EveryInc/compound-engineering-plugin))
- Counterexample: [promptfoo](https://www.promptfoo.dev)
