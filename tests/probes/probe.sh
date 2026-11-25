#!/bin/sh
# One free, offline probe of a Sidecut Solo build: the helper or the merge guard, run
# in a throwaway git repo with a local bare remote and a scripted gh. No model, no network, no real
# GitHub. The probe is the first argument (an eval runner's prompt); its parts are split by "::". It
# prints exit=<status>, the output, then what the remote holds.
#
#   push::tracking-base        a branch made from origin/main (so it tracks origin/main), then `solo push`
#   push::new-branch           a plain new branch, then `solo push` (control)
#   merge::other-worktree      `solo merge` from main while the PR branch is in another worktree
#   merge::pr-worktree         the same merge run from the PR branch's own worktree (control)
#   merge::two-reviewers       `solo merge` with --reviewer given twice (independent, then same-agent)
#   guard::<mode>::<command>   the merge guard hook on a Bash command, in permission mode <mode>
#
# SOLO_PLUGIN is the plugin folder under test (default: this repo's plugins/sidecut-solo).
here=$(cd "$(dirname "$0")" && pwd)
plugin=${SOLO_PLUGIN:-$here/../../plugins/sidecut-solo}
solo="$plugin/server/data/helper/solo.mjs"
probe=$1
kind=${probe%%::*}
rest=${probe#*::}
[ "$rest" = "$probe" ] && rest=""

tmp=$(mktemp -d "${TMPDIR:-/tmp}/solo-probe-XXXXXX")
trap 'rm -rf "$tmp"' EXIT
# Nothing reaches the developer's own config, logs or GitHub login.
export HOME="$tmp/home" SOLO_HELPER_LOG=off SIDECUT_SKILL_LOG=0 GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=Probe GIT_AUTHOR_EMAIL=probe@example.invalid
export GIT_COMMITTER_NAME=Probe GIT_COMMITTER_EMAIL=probe@example.invalid
mkdir -p "$HOME"
for key in $(env | sed -n 's/^\(GIT_DIR\|GIT_WORK_TREE\|GIT_INDEX_FILE\)=.*/\1/p'); do unset "$key"; done

g() { git -c commit.gpgsign=false -c core.hooksPath=/dev/null -c init.defaultBranch=main "$@"; }

repo="$tmp/repo"
remote="$tmp/remote.git"
g init -q --bare "$remote"
g init -q "$repo"
echo 'def add(a, b):\n    return a + b' >"$repo/calc.py"
g -C "$repo" add calc.py
g -C "$repo" commit -qm base
g -C "$repo" remote add origin "$remote"
g -C "$repo" push -q -u origin main 2>/dev/null

run() {
  out=$("$@" 2>&1)
  echo "exit=$?"
  echo "$out"
}

remote_branches() {
  echo "remote:"
  g -C "$remote" for-each-ref --format='  %(refname:short)' refs/heads
}

# A scripted gh, first on PATH: an open, clean PR 1 at $1 with a passing required check `tests`.
fake_gh() {
  head=$1
  state="$tmp/gh"
  mkdir -p "$state/bin"
  pr="{\"number\":1,\"html_url\":\"https://github.com/o/r/pull/1\",\"head\":{\"sha\":\"$head\"},\"base\":{\"ref\":\"main\"},\"state\":\"open\",\"merged_at\":null,\"merge_commit_sha\":null,\"mergeable\":true,\"mergeable_state\":\"clean\"}"
  merged="{\"number\":1,\"html_url\":\"https://github.com/o/r/pull/1\",\"head\":{\"sha\":\"$head\"},\"base\":{\"ref\":\"main\"},\"state\":\"closed\",\"merged_at\":\"2026-01-01T00:00:00Z\",\"merge_commit_sha\":\"m\",\"mergeable\":true,\"mergeable_state\":\"unknown\"}"
  cat >"$state/rules.json" <<JSON
[
  {"args":["api","repos/{owner}/{repo}/pulls/1"],"replies":[{"stdout":$pr},{"stdout":$pr},{"stdout":$merged}]},
  {"args":["api","--paginate","--slurp"],"replies":[{"stdout":[{"check_runs":[{"name":"tests","status":"completed","conclusion":"success","html_url":"https://ci/tests"}]}]}]},
  {"args":["api","--method","PUT"],"replies":[{"stdout":{"merged":true}}]},
  {"args":["api","repos/{owner}/{repo}/branches/main/protection/required_status_checks"],"replies":[{"stdout":{"contexts":["tests"]}}]},
  {"args":["api"],"replies":[{"stdout":{"statuses":[]}}]}
]
JSON
  printf '#!/bin/sh\nexec node "%s" "%s" "$@"\n' "$here/fake-gh.mjs" "$state" >"$state/bin/gh"
  chmod +x "$state/bin/gh"
  PATH="$state/bin:$PATH"
}

merge_calls() {
  if grep -q '"--method"' "$tmp/gh/calls.jsonl" 2>/dev/null; then echo "gh merge call: yes"; else echo "gh merge call: no"; fi
}

# The PR branch `feature` in its own worktree, one commit ahead of main.
feature_worktree() {
  feature="$tmp/feature"
  g -C "$repo" worktree add -q -b feature "$feature" 2>/dev/null
  echo new >"$feature/feature.txt"
  g -C "$feature" add feature.txt
  g -C "$feature" commit -qm "feature work"
  head=$(g -C "$feature" rev-parse HEAD)
  fake_gh "$head"
}

merge_args() {
  set -- merge 1 --reviewed-head "$head" "$@" --review-notes probe --blocking-findings 0 \
    --authorized --publication-effect none --host-scope allowed
  printf '%s\n' "$@"
}

case "$kind" in
  push)
    case "$rest" in
      tracking-base) g -C "$repo" checkout -q -b feat/x origin/main ;;
      new-branch) g -C "$repo" checkout -q -b feat/x ;;
      *) echo "unknown push probe: $rest"; exit 2 ;;
    esac
    echo two >"$repo/two.txt"
    g -C "$repo" add two.txt
    g -C "$repo" commit -qm two
    run node "$solo" --repo "$repo" push
    remote_branches
    ;;
  merge)
    feature_worktree
    case "$rest" in
      other-worktree) run node "$solo" --repo "$repo" $(merge_args --reviewer independent) ;;
      pr-worktree) run node "$solo" --repo "$feature" $(merge_args --reviewer independent) ;;
      two-reviewers) run node "$solo" --repo "$feature" $(merge_args --reviewer independent --reviewer same-agent) ;;
      *) echo "unknown merge probe: $rest"; exit 2 ;;
    esac
    merge_calls
    ;;
  guard)
    mode=${rest%%::*}
    command=${rest#*::}
    echo 'merge = "when-green"' >"$repo/solo-workflow.toml"
    input=$(node -e 'process.stdout.write(JSON.stringify({hook_event_name:"PreToolUse",cwd:process.argv[1],permission_mode:process.argv[2],tool_name:"Bash",tool_input:{command:process.argv[3]}}))' "$repo" "$mode" "$command")
    out=$(cd "$repo" && printf '%s' "$input" | node "$plugin/hooks/pre-tool-use-merge-guard.mjs")
    echo "exit=$?"
    decision=$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(s?JSON.parse(s).hookSpecificOutput.permissionDecision:"none")})')
    echo "decision=$decision"
    echo "$out"
    ;;
  *)
    echo "unknown probe kind: $kind"
    exit 2
    ;;
esac
