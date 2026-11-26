# Mail bridge

Workinbox mailboxes are available through IMAPS and authenticated SMTPS. External
accounts synchronize over verified IMAP and send through their original provider.
Hosted mail remains canonical in D1/R2; the protocol engine keeps isolated copies.

Use the official Stalwart Docker installation instructions:
https://stalw.art/docs/install/platform/docker/

1. Copy `.env.example` to `.env` and pin a tested image digest.
2. Run `docker compose --env-file .env -f compose.yml config`.
3. Run `docker compose --env-file .env -f compose.yml up -d`.
4. Access bootstrap through an SSH tunnel to VPS port 18080. HTTP is bound to
   loopback; do not expose bootstrap or administrative endpoints through Caddy.
5. Use Console logging, SQLite metadata and filesystem blobs (the tested backend).
   `scripts/configure-mail-engine.mjs` configures private TLS listeners and the
   service API key. Native SMTP enters the Workinbox queue; engine SMTP listeners
   are removed. An R2 engine blob backend needs its own restore verification.
6. Test two disposable accounts, JMAP imports and changes, shared ACLs,
   credential revocation and SMTP envelope/MIME preservation.
7. Only after the production gates below pass, add `-f compose.public.yml` to
   publish IMAPS and SMTPS after the tests below pass.
   Keep port 25 closed and existing MX records.

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
Set `MAIL_AUTHORIZATION_URL` on the bridge to the Workinbox origin followed by
`/api/internal/mail-bridge/authorize`. This endpoint uses the same bridge secret
and queries current organization membership. The app forwards actor identity in
server-created headers; the bridge checks it against the hashed private scope
and persists it encrypted. Existing connections acquire this identity on their
next authenticated request from the app.

Automatic sync, sending and client access require this authorization endpoint.
SMTP checks membership afresh before attempting delivery. A temporary control
plane failure keeps the mail queued without attempting SMTP; denied membership
cancels it. Native access refreshes every 30 seconds and closes all sessions if
authorization fails or its 45-second lease expires. Removed members' connections
are disconnected and their device passwords revoked. No API key or browser
session can call the internal authorization endpoint without the bridge secret.

Authenticated Workinbox sessions can use `/api/app/mail/external-accounts` to
list their own connections and `/api/app/mail/external-accounts/<id>` to PUT
settings, POST a connection test or DELETE credentials. PUT verifies both
servers before saving. The ID is caller-generated (for example a UUID).
Payload: `{address, imap: {host, port: 993, username, password}, smtp:
{host, port: 465|587, username, password}}`. Credentials are never returned.
Accounts are scoped to organization and signed-in user; API keys are rejected.
With synchronization configured, Settings → Mail provides an Open mail link to
`/app/mail/external/<id>`. This view reads the bound engine account through the
authenticated Workinbox API. It supports folders, paging, message bodies,
read/star flags, moves, Trash, permanent deletion and original/attachment downloads.
HTML uses the existing sandbox and remote-image blocking.

### One-time IMAP import

Owners and admins can copy a source mailbox into an accessible Workinbox mailbox
from Settings → Domains and mailboxes → Import from another mailbox. This needs
the Worker bridge URL/token and the bridge's `MAIL_AUTHORIZATION_URL` above;
it does not require the synchronization engine, SMTP or `MAIL_SYNC_ENABLED`.
Rebuild and restart the bridge when deploying this feature alongside the Worker.

The source uses verified TLS on IMAP port 993 and is opened read-only. The import
takes a finite folder/UID snapshot, processes bounded batches with durable
checkpoints, and resumes automatically after bridge restarts. Failed imports can
be resumed or cancelled in settings. There is no message count limit; the existing
25 MB message limit and destination storage quota apply. Oversized messages are
counted as skipped, and a full mailbox stops the job without advancing its cursor.
Drafts are excluded. Dates, read/star flags and one folder placement are copied;
custom folders become labels. Inbox takes precedence for messages present in
several folders. Existing destination messages are not modified or duplicated.
Source credentials are encrypted in bridge SQLite and removed on completion or
cancellation; failed jobs retain them so they can resume. Each batch rechecks
destination access through the authenticated Workinbox import endpoints. Revoked
destination access cancels the job and deletes its source credentials.

The inbox rail shows active imports below their destination mailbox, including
collapsed mailboxes. Snapshot counts include already-present and skipped messages.
ETA uses measured processing time after at least 20 messages and 30 seconds;
resuming or restarting resets its sample. The indicator links to the Import tab
for recovery and disappears after completion or cancellation. Older jobs rebuild
their remaining count from their saved UID ranges on the next batch, without
downloading mail again. Deploy the bridge update alongside the Worker to enable
the new estimates.

### Client passwords

`MAIL_CLIENT_IMAP_HOST` enables the IMAP clients button for synchronized external
connections. Leave it empty until trusted TLS and public access authorization
are configured. In Compose, install the certificate chain and private key as
`tls/fullchain.pem` and `tls/privkey.pem`, readable by container user `node`.
This directory is excluded from Git and Docker build contexts. Standalone runs
set `MAIL_CLIENT_TLS_CERT` and `MAIL_CLIENT_TLS_KEY`. Restart the bridge after
renewing the certificate.

