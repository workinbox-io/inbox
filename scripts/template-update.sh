#!/bin/sh
# Pulls the latest template into this product. Run on a clean working tree, ideally on a branch:
#   pnpm template:update            # merge template/main
#   pnpm template:update v1.4.0     # or a tagged release
# The first run adds the `template` remote (set TEMPLATE_REPO or edit URL below).
set -e
REF="${1:-main}"
URL="${TEMPLATE_REPO:-git@github.com:OWNER/saas-template.git}"

git diff --quiet && git diff --cached --quiet || { echo "Commit or stash your changes first."; exit 1; }
git remote get-url template >/dev/null 2>&1 || git remote add template "$URL"
git fetch template --tags --quiet
git rev-parse --verify --quiet "template/$REF" >/dev/null && TARGET="template/$REF" || TARGET="$REF"

git merge --no-commit --no-ff "$TARGET" || true
# The product owns its migrations: drop the template's and generate one from the merged schema instead.
git restore --source=HEAD --staged --worktree -- migrations

if git diff --name-only --diff-filter=U | grep -q .; then
  printf "\nResolve the conflicts above, then: pnpm db:generate && git add -A && git commit\n"
else
  printf "\nMerged without conflicts. Next: pnpm install && pnpm db:generate && pnpm typecheck, then git commit\n"
fi
