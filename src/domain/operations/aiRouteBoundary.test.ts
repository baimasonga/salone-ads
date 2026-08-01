import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const serverSource = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const aiRoutesSource = fs.readFileSync(path.join(root, "server/ai/routes.ts"), "utf8");

const aiEndpoints = [
  "/api/gemini/generate",
  "/api/gemini/procurement-assist",
  "/api/gemini/lead-followup",
  "/api/gemini/content-plan",
  "/api/gemini/advert-copy",
] as const;

describe("authenticated AI route boundary", () => {
  it("keeps the application entry point as a registration-only composition root", () => {
    expect(serverSource).toContain("registerAiRoutes(app, requireUser)");
    for (const endpoint of aiEndpoints) expect(serverSource).not.toContain(endpoint);
  });

  it("registers every AI endpoint behind authentication and the shared rate limiter", () => {
    for (const endpoint of aiEndpoints) {
      const escapedEndpoint = endpoint.replaceAll("/", "\\/");
      expect(aiRoutesSource).toMatch(
        new RegExp(`app\\.post\\(\"${escapedEndpoint}\", requireUser, aiRateLimiter, async`),
      );
    }
  });

  it("keeps one shared limiter with the established request budget and response contract", () => {
    expect(aiRoutesSource.match(/const aiRateLimiter = rateLimit/g)).toHaveLength(1);
    expect(aiRoutesSource).toContain("windowMs: 60 * 1000");
    expect(aiRoutesSource).toContain("limit: 10");
    expect(aiRoutesSource).toContain("Too many AI requests. Please wait a moment and try again.");
  });

  it("centralizes provider configuration while retaining local fallbacks", () => {
    expect(aiRoutesSource.match(/new GoogleGenAI/g)).toHaveLength(1);
    expect(aiRoutesSource.match(/hasGeminiProvider\(\)/g)).toHaveLength(6);
    expect(aiRoutesSource).toContain("async function createGeminiClient()");
    expect(aiRoutesSource).toContain("LOCAL BACKUP AI");
  });
});
