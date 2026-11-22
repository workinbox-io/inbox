# Work Inbox in the ChatGPT directory

ChatGPT apps are submitted as plugins: a ZIP with `plugin.json` (listing, review test cases) and `mcp.json` (our MCP
server at `https://workinbox.io/mcp`, OAuth with dynamic client registration). Docs:
<https://developers.openai.com/plugins/deploy/submission> and <https://developers.openai.com/plugins/plugin-guidelines>.

## Build the ZIP

```sh
cd chatgpt-app/plugin && rm -f ../work-inbox-chatgpt.zip && zip -r ../work-inbox-chatgpt.zip . -x '.*'
```

Bump `version` in `plugin.json` for every new upload. Tool changes on the server don't need a new ZIP: OpenAI rescans
`/mcp` daily, or press **Rescan** in the portal after a deploy.

## Reviewer demo account (production)

Reviewers sign in with a password, without 2FA or e-mail codes, and need sample data and changes allowed (Pro).

1. Sign up at workinbox.io as `Anna Kowalska` with a mailbox you control for the sign-up mail, no 2FA.
2. Settings → Mail: claim the free address `review.workinbox.io` and add the personal mailbox `anna@review.workinbox.io`.
3. Settings → Mail → Import mail: import `chatgpt-app/demo-mail.mbox` into `anna@`.
4. Notes: create **Client call: Brightloop** (team) with the text below.
5. Give the org an active Pro plan (or a long trial), so notes and contacts changes work.
6. Keep this account and its data as long as the app is listed; reviewers come back for every update.

```markdown
Call with **Marta Kaczmarek** (Brightloop) about the spring campaign.

## Decisions
- Kickoff on the 18th, weekly check-ins on Mondays
- Brightloop sends the brand assets by Friday
- We own the landing page and the e-mail sequence

## To do
- [x] Send the signed contract to finance
- [ ] Draft the timeline
- [ ] Book the kickoff room

## Open questions
1. Do they need the landing page in German too?
2. Who approves the final copy on their side?
```

## Submit

1. platform.openai.com → organization settings: finish business (or individual) verification, as Work Inbox.
2. Record a short demo (ChatGPT web and phone: connect, search, read, draft and Send from the card, a note, a
   contact) and upload it somewhere reviewers can open. Add the URL as `review.demo_recording_url` in `plugin.json`
   or in the portal.
3. <https://platform.openai.com/plugins> → **Upload new or existing plugin** → pick the verified identity → upload the ZIP.
4. **MCPs → Connect**: the portal shows a challenge token. Set it and deploy nothing else:
   `pnpm exec wrangler secret put OPENAI_APPS_CHALLENGE` (served at `https://workinbox.io/.well-known/openai-apps-challenge`),
   then **Verify**, **Connect**, sign in with any account and let the scan finish. Fix findings, deploy, **Rescan**.
5. **Review information → Review details**: the demo account's e-mail and password, login URL
   `https://workinbox.io/login`, and the steps: "Connect, sign in, keep the organization, Allow (with 'Create, change and
   delete data')".
6. **Submit for review**, accept the attestations. Feedback comes by e-mail.
7. Once approved: **Publish plugin**. Then the site rollout: `/chatgpt` page, the `/vs` row, `llms.txt`, docs
   (`content/docs/mcp.md`: "Find Work Inbox in ChatGPT's apps"), the link in Settings → AI apps.
