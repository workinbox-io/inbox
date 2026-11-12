# Mail engine pilot

This is isolated pilot infrastructure, not the completed mail integration.
No production mailbox or existing delivery path is changed by these files.

Use the official Stalwart Docker installation instructions:
https://stalw.art/docs/install/platform/docker/

1. Copy `.env.example` to `.env` and pin a tested image digest.
2. Run `docker compose --env-file .env -f compose.yml config`.
3. Run `docker compose --env-file .env -f compose.yml up -d`.
4. Access bootstrap through an SSH tunnel to VPS port 18080. HTTP is bound to
   loopback; do not expose bootstrap or administrative endpoints through Caddy.
5. In the wizard choose Console logging, SQLite metadata and a separate R2
   bucket for blobs. Configure TLS, app passwords and an authenticated outbound
   relay before publishing protocol ports. Disable direct Internet SMTP delivery.
6. Test two disposable accounts, JMAP imports and changes, shared ACLs,
   credential revocation and SMTP envelope/MIME preservation.
7. Only after those tests pass, add `-f compose.public.yml` to Compose commands
   to publish IMAPS and submission. Keep port 25 closed and existing MX records.

Back up both volumes and the blob bucket as a consistent set; verify a restore
before migrating real mail. Never run `docker compose down -v` on a populated
installation. The CloudFile database, Docker socket and credentials are not
mounted here. Existing CloudFile Caddy can later proxy an authenticated bridge
   endpoint to `127.0.0.1:18090`. Protect this endpoint with TLS; all bridge
   routes require `Authorization: Bearer <MAIL_BRIDGE_TOKEN>`.

The bridge stores encrypted external credentials in its separate volume. Generate
`MAIL_BRIDGE_KEY` with `openssl rand -hex 32` and `MAIL_BRIDGE_TOKEN` with
`openssl rand -hex 32`. Back up the encryption key separately from the database.
Configure Worker secrets `MAIL_BRIDGE_URL` (HTTPS origin of the bridge) and
`MAIL_BRIDGE_TOKEN`. Never proxy the Stalwart bootstrap through that origin.

Authenticated Workinbox sessions can use `/api/app/mail/external-accounts` to
list their own connections and `/api/app/mail/external-accounts/<id>` to PUT
settings, POST a connection test or DELETE credentials. PUT verifies both
servers before saving. The ID is caller-generated (for example a UUID).
Payload: `{address, imap: {host, port: 993, username, password}, smtp:
{host, port: 465|587, username, password}}`. Credentials are never returned.
Accounts are scoped to organization and signed-in user; API keys are rejected.
These connections are not yet synchronized into the mailbox UI.

## Tests

Run `npm ci --prefix services/mail-bridge`, then:

```sh
npm test --prefix services/mail-bridge
npm run test:e2e --prefix services/mail-bridge
node scripts/test-external-connections.mjs
node scripts/test-jmap-engine.mjs
```

E2E requires Docker and OpenSSL. It creates a disposable GreenMail container
from a pinned digest and generates a one-day localhost certificate. The Node
test trusts only that extra certificate; certificate hostname verification stays
enabled. The test checks the production connection verifier, rejects a bad IMAP
password, sends an attachment through SMTPS and reads, flags, moves and deletes
the message over IMAPS. The fixture resolver is supplied directly to the verifier
by the test; the production HTTP API always checks public DNS and pins the IP.
The runner removes its container and temporary certificate directory on exit.

This is protocol E2E, not browser-to-Workinbox synchronization E2E. The latter
requires the remaining application adapter and synchronization implementation.

The browser integration test bundles the real external-connections component
and supplies an HTTP API fixture. It checks failure/retry, clearing passwords,
connection testing and disconnect confirmation. It does not test mail sync.
The settings panel is rendered only when both bridge Worker secrets exist,
including for members who cannot administer organization mail domains.

The JMAP E2E starts the pinned Stalwart image, bootstraps its disposable store,
and runs the actual Workinbox JMAP client through a local HTTPS proxy with a
trusted test certificate. It checks MIME import, account scoping, changes,
folder listing, flag updates and rejection of a stale write. It does not migrate
or change any Workinbox mailbox. Docker and OpenSSL are required.

## Durable engine index pilot

The bridge image includes `node src/sync-engine.mjs`. With the four
`MAIL_ENGINE_*` values in `.env` configured by the operator, run it through
`docker compose --env-file .env -f compose.yml run --rm bridge node src/sync-engine.mjs`.
`MAIL_ENGINE_URL` is the full HTTPS JMAP API URL; use a server-issued API token.
The scope and account id must be assigned by the operator, never by an app user.

This command indexes metadata from that engine account into the bridge SQLite
volume. It persists the cursor and changes atomically, stages full snapshots,
and rebuilds after cursor expiration without publishing an incomplete snapshot.
Per-account leases fence concurrent or expired workers. It resumes committed
delta pages on the next run; it does not yet schedule runs automatically.
It does not fetch external IMAP accounts or update the Workinbox D1 read model.

Still required: external IMAP synchronization,
JMAP application adapter, per-message folder model, UI/API/MCP integration,
mail migration and regression/restore tests. Public clients cannot use Workinbox
accounts until those components and identity provisioning are implemented.
