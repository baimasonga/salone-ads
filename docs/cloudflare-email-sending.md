# Cloudflare Email Sending (Beta)

The Express container can send using Cloudflare's documented REST endpoint:
`POST /accounts/{account_id}/email/sending/send`. This uses the enabled sending
domain; it does not require a Resend account or the Email Routing send binding.

Configure these secrets on **manohub-staging-container**, independently of
production:

| Secret | Value |
| --- | --- |
| `EMAIL_PROVIDER` | `cloudflare` |
| `EMAIL_FROM` | An operator-approved sender address on the enabled domain |
| `CLOUDFLARE_EMAIL_ACCOUNT_ID` | The Cloudflare account containing that sending domain |
| `CLOUDFLARE_EMAIL_API_TOKEN` | A dedicated API token permitted to send email for that account |

These settings are forwarded to the container at startup. Use the existing
release workflow to create a fresh container revision after changing secrets.
Never use `VITE_` variables for provider credentials. No sending address is
chosen automatically, and a verified sending domain does not establish API-token
permission. Do not copy a deployment token into the email-token binding.

For a first acceptance test, use only a recipient expressly approved by its
owner. Resend's test-recipient service is not a Cloudflare sandbox. The admin
email test endpoint submits one message; it does not trigger campaign dispatch.
Keep `EMAIL_DISPATCH_SECRET` unset until bulk/scheduled delivery is approved.

The REST response reports delivered, queued, and permanently bounced recipients.
The adapter accepts only the requested recipient in delivered/queued and rejects
permanent bounces. It records Cloudflare's `message_id` when returned. Its fallback
`cloudflare-request:` reference is application correlation, **not** a Cloudflare
message ID. Neither identifier is an inbox-delivery receipt.
The existing `sent` state records provider acceptance, which may mean queued.

Cloudflare's documented REST contract does not promise idempotent sends. There
are no automatic HTTP retries. An uncertain audience send stays `sending` and
requires reconciliation; tender alerts with any prior attempt are similarly
blocked from automatic replay. This trades automatic recovery for avoiding
possible duplicate email. Inspect provider logs before retrying manually.

Existing Resend webhook verification remains available for Resend deployments.
Cloudflare bounce, complaint and delivery event ingestion is not implemented in
this change: provider logs remain necessary, and Cloudflare campaign dispatch
should remain disabled until event/suppression handling is completed. A successful
single-message send must not be described as full campaign-delivery acceptance.

References:
- https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
- https://developers.cloudflare.com/email-service/reference/event-subscriptions/

Administrators can use `GET /api/audience-email/provider-status` for read-only
configuration/token checks. An optional 32-character hexadecimal `zoneId` also
checks permission to read that zone's sending-domain status. The endpoint requires
both authentication and platform-admin access, disables caching, and never
returns token values or full provider response bodies. Token validity alone does
not establish Email Sending permission.
