import express from "express";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmailRenderers } from "./templates.js";
import { resendEventMetadata, sendResendEmail, verifyResendWebhook } from "./resendProvider.js";

type AuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => void | Promise<void>;
type StructuredLog = (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void;

type AudienceEmailDependencies = {
  serviceClient: SupabaseClient | null;
  configuredAppOrigin: () => string | null;
  htmlEscape: (value: string) => string;
  structuredLog: StructuredLog;
};

export function createAudienceEmailModule(dependencies: AudienceEmailDependencies) {
  const supabaseServiceClient = dependencies.serviceClient;
  const configuredAppOrigin = dependencies.configuredAppOrigin;
  const htmlEscape = dependencies.htmlEscape;
  const structuredLog = dependencies.structuredLog;
  const { renderAudienceEmail, renderTenderAlertEmail } = createEmailRenderers(htmlEscape);

async function dispatchAudienceCampaign(campaignId: string, force = false): Promise<{ sent: number; failed: number; remaining: number }> {
  if (!supabaseServiceClient) throw new Error("Email delivery requires SUPABASE_SERVICE_ROLE_KEY.");
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) {
    throw new Error("Email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  const appOrigin = configuredAppOrigin();
  if (!appOrigin) throw new Error("Email delivery requires a valid APP_URL for secure unsubscribe links.");
  const { data: campaign, error: campaignError } = await supabaseServiceClient.from("audience_email_campaigns")
    .select("id, subject, preview_text, body, cta_label, cta_href, status, scheduled_at")
    .eq("id", campaignId).single();
  if (campaignError || !campaign) throw new Error("Email campaign was not found.");
  if (campaign.status === "cancelled" || campaign.status === "sent") return { sent: 0, failed: 0, remaining: 0 };
  if (!force && campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) return { sent: 0, failed: 0, remaining: 0 };

  await supabaseServiceClient.from("audience_email_campaigns").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", campaignId);
  const { data: deliveries, error: deliveryError } = await supabaseServiceClient.from("audience_email_deliveries")
    .select("id, recipient_email, public_audience_subscribers!inner(full_name, unsubscribe_token, status)")
    .eq("campaign_id", campaignId).eq("status", "queued").order("queued_at").limit(25);
  if (deliveryError) throw deliveryError;

  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries ?? []) {
    const subscriber = (delivery as any).public_audience_subscribers;
    if (subscriber?.status !== "active") {
      await supabaseServiceClient.from("audience_email_deliveries").update({ status: "suppressed", event_at: new Date().toISOString() }).eq("id", delivery.id);
      continue;
    }
    await supabaseServiceClient.from("audience_email_deliveries").update({ status: "sending" }).eq("id", delivery.id);
    try {
      const unsubscribeHref = `${appOrigin}/unsubscribe?token=${subscriber.unsubscribe_token}`;
      const providerId = await sendResendEmail({
        to: delivery.recipient_email,
        subject: campaign.subject,
        html: renderAudienceEmail({
          subject: campaign.subject, previewText: campaign.preview_text, body: campaign.body,
          ctaLabel: campaign.cta_label, ctaHref: campaign.cta_href, unsubscribeHref,
        }),
        idempotencyKey: `manohub-audience-${delivery.id}`,
      });
      await supabaseServiceClient.from("audience_email_deliveries").update({
        status: "sent", provider_message_id: providerId, sent_at: new Date().toISOString(), error_message: null,
      }).eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      await supabaseServiceClient.from("audience_email_deliveries").update({
        status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed", event_at: new Date().toISOString(),
      }).eq("id", delivery.id);
      failed += 1;
    }
  }

  const { data: statuses } = await supabaseServiceClient.from("audience_email_deliveries").select("status").eq("campaign_id", campaignId);
  const allStatuses = statuses ?? [];
  const remaining = allStatuses.filter(row => row.status === "queued" || row.status === "sending").length;
  const sentCount = allStatuses.filter(row => row.status === "sent" || row.status === "delivered").length;
  const failedCount = allStatuses.filter(row => row.status === "failed" || row.status === "bounced" || row.status === "complained").length;
  await supabaseServiceClient.from("audience_email_campaigns").update({
    status: remaining ? "queued" : "sent",
    sent_count: sentCount,
    failed_count: failedCount,
    sent_at: remaining ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
  return { sent, failed, remaining };
}

async function dispatchTenderAlertDelivery(deliveryId: string): Promise<void> {
  if (!supabaseServiceClient) throw new Error('Tender alert delivery requires SUPABASE_SERVICE_ROLE_KEY.');
  const appOrigin = configuredAppOrigin();
  if (!appOrigin) throw new Error('Tender alert delivery requires a valid APP_URL.');
  const { data: delivery, error: deliveryError } = await supabaseServiceClient
    .from('tender_alert_deliveries')
    .select('id,user_id,recipient_email,frequency,match_ids,status,attempts')
    .eq('id', deliveryId)
    .single();
  if (deliveryError || !delivery) throw new Error('Tender alert delivery was not found.');
  if (['sent', 'delivered', 'bounced', 'complained', 'suppressed'].includes(delivery.status)) return;

  const { data: suppression } = await supabaseServiceClient
    .from('tender_alert_email_suppressions')
    .select('user_id')
    .eq('user_id', delivery.user_id)
    .maybeSingle();
  if (suppression) {
    await supabaseServiceClient.from('tender_alert_deliveries').update({
      status: 'suppressed', event_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', delivery.id);
    await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'suppressed' })
      .eq('email_delivery_id', delivery.id);
    return;
  }

  const { data: matches, error: matchError } = await supabaseServiceClient
    .from('saved_search_matches')
    .select('id,match_score,saved_searches(name),opportunities(title,slug,buyer_name,submission_deadline)')
    .in('id', delivery.match_ids);
  if (matchError) throw matchError;
  const unique = new Map<string, {
    title: string; slug: string; buyerName: string; deadline: string | null; searchName: string; matchScore: number;
  }>();
  for (const match of matches ?? []) {
    const opportunity = (match as any).opportunities;
    if (!opportunity?.slug || unique.has(opportunity.slug)) continue;
    unique.set(opportunity.slug, {
      title: opportunity.title,
      slug: opportunity.slug,
      buyerName: opportunity.buyer_name,
      deadline: opportunity.submission_deadline,
      searchName: (match as any).saved_searches?.name ?? 'Saved search',
      matchScore: Number(match.match_score),
    });
  }
  const opportunities = [...unique.values()];
  if (opportunities.length === 0) throw new Error('Tender alert delivery contains no readable matches.');

  await supabaseServiceClient.from('tender_alert_deliveries').update({
    status: 'sending', attempts: Number(delivery.attempts ?? 0) + 1, updated_at: new Date().toISOString(),
  }).eq('id', delivery.id);
  const subject = delivery.frequency === 'immediate'
    ? `New tender match: ${opportunities[0].title}`
    : `${delivery.frequency === 'daily' ? 'Daily' : 'Weekly'} Hyderra tender digest · ${opportunities.length} match${opportunities.length === 1 ? '' : 'es'}`;
  const providerId = await sendResendEmail({
    to: delivery.recipient_email,
    subject,
    html: renderTenderAlertEmail({ frequency: delivery.frequency, opportunities, appOrigin }),
    idempotencyKey: `manohub-tender-alert-${delivery.id}`,
  });
  await supabaseServiceClient.from('tender_alert_deliveries').update({
    status: 'sent',
    provider_message_id: providerId,
    sent_at: new Date().toISOString(),
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', delivery.id);
  await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'sent' })
    .eq('email_delivery_id', delivery.id);
}

type BackgroundJob = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

async function processAudienceEmailJobs(): Promise<{
  enqueued: number;
  recovered: number;
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
}> {
  if (!supabaseServiceClient) throw new Error("Audience email worker requires SUPABASE_SERVICE_ROLE_KEY.");

  const workerId = `audience-email:${process.pid}:${randomUUID()}`;
  const { data: audienceEnqueued, error: enqueueError } = await supabaseServiceClient
    .rpc("enqueue_due_audience_email_jobs", { p_limit: 20 });
  if (enqueueError) throw enqueueError;
  const { data: tenderEnqueued, error: tenderEnqueueError } = await supabaseServiceClient
    .rpc('enqueue_due_tender_alert_jobs', { p_limit: 50 });
  if (tenderEnqueueError) throw tenderEnqueueError;

  const { data: recovered, error: recoverError } = await supabaseServiceClient
    .rpc("recover_stalled_background_jobs_for_worker", { p_timeout_minutes: 15 });
  if (recoverError) throw recoverError;

  const { data: jobs, error: claimError } = await supabaseServiceClient
    .rpc("claim_background_jobs_for_worker", {
      p_worker_id: workerId,
      p_job_types: ["audience.email.dispatch", "tender.alert.dispatch"],
      p_limit: 10,
    });
  if (claimError) throw claimError;

  let completed = 0;
  let deferred = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as BackgroundJob[]) {
    const campaignId = job.payload?.campaign_id;
    const deliveryId = job.payload?.delivery_id;
    try {
      if (job.job_type === 'tender.alert.dispatch') {
        if (typeof deliveryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deliveryId)) {
          throw new Error('Tender alert job has an invalid delivery_id.');
        }
        await dispatchTenderAlertDelivery(deliveryId);
      } else {
        if (typeof campaignId !== "string" || !/^[0-9a-f-]{36}$/i.test(campaignId)) {
          throw new Error("Audience email job has an invalid campaign_id.");
        }
        const result = await dispatchAudienceCampaign(campaignId);
        if (result.remaining > 0) {
          const { data: didDefer, error: deferError } = await supabaseServiceClient
            .rpc("defer_background_job_for_worker", {
              p_job_id: job.id,
              p_worker_id: workerId,
              p_delay_seconds: 5,
            });
          if (deferError || !didDefer) throw deferError ?? new Error("Worker no longer owns the job.");
          deferred += 1;
          continue;
        }
      }
      const { data: didComplete, error: completeError } = await supabaseServiceClient
        .rpc("complete_background_job_for_worker", {
          p_job_id: job.id,
          p_worker_id: workerId,
        });
      if (completeError || !didComplete) throw completeError ?? new Error("Worker no longer owns the job.");
      completed += 1;

      structuredLog("info", "audience_email.job.processed", {
        job_id: job.id,
        job_type: job.job_type,
        campaign_id: campaignId,
        delivery_id: deliveryId,
        attempt: job.attempts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audience email job failed.";
      const { data: nextStatus, error: failError } = await supabaseServiceClient
        .rpc("fail_background_job_for_worker", {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_error: message,
        });
      if (failError) {
        structuredLog("error", "audience_email.job.fail_transition_failed", {
          job_id: job.id,
          campaign_id: typeof campaignId === "string" ? campaignId : null,
          error_message: failError.message,
        });
      }
      if (job.job_type === 'tender.alert.dispatch' && typeof deliveryId === 'string') {
        await supabaseServiceClient.from('tender_alert_deliveries').update({
          status: 'failed', error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
        }).eq('id', deliveryId);
        if (nextStatus === 'dead_letter') {
          await supabaseServiceClient.from('saved_search_matches').update({ email_status: 'failed' })
            .eq('email_delivery_id', deliveryId);
        }
      }
      failed += 1;
      structuredLog("error", "audience_email.job.failed", {
        job_id: job.id,
        campaign_id: typeof campaignId === "string" ? campaignId : null,
        attempt: job.attempts,
        next_status: nextStatus ?? "unknown",
        error_message: message,
      });
    }
  }

  return {
    enqueued: Number(audienceEnqueued ?? 0) + Number(tenderEnqueued ?? 0),
    recovered: Number(recovered ?? 0),
    claimed: jobs?.length ?? 0,
    completed,
    deferred,
    failed,
  };
}

  function registerWebhook(app: express.Express): void {
  // This route must receive the untouched request bytes: parsing or
  // re-serialising the body before verification invalidates the signature.
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "250kb" }), async (req, res) => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const eventId = req.get("svix-id") || "";
    const timestamp = req.get("svix-timestamp") || "";
    const signature = req.get("svix-signature") || "";
    if (!webhookSecret || !supabaseServiceClient) {
      res.status(503).json({ error: { message: "Email event processing is not configured." } });
      return;
    }
    if (!Buffer.isBuffer(req.body) || !eventId || !timestamp || !signature) {
      res.status(400).json({ error: { message: "Invalid webhook request." } });
      return;
    }

    let event: import("resend").WebhookEventPayload;
    try {
      event = verifyResendWebhook({
        payload: req.body.toString("utf8"),
        eventId,
        timestamp,
        signature,
        webhookSecret,
      });
    } catch {
      res.status(400).json({ error: { message: "Webhook signature verification failed." } });
      return;
    }
    await reconcileWebhookEvent(event, eventId, res);
  });

  async function reconcileWebhookEvent(event: import("resend").WebhookEventPayload, eventId: string, res: express.Response): Promise<void> {
    const serviceClient = supabaseServiceClient;
    if (!serviceClient) return;

    if (!event.type.startsWith("email.") || event.type === "email.received" || !("email_id" in event.data)) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const { data: delivery, error: deliveryError } = await serviceClient
      .from("audience_email_deliveries")
      .select("id, campaign_id")
      .eq("provider_message_id", event.data.email_id)
      .maybeSingle();
    if (deliveryError) {
      res.status(500).json({ error: { message: "Email event lookup failed." } });
      return;
    }
    if (delivery) {
      const { error: insertError } = await serviceClient.from("audience_email_events").insert({
        provider_event_id: eventId,
        delivery_id: delivery.id,
        campaign_id: delivery.campaign_id,
        event_type: event.type,
        occurred_at: event.created_at,
        metadata: resendEventMetadata(event),
      });
      if (insertError && insertError.code !== "23505") {
        res.status(500).json({ error: { message: "Email event could not be recorded." } });
        return;
      }
      res.status(200).json({ received: true, duplicate: insertError?.code === "23505" });
      return;
    }

    const { data: tenderDelivery, error: tenderLookupError } = await serviceClient
      .from("tender_alert_deliveries")
      .select("id,user_id,recipient_email,status")
      .eq("provider_message_id", event.data.email_id)
      .maybeSingle();
    if (tenderLookupError) {
      res.status(500).json({ error: { message: "Tender email event lookup failed." } });
      return;
    }
    if (!tenderDelivery) {
      // Valid events for test emails or another Resend stream are acknowledged
      // so the provider does not retry them indefinitely.
      res.status(202).json({ received: true, matched: false });
      return;
    }

    const { error: tenderEventError } = await serviceClient
      .from("tender_alert_email_events")
      .insert({
        provider_event_id: eventId,
        delivery_id: tenderDelivery.id,
        event_type: event.type,
        occurred_at: event.created_at,
        metadata: resendEventMetadata(event),
      });
    if (tenderEventError?.code === "23505") {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    if (tenderEventError) {
      res.status(500).json({ error: { message: "Tender email event could not be recorded." } });
      return;
    }

    const tenderStatus = event.type === "email.delivered" ? "delivered"
      : event.type === "email.bounced" ? "bounced"
      : event.type === "email.complained" ? "complained"
      : event.type === "email.suppressed" ? "suppressed"
      : event.type === "email.failed" ? "failed"
      : null;
    if (tenderStatus) {
      const occurredAt = event.created_at || new Date().toISOString();
      const { error: statusError } = await serviceClient
        .from("tender_alert_deliveries")
        .update({ status: tenderStatus, event_at: occurredAt, updated_at: new Date().toISOString() })
        .eq("id", tenderDelivery.id);
      if (statusError) {
        res.status(500).json({ error: { message: "Tender delivery status could not be updated." } });
        return;
      }
      const matchStatus = tenderStatus === "delivered" ? "delivered"
        : ["bounced", "failed"].includes(tenderStatus) ? "failed" : "suppressed";
      await serviceClient.from("saved_search_matches").update({ email_status: matchStatus })
        .eq("email_delivery_id", tenderDelivery.id);

      const suppressionReason = tenderStatus === "bounced" ? "bounced"
        : tenderStatus === "complained" ? "complained"
        : tenderStatus === "suppressed" ? "suppressed"
        : null;
      if (suppressionReason) {
        await serviceClient.from("tender_alert_email_suppressions").upsert({
          user_id: tenderDelivery.user_id,
          email: tenderDelivery.recipient_email,
          reason: suppressionReason,
          provider_event_id: eventId,
          suppressed_at: occurredAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    }
    res.status(200).json({ received: true, duplicate: false });
  }
  }

  function registerRoutes(app: express.Express, requireUser: AuthMiddleware, requirePlatformAdmin: AuthMiddleware): void {
  app.post("/api/audience-email/test", requireUser, requirePlatformAdmin, async (req, res) => {
    const { to, subject, previewText = "", body, ctaLabel = "", ctaHref = "" } = req.body ?? {};
    if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      res.status(400).json({ error: { message: "Enter a valid test email address." } });
      return;
    }
    if (typeof subject !== "string" || !subject.trim() || subject.length > 180 || typeof body !== "string" || !body.trim() || body.length > 12000) {
      res.status(400).json({ error: { message: "A valid subject and message body are required." } });
      return;
    }
    try {
      const providerId = await sendResendEmail({
        to: to.trim().toLowerCase(),
        subject: subject.trim(),
        html: renderAudienceEmail({
          subject: subject.trim(),
          previewText: String(previewText).slice(0, 220),
          body,
          ctaLabel: String(ctaLabel).slice(0, 80),
          ctaHref: String(ctaHref).slice(0, 1000),
        }),
        idempotencyKey: `manohub-test-${(req as any).userId}-${Date.now()}`,
      });
      res.json({ id: providerId });
    } catch (error) {
      res.status(503).json({ error: { message: error instanceof Error ? error.message : "Test delivery failed." } });
    }
  });

  app.post("/api/audience-email/dispatch/:campaignId", requireUser, requirePlatformAdmin, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.campaignId)) {
      res.status(400).json({ error: { message: "Invalid campaign identifier." } });
      return;
    }
    try {
      res.json(await dispatchAudienceCampaign(req.params.campaignId, true));
    } catch (error) {
      res.status(503).json({ error: { message: error instanceof Error ? error.message : "Campaign delivery failed." } });
    }
  });

  app.post("/api/audience-email/dispatch-due", async (req, res) => {
    const expectedSecret = process.env.EMAIL_DISPATCH_SECRET?.trim();
    const suppliedSecret = req.get("x-manohub-dispatch-secret")?.trim();
    if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret || !supabaseServiceClient) {
      res.status(403).json({ error: { message: "Dispatch authorization failed." } });
      return;
    }
    try {
      res.json(await processAudienceEmailJobs());
    } catch (error) {
      structuredLog("error", "audience_email.worker.failed", {
        error_message: error instanceof Error ? error.message : "Audience email worker failed.",
      });
      res.status(503).json({
        error: { message: error instanceof Error ? error.message : "Audience email worker failed." },
      });
    }
  });
  }

  return { registerWebhook, registerRoutes };
}
