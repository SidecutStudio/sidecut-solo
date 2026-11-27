#!/usr/bin/env bash
set -euo pipefail
while IFS='=' read -r name _; do
  case "$name" in GIT_*) unset "$name" ;; esac
done < <(env)
git init -b main
printf '# Line count

This utility counts the lines in a plain text file.
' > README.md
printf '# Keep Solo defaults here.
' > solo-workflow.local.toml
printf 'solo-workflow.local.toml
' >> .git/info/exclude
git add README.md
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -m Fixture
