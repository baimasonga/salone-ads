import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const server = read("server.ts");
const emailModule = read("server/email/audienceEmail.ts");
const provider = read("server/email/resendProvider.ts");
const templates = read("server/email/templates.ts");

describe("audience email backend boundary", () => {
  it("keeps server.ts as an ordering-aware composition root", () => {
    expect(server).toContain("createAudienceEmailModule");
    expect(server).not.toContain("/api/webhooks/resend");
    expect(server).not.toContain("/api/audience-email/test");
    expect(server.indexOf("audienceEmail.registerWebhook(app)")).toBeLessThan(
      server.indexOf('app.use(express.json({ limit: "100kb" }))'),
    );
    expect(server.indexOf("registerAiRoutes(app, requireUser)")).toBeLessThan(
      server.indexOf("audienceEmail.registerRoutes(app, requireUser, requirePlatformAdmin)"),
    );
  });

  it("preserves administrative and worker authorization contracts", () => {
    expect(emailModule).toContain(
      'app.post("/api/audience-email/test", requireUser, requirePlatformAdmin',
    );
    expect(emailModule).toContain(
      'app.post("/api/audience-email/dispatch/:campaignId", requireUser, requirePlatformAdmin',
    );
    expect(emailModule).toContain('req.get("x-manohub-dispatch-secret")');
    expect(emailModule).toContain("EMAIL_DISPATCH_SECRET");
  });

  it("isolates verified provider operations and deterministic delivery identifiers", () => {
    expect(provider).toContain("webhooks.verify");
    expect(provider).toContain('"Idempotency-Key": input.idempotencyKey');
    expect(emailModule).toContain("manohub-audience-${delivery.id}");
    expect(emailModule).toContain("manohub-tender-alert-${delivery.id}");
    expect(emailModule).toContain('express.raw({ type: "application/json", limit: "250kb" })');
  });

  it("keeps audience and tender templates in one escaped rendering boundary", () => {
    expect(templates).toContain("function renderAudienceEmail");
    expect(templates).toContain("function renderTenderAlertEmail");
    expect(templates).toContain("htmlEscape(input.subject)");
    expect(templates).toContain("htmlEscape(opportunity.title)");
    expect(emailModule).not.toContain("<!doctype html>");
  });
});
