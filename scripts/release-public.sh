#!/usr/bin/env bash
# Publish the private repo's main to the public repo as one commit, so the day-to-day history stays private.
# Usage: pnpm release:public ["Release message"]
set -euo pipefail
msg="${1:-Release $(date +%Y-%m-%d)}"
git fetch -q origin main
git fetch -q public main
tree=$(git rev-parse 'origin/main^{tree}')
if [ "$tree" = "$(git rev-parse 'public/main^{tree}')" ]; then
  echo "Nothing new to release."
  exit 0
fi
git diff --stat public/main origin/main | tail -1
commit=$(git commit-tree "$tree" -p public/main -m "$msg")
git push public "$commit:refs/heads/main"
echo "Released $commit to workinbox-io/inbox."
