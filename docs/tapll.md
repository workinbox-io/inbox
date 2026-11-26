# Tapll analytics

Work Inbox loads Tapll v0 from the CDN through `/_tapll/u.js`. The public client key is in
`src/layouts/BaseLayout.astro`; middleware proxies collection to `https://in.tapll.com/v1/*`.
The proxy forwards content type, user agent and the site's origin, never app cookies or authorization.
Tapll handles page views, client navigation, entry/exit pages, outbound links and downloads itself.
The existing `/api/collect` analytics remains in place.

Product Analytics is enabled from page load, without a consent banner. Tapll stores its anonymous ID
and session in localStorage. Authenticated pages identify the user by the app's internal ID; sign-out
clears Tapll's user association and rotates the session. Invite paths and mail-forward verification
are excluded. No form content, email addresses, messages, search terms, tokens or amounts are event
properties. Failure reasons are fixed categories rather than server error messages.

## Event catalog

| Event | Feature | Role | Properties | Where it fires |
| --- | --- | --- | --- | --- |
| `signup_started` | `signup` | start | — | Valid registration form submitted |
| `signup_completed` | `signup` | success | — | Account creation API succeeds, before email verification |
| `signup_failed` | `signup` | failure | `reason`: request_rejected/network_error | Registration API rejects or network fails |
| `domain_check_started` | `domain_setup` | start | — | User requests DNS check in Mail settings |
| `domain_check_completed` | `domain_setup` | success | — | DNS check returns active status |
| `domain_check_failed` | `domain_setup` | failure | `reason`: dns_incomplete/request_failed | Required DNS missing or request fails |
| `mail_send_started` | `mail_send` | start | `kind`: new/reply/forward | New message, reply or forward is submitted |
| `mail_send_queued` | `mail_send` | success | `kind`, `scheduled`: boolean | Server accepts the message into the outbox; not a delivery receipt |
| `mail_send_failed` | `mail_send` | failure | `kind`, `reason`: request_failed | Outbox request fails |
| `note_creation_started` | `notes` | start | — | User creates a note, including keyboard and command palette actions |
| `note_created` | `notes` | success | — | Note API returns the created note |
| `note_creation_failed` | `notes` | failure | `reason`: request_failed | Note creation fails |
| `checkout_started` | `checkout` | start | `plan`: starter/pro/business, `interval`: month/year | User chooses a plan in Billing |
| `checkout_completed` | `checkout` | success | — | Paddle.js emits checkout.completed, once per checkout page |
| `checkout_failed` | `checkout` | failure | `reason`: request_failed/checkout_unavailable/checkout_error | Checkout creation fails, Paddle cannot load, or Paddle reports an error |

## Revenue

Billing sends `tapllSessionId` with the checkout request. The server validates the optional UUID and
adds `tapll_session_id` and the authenticated `tapll_user_id` alongside the existing `orgId` in the
Paddle transaction's `custom_data`, which Paddle copies to the subscription. Checkout still works
when analytics is unavailable. Revenue amounts must come from Paddle notifications, never the browser.

Configure the Paddle notification destination and its secret in
[Tapll project settings](https://tapll.com/panel/swift-apps/work-inbox/settings?scope=project#paddle).
This connection is separate from Work Inbox's existing `/api/paddle/webhook` destination.

## Environments and verification

Only `workinbox.io` is currently an allowed production domain. Add preview domains in Tapll Settings →
Domains if they should be measured. Localhost, 127.* and *.local use Sandbox automatically; staging
can force development with `data-env="development"`.

Tests cover event routing, absent/blocked analytics, checkout attribution validation and authenticated
user IDs, plus proxy credentials, upstream failures and Workers-compatible redirects. For browser
verification, use Sandbox for synthetic feature attempts and mock mail/payment APIs to avoid sends
or purchases. Confirm events in Data with their feature and role; verify production using a normal
page visit rather than synthetic feature declarations.

The owner controls the consent decision; the current installation intentionally has no banner.
The privacy policy describes localStorage and Tapll. Review it if the analytics configuration changes.
