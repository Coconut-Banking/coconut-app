# /ship — End-to-end implementation with team

Full pipeline: plan → team spawn → implement → review → iterate → PR.

## Instructions

You are coordinating a full implementation cycle. Follow these steps exactly:

### Step 0: Load Learnings

Read the project learnings file at `~/.claude/projects/-Users-koushik-github-folder-coconut-app-coconut-app/memory/ship-learnings.md` if it exists. Use these learnings to:
- Avoid repeating past mistakes
- Skip changes that were previously identified as unnecessary
- Apply patterns that worked well before

Also read `CLAUDE.md` in the project root for project conventions.

### Step 1: Plan

Enter plan mode. Thoroughly explore the codebase to understand what already exists before proposing changes. The #1 mistake is proposing changes for things that are already implemented.

For each proposed change:
- Verify the current state of the code FIRST
- Note the exact file, line, and current implementation
- Only propose changes that are actually needed

Present the plan to the user for approval.

### Step 2: Create Team & Tasks

After plan approval, create a team and break the work into parallel tasks. Guidelines:
- Group by file ownership to avoid conflicts (no two workers editing the same file)
- Backend vs frontend is the natural first split
- Within frontend, split by: libs/hooks vs screens/components
- Each task should have a clear, specific description with file paths and exact changes

Worker types to spawn:
- **backend-worker**: API routes, DB queries, server-side logic (general-purpose agent, bypassPermissions)
- **frontend-libs-worker**: hooks, lib/, context files, utilities (general-purpose agent, bypassPermissions)
- **frontend-screens-worker**: app/ screens, components/ (general-purpose agent, bypassPermissions)
- Add a **4th worker** only if there's genuinely independent work (e.g., tests, migrations)

Each worker prompt MUST include:
- The exact files to modify and what to change
- Key patterns from CLAUDE.md (e.g., "use theme.* tokens, not hardcoded colors")
- Past learnings relevant to their work area
- "Read each file THOROUGHLY before editing"

### Step 3: Monitor & Unblock

Wait for all workers to complete. If a worker gets stuck:
- Check their task status
- Send them a message with guidance
- If needed, do the work yourself

### Step 4: Review

After all tasks complete, spawn a review subagent (general-purpose) to:
- Run `git diff` in both repos
- Check for bugs, race conditions, missing edge cases
- Verify no pre-existing functionality was broken
- Flag only REAL issues (not style nits)

### Step 5: Fix Issues

Fix any high/medium severity issues from the review. Don't fix style nits.

### Step 6: Verify

Run TypeScript checks on both codebases. Distinguish new errors from pre-existing ones.

### Step 7: Commit & PR

- Create a branch (name based on the work)
- Commit with a descriptive message
- Push and create PR(s) with summary + test plan

### Step 8: Update Learnings

After the PR is created, update the learnings file with:
- What went well (patterns to repeat)
- What went wrong (mistakes to avoid)
- False positives from the review (things flagged that weren't real issues)
- New project patterns discovered

Write to: `~/.claude/projects/-Users-koushik-github-folder-coconut-app-coconut-app/memory/ship-learnings.md`

---

## User's request

$ARGUMENTS
