# Git activity on collections

Records in a collection pick up branches, commits, pull requests and deploys that mention their ID (`TAS-12`): each
one is linked on the record, and the record's status moves forward by the collection's map. Code: rules in
`src/lib/collections/git.ts`, work in `src/lib/server/collection-git.ts` (job `collections.git`).

## Map statuses

Collection → Edit → **GitHub**: pick a status for each step (empty = don't move):

| Step | Comes from |
|------|------------|
| Branch or pull request opened | a push to a branch named with the ID (⌘⇧. copies one), a PR opened or turned to draft |
| Ready for review | a PR marked ready for review (falls back to the first step) |
| Pull request merged | a merged PR |
| Deployed | a successful deploy to the environment named there (default `production`) of a repo whose merged PR is on the record |

Statuses only move forward along the field's choices. A cancelled record is never moved.

## GitHub webhook

1. Collection → Edit → GitHub → **Set up webhook**. Copy the payload URL and secret.
2. Repo → Settings → Webhooks → Add webhook: paste both, content type `application/json`, events **Pull requests**,
   **Pushes**, **Deployment statuses**.

Jobs with `environment:` in GitHub Actions create deployments on their own, so a deploy workflow needs no changes.
The hosted service needs a plan with API access. "New secret" rotates it; paste the new one into GitHub.

Deploys are matched to merged PRs by time: a PR merged before a successful deploy of its repo counts as shipped. That
holds when you deploy from the default branch.

## Other forges, CI and git hooks

`POST /api/v1/collections/<id>/git-events` with an API key, up to 50 events a call:

```sh
curl -X POST https://workinbox.io/api/v1/collections/$COLLECTION/git-events \
  -H "Authorization: Bearer $WORKINBOX_KEY" -H "Content-Type: application/json" \
  -d '{"events":[{"kind":"pr","repo":"acme/app","url":"https://gitlab.com/acme/app/-/merge_requests/41","texts":["TAS-12 login form"],"state":"merged"}]}'
```

An event: `kind` (`branch` | `commit` | `pr` | `deploy`), `repo`, optional `url` (becomes the link), `texts` (where
IDs are read from), `state` for PRs (`open` | `draft` | `review` | `merged` | `closed`), `environment` for deploys,
`at` (ms). With this API, deploys move only records whose PR links point to GitHub; for other forges send the shipped
IDs as `commit` events instead, with no state.

A local `post-commit` hook (`.git/hooks/post-commit`, executable):

```sh
#!/bin/sh
msg=$(git log -1 --pretty=%B | jq -Rs .)
curl -s -X POST "$WORKINBOX_URL/api/v1/collections/$WORKINBOX_COLLECTION/git-events" \
  -H "Authorization: Bearer $WORKINBOX_KEY" -H "Content-Type: application/json" \
  -d "{\"events\":[{\"kind\":\"commit\",\"repo\":\"$(basename "$(git rev-parse --show-toplevel)")\",\"texts\":[$msg]}]}" >/dev/null &
```

AI agents can attach links themselves with the MCP tool `collection_record_link`.
