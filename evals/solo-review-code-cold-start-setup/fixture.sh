#!/usr/bin/env bash
set -euo pipefail
while IFS='=' read -r name _; do
  case "$name" in GIT_*) unset "$name" ;; esac
done < <(env)
git init -b main
printf 'def add(a, b):
    return a + b
' > calc.py
git add calc.py
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -m Fixture
printf 'def add(a, b):
    return a - b
' > calc.py
