#!/bin/bash
# PostToolUse hook — fires after every Bash tool call.
# Detects `gh pr create` and starts a background Claude agent that monitors
# CI and pushes fixes if it fails.

set -euo pipefail

INPUT=$(cat)

# Only care about Bash tool invocations that created a PR
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
[ "$TOOL" = "Bash" ] || exit 0

COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")
echo "$COMMAND" | grep -q "gh pr create" || exit 0

RESPONSE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_response',''))" 2>/dev/null || echo "")

PR_URL=$(echo "$RESPONSE" | grep -oE 'https://github\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1)
[ -n "$PR_URL" ] || exit 0

PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
BRANCH=$(git -C "$PWD" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
WORK_DIR="$PWD"

mkdir -p ~/.claude/logs

PROMPT="You are a CI monitor agent for PR #${PR_NUMBER} (${PR_URL}) on branch ${BRANCH}.

Working directory: ${WORK_DIR}

Your job is to make sure CI passes. Follow these steps:

1. Wait for the CI run triggered by this PR. Poll with:
   \`gh run list --branch ${BRANCH} --limit 1 --json status,conclusion,databaseId\`
   Wait up to 10 minutes (poll every 30 seconds). Skip runs that are 'queued' or 'in_progress'.

2. If CI passes (conclusion: success): output 'CI passed ✓' and stop.

3. If CI fails:
   a. Run \`gh run view --log-failed\` to read the failure output.
   b. Identify the root cause (TypeScript error, failing test, lint error, etc.).
   c. Fix the file(s) causing the failure using Edit/Write tools.
   d. Stage, commit, and push:
      git add -A && git commit -m 'fix: address CI failure' && git push
   e. Wait for the new CI run to complete.
   f. Repeat up to 3 fix attempts total. If still failing after 3 attempts, stop and report the unresolved error.

Important:
- Only fix real CI errors — do not refactor unrelated code.
- Do not force push.
- Do not modify .github/workflows/.
- Commit message should start with 'fix:' and describe what was broken."

nohup claude -p "$PROMPT" \
  --allowedTools "Bash,Read,Edit,Write,Glob,Grep" \
  --cwd "$WORK_DIR" \
  > ~/.claude/logs/ci-monitor-pr-${PR_NUMBER}.log 2>&1 &

echo "[ci-monitor] Started background CI watch for PR #${PR_NUMBER}" >&2
exit 0
