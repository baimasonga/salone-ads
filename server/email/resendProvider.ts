import { Resend, type WebhookEventPayload } from "resend";

export function verifyResendWebhook(input: {
  payload: string;
  eventId: string;
  timestamp: string;
  signature: string;
  webhookSecret: string;
}): WebhookEventPayload {
  return new Resend(process.env.RESEND_API_KEY).webhooks.verify({
    payload: input.payload,
    headers: { id: input.eventId, timestamp: input.timestamp, signature: input.signature },
    webhookSecret: input.webhookSecret,
  });
}

export async function sendResendEmail(input: { to: string; subject: string; html: string; idempotencyKey: string }): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
  });
  const result = await response.json() as any;
  if (!response.ok || !result?.id) throw new Error(result?.message || "Resend rejected the email.");
  return String(result.id);
}

export function resendEventMetadata(event: WebhookEventPayload): Record<string, string> {
  if (event.type === "email.clicked") {
    return { link: event.data.click.link };
  }
  if (event.type === "email.bounced") {
    return { reason: event.data.bounce.message, type: event.data.bounce.type, subtype: event.data.bounce.subType };
  }
  if (event.type === "email.failed") {
    return { reason: event.data.failed.reason };
  }
  if (event.type === "email.suppressed") {
    return { reason: event.data.suppressed.message, type: event.data.suppressed.type };
  }
  return {};
}
