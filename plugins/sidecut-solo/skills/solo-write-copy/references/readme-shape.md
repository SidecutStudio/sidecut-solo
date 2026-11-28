# README and technical doc shape

Write a README or technical doc directly from the code in the repo. Do not apply homepage marketing rules, slogans or lists of guarantees. Follow this plain, runnable order from top to bottom:

1. **Title and one-sentence summary:** `# Name` followed by one sentence saying what it is and what you do with it.
2. **Plain boundary note:** one short paragraph stating where it runs, what it touches or sends, and what stays local.
3. **Install:** runtime requirements, dependencies and the exact install or direct-run commands in a code block.
4. **Commands:** every command with a short inline comment on what it does, followed by a flags table (`| Flag | Effect |`), exit codes and the exact error output format.
5. **Config or definition file:** top-level keys listed once, followed by one real, commented example file and a concise note on placeholders, options and static validation.
6. **Worked examples:** two complete examples (for instance, a primary local workflow and an integration or network example), each with one runnable snippet and one plain paragraph on how it behaves.
7. **Where data lives:** exact directories and files created on disk and what each holds.
8. **Tests:** the exact test command and what it covers.

Skip overview tables of skills or features at the top; put commands, real examples and exact behaviour first so a reader can run the tool without guessing.