Each device gets a separate Stalwart app password, displayed
once and restricted to IMAP commands; it cannot send SMTP or use JMAP mail or
administration methods. The client uses the displayed internal username on port
993 with SSL/TLS. For outgoing mail it currently uses the external provider's
SMTP server and credentials.

Passwords can be listed by name and revoked. Disconnect revokes every client
password before removing the source credentials, serializing against concurrent
password creation. If the engine cannot confirm revocation, disconnect fails and
can be retried. No external provider connection is needed for revocation.
The public override exposes only the bridge's TLS gateway, never Stalwart's
IMAP listener directly. The gateway verifies the upstream engine certificate.
Revocation closes all gateway sessions: unaffected devices reconnect with their
own passwords. This is necessary because Stalwart can still serve FETCH from a
previously selected mailbox after its app password is revoked. The gateway
passes IMAP unchanged to Stalwart and never parses credentials. It allows 100
connections total and 10 per source IP. A disconnected copy is accessible only
in the app. Configure the engine's proxy/IP abuse protection before public use;
the engine otherwise sees the bridge's address for every client.

## Workinbox mailboxes

`MAIL_HOSTED_ENABLED=true` enables Settings → Account → Mail clients. Each person
explicitly enables their own permitted personal/shared mailboxes. Existing D1/R2
messages remain canonical; an isolated Stalwart user mirrors each actor/mailbox.
The initial copy uses bounded pages, a change journal and durable checkpoints.
Native changes use conditional writes so a stale client cannot overwrite a newer
web edit. Shared-mailbox removal revokes that profile without removing personal
access. A failed authorization check closes both IMAP and SMTP connections.

Device passwords work on IMAPS 993 and SMTPS 465 with SSL/TLS for both SES
and Cloudflare sending domains.
SMTP accepts only that mailbox's envelope and MIME sender, at most 40 envelope
recipients, 100 attachments and 10 MB of original MIME. The bridge rechecks the
password before queueing. Workinbox's existing outbox enforces membership, plan,
quota, reputation and suppression again at dispatch; Bcc is counted but stripped
from provider MIME. Retries with the same Message-ID and envelope are idempotent;
uncertain sends are retained without automatic retransmission. Sent APPEND and
provider persistence reconcile one copy, allowing Bcc-only header differences.

Read, star and move actions apply to the whole conversation, matching the web
app. Labels are managed in Workinbox and mirrored as client folders (including
renames and safe removal). Client passwords cannot create/rename/delete folders.
Drafts stay on the engine and are not imported into web drafts. The Cloudflare raw
binding sends each envelope recipient separately; any partial outcome remains
uncertain and is never automatically retried. External account clients continue
to send through their original provider's SMTP server.

The change journal and import receipts currently retain their history. Add
acknowledged-cursor compaction before broad rollout. Engine copies and bridge
SQLite/journals must be backed up consistently with their encryption key.

## Automatic synchronization pilot

Set `MAIL_SYNC_ENABLED=true` only after configuring the engine API and IMAPS TLS:

- `MAIL_ENGINE_URL`: full HTTPS JMAP endpoint.
- `MAIL_ENGINE_TOKEN`: server administration token with account creation/query permissions.
- `MAIL_ENGINE_DOMAIN_ID` and `MAIL_ENGINE_DOMAIN`: an internal domain configured in Stalwart.
- `MAIL_ENGINE_IMAP_HOST`: the hostname on the engine's TLS certificate.
- `MAIL_ENGINE_IMAP_TARGET`: trusted connection target, `stalwart` on the Compose network by default.

Each external connection gets a separate engine user with encrypted credentials.
The bridge runs at most two synchronizations simultaneously, checks pending
accounts every 30 seconds, and interrupts a run after five minutes; mbsync's
durable journal resumes progress on the next run. Account identity cannot be
changed underneath an existing journal. A missing create response is reconciled
using the persisted engine identity. Reconnect updates passwords; disconnect
waits for the running task to stop before deleting the external credentials.

Back up engine metadata and mbsync journals together. Never reset a journal to
resolve an error without checking both mailboxes. UIDVALIDITY resets and deletion
or renaming of non-empty folders require recovery; synchronization stops instead
of guessing which messages to delete.
For a failed sync, Settings → Mail → Recover synchronization offers a fresh
copy. It verifies the provider connection, stops the old worker, revokes client
passwords and atomically transfers source credentials to a new connection ID.
The new account gets an independent UID journal. The old journal and local mail
remain untouched and readable; unsynchronized local edits remain in that copy
for comparison or export. Retries return the same replacement connection.
Do not delete the old copy just because the new import has started.

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
The runner also builds the current bridge image and checks bidirectional copies,
flags, moves, expunges, repeated runs and credential failure across two real IMAP
accounts. It checks the actual test container exit status and removes its test
images, containers and certificate directory on exit.

These are protocol and service integration tests, not a single browser-to-provider
E2E through a complete authenticated Workinbox session.

