#!/bin/sh
# Pulls the latest template into this product. Run on a clean working tree, ideally on a branch:
#   pnpm template:update            # template/main
#   pnpm template:update v1.4.0     # or a tagged release
# The first run adds the `template` remote (set TEMPLATE_REPO or edit URL below).
#
# Two ways in:
# - A product cloned from the template (shared history) merges it.
# - A product whose history was squashed (a public repo that must not carry the template's history) keeps the template
#   commit it is synced to in `.template-ref` and gets the template's changes since then as a three-way patch: no merge
#   commit, no template history, conflicts only where both sides changed the same lines. The ref moves on commit.
set -e
REF="${1:-main}"
URL="${TEMPLATE_REPO:-https://github.com/jakub-kalamarz/saas-template.git}"

git diff --quiet && git diff --cached --quiet || { echo "Commit or stash your changes first."; exit 1; }
git remote get-url template >/dev/null 2>&1 || git remote add template "$URL"
git fetch template --tags --quiet
git rev-parse --verify --quiet "template/$REF" >/dev/null && TARGET="template/$REF" || TARGET="$REF"

if [ -f .template-ref ]; then
  BASE=$(cat .template-ref)
  NEW=$(git rev-parse "$TARGET^{commit}")
  [ "$BASE" = "$NEW" ] && { echo "Already at $NEW."; exit 0; }
  # The product owns its migrations: the template's are left out, `pnpm db:generate` makes one from the merged schema.
  if git diff --binary "$BASE" "$NEW" -- . ':!migrations' ':!.template-ref' | git apply --3way --index; then
    CLEAN=1
  else
    CLEAN=
  fi
  echo "$NEW" > .template-ref && git add .template-ref
  if [ -n "$CLEAN" ]; then
    printf "\nApplied template changes %s..%s. Next: pnpm install && pnpm db:generate && pnpm typecheck, then git commit\n" "$(echo "$BASE" | cut -c1-7)" "$(echo "$NEW" | cut -c1-7)"
  else
    printf "\nResolve the conflicts above (git status), then: pnpm db:generate && git add -A && git commit\n"
  fi
  exit 0
fi

# --allow-unrelated-histories: a first merge into a squashed repo has no base (prefer .template-ref there, see above).
git merge --no-commit --no-ff --allow-unrelated-histories "$TARGET" || true
# The product owns its migrations: drop the template's and generate one from the merged schema instead.
git restore --source=HEAD --staged --worktree -- migrations

if git diff --name-only --diff-filter=U | grep -q .; then
  printf "\nResolve the conflicts above, then: pnpm db:generate && git add -A && git commit\n"
else
  printf "\nMerged without conflicts. Next: pnpm install && pnpm db:generate && pnpm typecheck, then git commit\n"
fi
