# Scaffold a context pack

Start with one rule the user supplied or the repository demonstrates. Name the pack for the area or contract and give it a lowercase, hyphenated identifier. Use the existing `docs/context-packs/README.md` index and keep unrelated entries. If the identifier is already registered or its folder contains files, show what exists and ask whether the user wants to extend it. Preserve existing files.

Create `docs/context-packs/<id>/README.md` with the pack's purpose and a table of the rules it points to. Write the first rule as a Markdown file in that pack's folder. Register the pack with a relative link in the index. Use columns **Pack** and **Applies when** in the index and **Rule** and **Applies when** in the pack README.

For example, an Expo project's index can link **Expo routing** to `expo-routing/README.md` and scope it to route paths, deep links or auth redirects. That pack README can link **Verify cold links** to `verify-cold-links.md` and scope it to an auth-gated route move or redirect change.

The rule file should describe when it applies, what to do, how to check it and the evidence for the rule. A route rule might require testing the old and new URL from a cold launch and link to the relevant regression test or accepted fix.

Resolve the new directory and pointers before writing. Verify the pack appears once in the index and each rule link resolves within the pack. Walk through the examples of a matching task and an unrelated task using the completed index.

[Compound Engineering pack scaffold](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-setup/references/pack-scaffold.md)
