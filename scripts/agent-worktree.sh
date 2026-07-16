#!/usr/bin/env bash
# Save as: scripts/agent-worktree.sh   (chmod +x scripts/agent-worktree.sh)
#
# Give each agent its own isolated branch AND working directory so multiple
# agents can run in parallel without colliding.
#
# Usage:
#   ./scripts/agent-worktree.sh new  feat/events-endpoint
#   ./scripts/agent-worktree.sh list
#   ./scripts/agent-worktree.sh clean feat/events-endpoint
#
# Worktrees live under .worktrees/ (add that to .gitignore).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
WT_BASE="$ROOT/.worktrees"

cmd="${1:-}"

case "$cmd" in
  new)
    BRANCH="${2:?branch name required, e.g. feat/events-endpoint}"
    WT_DIR="$WT_BASE/${BRANCH//\//-}"
    git -C "$ROOT" fetch origin main
    # Branch off the latest main so each agent starts clean.
    git -C "$ROOT" worktree add -b "$BRANCH" "$WT_DIR" origin/main
    echo "✅ Worktree ready:"
    echo "   dir:    $WT_DIR"
    echo "   branch: $BRANCH (based on origin/main)"
    echo
    echo "Point the agent at that directory. When done it should:"
    echo "   1) run: npm run typecheck && (cd backend && npm run typecheck && npm run build)"
    echo "   2) commit on $BRANCH and push"
    echo "   3) open a PR (do NOT merge)"
    ;;

  list)
    git -C "$ROOT" worktree list
    ;;

  clean)
    BRANCH="${2:?branch name required}"
    WT_DIR="$WT_BASE/${BRANCH//\//-}"
    git -C "$ROOT" worktree remove "$WT_DIR" --force
    echo "🧹 Removed worktree $WT_DIR (branch $BRANCH still exists; delete separately if merged)"
    ;;

  *)
    echo "Usage: $0 {new <branch>|list|clean <branch>}" >&2
    exit 1
    ;;
esac