The browser integration test bundles the real external-connections component
and supplies an HTTP API fixture. It checks failure/retry, clearing passwords,
connection testing, disconnect confirmation and the mailbox view's flags, Trash,
permanent deletion, HTML sandbox and remote-image blocking. It does not test sync.
The settings panel is rendered only when both bridge Worker secrets exist,
including for members who cannot administer organization mail domains.

The JMAP E2E starts the pinned Stalwart image, bootstraps its disposable store,
and runs the actual Workinbox JMAP client through a local HTTPS proxy with a
trusted test certificate. It checks MIME import, account scoping, changes,
folder listing, flag updates and rejection of a stale write. It does not migrate
or change any Workinbox mailbox. It also checks actual IMAP app-password login,
revocation in a connected session, denied JMAP privileges, password management
through the HTTP API, and disconnect through the actual bridge process. Finally
it stops the engine, copies both volumes into a new container, and verifies that
message bodies, flags and folders survive the restore. Docker and OpenSSL are
required. This fixture uses local blob storage; it does not verify an R2 restore.

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

The JMAP runner also exercises the actual Workinbox SQL/native HTTP handlers,
original attachments, conversation flags, APPEND, Trash/expunge, label changes,
native SMTP admission, Sent deduplication, token revocation and authenticated
browser settings through the actual React forms, Better Auth and membership
middleware. These checks substitute SQLite/R2 transports for Workers bindings
and stub SES acceptance; they do not send real mail through Amazon SES or run
Astro's deployed Worker runtime. The restore checks use filesystem blobs.

Before enabling production clients, validate the VPS TLS/proxy setup, bound its
RAM/disk usage, configure certificate renewal and consistent backups, and smoke
test the deployed Worker/bridge. If choosing engine R2 blobs instead of the tested
filesystem backend, run a restore with that storage before enabling clients.

## Deployment on the CloudFile VPS

The current client hostname is `mail.workinbox.io`: IMAPS 993 and SMTPS 465,
both with SSL/TLS and a per-device password from Settings → Account → Mail
clients. The HTTPS bridge is token-protected; engine administration is private.
The optional node-host Caddy import lives in `../cloudfile/infra/single/Caddyfile`;
install `workinbox-node.caddy` under that deployment's `sites/node/` directory.
Install `workinbox-client.caddy` under `sites/` and point the DNS-only A record
`mail.workinbox.io` at the VPS. Caddy issues and renews its certificate; the
existing CloudFile cert-sync copies it to `ftps-certs/mail.workinbox.io/`.
The mail maintenance job validates and copies that pair into
`tls/client-fullchain.pem` and `tls/client-privkey.pem`, then restarts mail.
Set `MAIL_CLIENT_IMAP_HOST=mail.workinbox.io` and `MAIL_CLIENT_TLS_CERT/KEY` to
those files under `/run/mail-tls/`. Set `MAIL_CLIENT_TLS_LEGACY_CERT/KEY` to
`/run/mail-tls/fullchain.pem` and `/run/mail-tls/privkey.pem` to preserve the old
`nbg1.cloudfile.dev` client hostname through SNI. The private engine keeps its
existing hostname and certificate. DNS MX records are unchanged.

`compose.cloudfile.yml` bounds bridge RAM to 384 MB and engine RAM to 512 MB.
`/opt/workinbox-mail/state` is a separate 6 GB loop filesystem; preallocate the
backing file after formatting (mkfs may discard the initial allocation). Its
bridge directory belongs to uid 1000; engine/config belong to uid 2000. TLS
files are owned by 1000:2000 with mode 0440. The systemd service requires the
mount, preventing accidental writes into the host filesystem if it is absent.

Use `systemctl restart workinbox-mail` to restart the stack. The maintenance
timer checks certificates every minute and makes one consistent stopped snapshot
each day after 03:00 server time. Services resume before the upload. It reuses
CloudFile's existing backup container to store archives under
`_backups/workinbox-mail/` in its S3 bucket, retaining 14 days. Failed uploads retry
without making another stopped snapshot. The last local archive is retained.

Archives contain engine data/configuration, encrypted connection credentials and
sync journals. They exclude `.env`: keep the original encryption/API keys
separately. The private recovery copy at `infra/mail/.env` is git-ignored and must
remain private. The offsite archive was downloaded, compared with its local
copy, extracted into an isolated engine and checked using its restored service
credential plus SQLite integrity verification.

`node scripts/test-production-mail.mjs` performs an explicit production canary
on the organization's own active `workinbox.io` domain. It creates synthetic
member/mailbox identities, signs in through the real browser UI, creates device
passwords, sends only to its own synthetic recipient, and verifies actual
Cloudflare delivery, binary attachment bytes, Bcc stripping, web/IMAP visibility
and revoked access. Its teardown deletes the synthetic identities and engine
accounts and queues their R2 objects for cleanup. It is not part of normal CI.

Workers fetches use `redirect: manual` and reject non-2xx responses. Workers
does not support Node's `redirect: error`; the proxy regression test covers this
and prevents credentials following redirects.
