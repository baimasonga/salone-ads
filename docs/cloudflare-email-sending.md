# Cloudflare Email Sending (Beta)

Staging uses Cloudflare's native Workers Email Sending binding. The Express
container calls a private authenticated route in its own front Worker; the Worker
calls `EMAIL.send()` and returns the native provider message ID. This avoids an
external sending API token. Existing Resend and Cloudflare REST adapters remain
available for other explicitly configured deployments.

## Staging configuration

`wrangler.staging.toml` binds `EMAIL` and restricts the sender to
`noreply@quantixsl.com`. That domain must be enabled in Cloudflare Email Sending
in the same account as the staging Worker. The deployment workflow sets:

| Server-only setting | Purpose |
| --- | --- |
| `EMAIL_PROVIDER=cloudflare-worker` | Select the native binding adapter |
| `EMAIL_FROM=noreply@quantixsl.com` | Fixed operator-approved sender |
| `EMAIL_BRIDGE_SECRET` | Random server credential generated once by CI |
| `APP_URL` / forwarded `EMAIL_RELAY_URL` | Staging HTTPS origin |

The bridge secret is forwarded only to the server container, never a `VITE_`
variable or a browser. The Worker checks it before inspecting the body, caps the
request size, fixes the sender, and accepts only one recipient per request.
Authenticated GET readiness checks send nothing. Unauthenticated bridge requests
are denied; release verification includes that boundary.

A single test email uses an expressly approved recipient. Do not use Resend's
sandbox addresses as a Cloudflare sandbox. Keep `EMAIL_DISPATCH_SECRET` unset
until scheduled/bulk campaign delivery is approved. Native message acceptance
is not proof of inbox delivery. Cloudflare delivery, bounce and complaint event
ingestion remains unimplemented; provider logs and operational reconciliation
are still needed before full campaign production acceptance.

Cloudflare does not document send deduplication. Neither the server nor bridge
automatically retries HTTP sends. Uncertain audience sends stay `sending`;
tender alerts with prior attempts also require reconciliation. Inspect provider
logs before a manual retry. Existing Resend webhook and deduplication behavior
remain available when Resend is selected.

`GET /api/audience-email/provider-status` requires authentication and platform
administrator access, disables caching, and exposes no secret values. In native
mode it checks bridge readiness without sending; in legacy REST mode it can
verify a token and optionally read a hexadecimal `zoneId`'s sending configuration.
Token validity alone does not prove permission to use the sending REST endpoint.

The legacy REST adapter selects `EMAIL_PROVIDER=cloudflare` and uses
`CLOUDFLARE_EMAIL_API_TOKEN`, `CLOUDFLARE_EMAIL_ACCOUNT_ID` and `EMAIL_FROM`.
Its `cloudflare-request:` fallback is application correlation, not an inbox
receipt. No existing stored API token is deleted by selecting the native adapter.

## Staging instance capacity

Each release has a distinct container routing identity. Before deployment CI
records the previous identity and this run's temporary build identity. After the
new image is ready and the final Worker is published, a short-lived authenticated
maintenance Worker stops only those captured superseded staging identities.
The current identity is explicitly refused, names are bounded/validated, and
the maintenance Worker is deleted in `finally`. Durable Object data is retained.
This prevents dormant old/build containers from exhausting the unchanged
staging two-instance limit. This cleanup is not enabled for production.

References:
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
- https://developers.cloudflare.com/email-service/reference/event-subscriptions/
