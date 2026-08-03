# Welcome to Project Aurora

## How We Use Claude

Based on Claude's usage over the last 30 days:

Work Type Breakdown:
  Build Feature    ████████░░░░░░░░░░░░  45%
  Improve Quality  ████░░░░░░░░░░░░░░░░  20%
  Debug Fix        ███░░░░░░░░░░░░░░░░░  15%
  Plan Design      ██░░░░░░░░░░░░░░░░░░  10%
  Write Docs       ██░░░░░░░░░░░░░░░░░░  10%

Top Skills & Commands:
  (none used yet — the team drives Claude through plain conversation and subagents)

Top MCP Servers:
  github              ████████████████████  126 calls
  Claude_Code_Remote  █░░░░░░░░░░░░░░░░░░░  5 calls

## Your Setup Checklist

### Codebases
- [ ] project-aurora — github.com/maxtwotouch/project-aurora (Expo/React Native app at the root, Fastify backend in `backend/` — read CLAUDE.md before touching anything, especially the privacy guardrails)

### MCP Servers to Activate
- [ ] github — all GitHub operations (PRs, merges, branches, CI status); in Claude Code on the web it's preconfigured, locally use the `gh` CLI or add the GitHub MCP server
- [ ] Claude_Code_Remote — remote session utilities (scheduled check-ins, repo attachment) for cloud sessions; comes with Claude Code on the web, nothing to install

### Skills to Know About
- Subagents (`.claude/agents/`) — the team's core workflow: an `orchestrator` coordinates `implementer` → `test-writer` → `reviewer` passes, one worktree and one scoped PR per unit of work. Ask Claude to "run the usual pipeline" on a task and it follows this.
- Verification battery — before any PR: root `npm run typecheck`, `npm run test:app`, `npm run test:i18n`, `npm run test:kp`, plus `cd backend && npm run typecheck && npm run build && npm test`. Claude runs these automatically; expect them in every PR description.
- CODEOWNERS discipline — anything under `src/analytics/`, `src/notifications/`, `backend/src/server.ts`, `backend/data/`, and other privacy-sensitive paths is owner-merged only. Claude will build the PR but never merge it agentically.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
