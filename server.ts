import express from "express";
import path from "path";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

// Typed environment configuration audit
const REQUIRED_ENV_VARS = ["APP_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const MISSING_VARS = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (MISSING_VARS.length > 0) {
  console.warn(`[WARN] Missing environment variables in system context: ${MISSING_VARS.join(", ")}`);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Used only to validate the caller's access token (auth.getUser), never to
// bypass RLS — no service-role key is used here.
const supabaseAuthClient =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !supabaseAuthClient) {
    res.status(401).json({ error: { message: "Authentication required." } });
    return;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: { message: "Invalid or expired session." } });
    return;
  }

  (req as any).userId = data.user.id;
  next();
}

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).userId || req.ip || "anonymous",
  message: { error: { message: "Too many AI requests. Please wait a moment and try again." } },
});

const MAX_PROMPT_LENGTH = 2000;
const MAX_FIELD_LENGTH = 300;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "100kb" }));

  // Tracking link redirect — resolves a short code via the SECURITY DEFINER
  // resolve_tracking_link() RPC (which also logs the click), then issues a
  // real HTTP redirect. A server route rather than a client-side SPA route
  // so it works as a real, fast, share-preview-friendly short link.
  app.get("/r/:code", async (req, res) => {
    if (!supabaseAuthClient) {
      res.status(503).send("Tracking links are not configured.");
      return;
    }
    const { data, error } = await supabaseAuthClient.rpc("resolve_tracking_link", {
      p_code: req.params.code,
      p_referrer: req.get("referer") || null,
    });
    if (error || !data) {
      res.status(404).send("This link is invalid or has expired.");
      return;
    }
    res.redirect(302, data);
  });

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0"
    });
  });

  // Server-Side Gemini Completion Handler
  app.post("/api/gemini/generate", requireUser, aiRateLimiter, async (req, res) => {
    const { prompt, option, toneOfVoice, brandName, tagline, mission } = req.body;

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      res.status(400).json({ error: { message: "Prompt is required" } });
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: { message: `Prompt must be under ${MAX_PROMPT_LENGTH} characters.` } });
      return;
    }
    for (const [key, value] of Object.entries({ toneOfVoice, brandName, tagline, mission })) {
      if (value !== undefined && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    // 'captions'/'copy' and 'ideas' generate multiple discrete variants that
    // become individual Content Studio drafts -- ask Gemini for structured
    // JSON so the client can render one card per variant instead of a single
    // blob of text the admin has to hand-parse. 'script' and 'brief' are
    // each naturally a single block of prose, so they stay plain text.
    const structuredFormat: "captions" | "ideas" | null =
      option === "captions" || option === "copy" ? "captions" : option === "ideas" ? "ideas" : null;

    try {
      // Lazy check and fallback to local interactive completion model if no custom key exists
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        if (structuredFormat) {
          res.json({ format: structuredFormat, items: getMockAIVariants(structuredFormat, prompt, toneOfVoice, brandName) });
        } else {
          res.json({ format: "text", text: getMockAIResponse(prompt, option, toneOfVoice, brandName) });
        }
        return;
      }

      // Initialize the official GoogleGenAI client (ESM lazy import)
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Craft tailored system instructions based on Brand Tone of Voice
      let systemInstruction = "You are an expert advertising copywriter and content strategist specializing in Sierra Leone and West African markets, as well as the global diaspora.";

      if (brandName) {
        systemInstruction += ` You are generating content for the brand: "${brandName}".`;
      }
      if (tagline) {
        systemInstruction += ` Brand tagline: "${tagline}".`;
      }
      if (mission) {
        systemInstruction += ` Brand mission/goal: "${mission}".`;
      }
      if (toneOfVoice) {
        systemInstruction += ` You MUST write strictly in this tone of voice: "${toneOfVoice}". Make sure the generated copy sounds natural, authentic, and adheres perfectly to these tone parameters.`;
      } else {
        systemInstruction += ` Write in a Warm, Honest, Proudly Leonean tone of voice.`;
      }

      // Tailor instructions based on selected option
      let targetedPrompt = prompt;
      if (structuredFormat === "captions") {
        targetedPrompt = `Generate exactly 3 high-converting social media post caption variants based on this topic or objective: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 3 objects, each shaped exactly like:
{"headline": "a short catchy headline/hook", "body": "the full caption text, including appropriate local emojis and a call-to-action such as WhatsApp ordering info or local delivery highlights", "hashtags": ["#Tag1", "#Tag2", "#Tag3"]}`;
      } else if (structuredFormat === "ideas") {
        targetedPrompt = `Generate exactly 4 highly creative and actionable social media content ideas based on this brand goal or topic: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 4 objects, each shaped exactly like:
{"title": "idea title", "concept": "brief concept detail, why it works for this audience", "platform": "recommended platform, e.g. Facebook, WhatsApp, TikTok, Instagram", "executionStep": "one concrete step to launch it"}`;
      } else if (option === 'script') {
        targetedPrompt = `Generate a professional radio or television advertisement script based on this product/goal: "${prompt}". Include character directions, sound effect cues [SFX], and a strong Leonean call to action.`;
      } else if (option === 'brief') {
        targetedPrompt = `Generate a comprehensive campaign brief based on: "${prompt}". Include key objectives, target audience description (local vs diaspora), recommended channel breakdown, and risk mitigations.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.75,
          ...(structuredFormat ? { responseMimeType: "application/json" } : {}),
        }
      });

      const rawText = response.text || "";

      if (structuredFormat) {
        const items = parseJsonArrayLoose(rawText);
        if (items) {
          res.json({ format: structuredFormat, items });
          return;
        }
        // Gemini didn't return parseable JSON despite the instruction -- fall
        // back to showing the raw text rather than erroring the whole request.
        res.json({ format: "text", text: rawText || "No content returned." });
        return;
      }

      res.json({ format: "text", text: rawText || "No content returned." });
    } catch (err: any) {
      console.error("Gemini Server Error:", err);
      res.status(500).json({
        error: {
          code: "GEMINI_ERROR",
          message: "An error occurred calling the Gemini AI service. Please try again shortly."
        }
      });
    }
  });

  // Procurement AI Assist Handler (separate from the ad-copywriting endpoint
  // above — different domain, different system instruction, same auth +
  // rate-limit pattern).
  app.post("/api/gemini/procurement-assist", requireUser, aiRateLimiter, async (req, res) => {
    const { mode, text, sectorNames } = req.body;

    if (typeof mode !== "string" || !["suggest_sector", "explain_tender"].includes(mode)) {
      res.status(400).json({ error: { message: "mode must be 'suggest_sector' or 'explain_tender'." } });
      return;
    }
    if (typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: { message: "text is required" } });
      return;
    }
    if (text.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: { message: `text must be under ${MAX_PROMPT_LENGTH} characters.` } });
      return;
    }
    if (mode === "suggest_sector" && (!Array.isArray(sectorNames) || sectorNames.length === 0)) {
      res.status(400).json({ error: { message: "sectorNames is required for suggest_sector" } });
      return;
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ text: getMockProcurementAIResponse(mode, text, sectorNames) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      let systemInstruction: string;
      let targetedPrompt: string;

      if (mode === "suggest_sector") {
        systemInstruction = "You are a procurement classification assistant. Given a tender title and description, respond with ONLY the single best-matching sector name from the provided list, and nothing else.";
        targetedPrompt = `Sectors: ${(sectorNames as string[]).join(", ")}\n\nTender: "${text}"\n\nWhich single sector from the list best matches? Reply with only the sector name, exactly as given.`;
      } else {
        systemInstruction = "You are a plain-language assistant explaining government and NGO procurement tenders to small business owners in Sierra Leone who may not be familiar with procurement jargon. Be concise, concrete, and avoid legal/technical terms where possible. Never claim that following your explanation guarantees winning the tender.";
        targetedPrompt = `Explain this tender in simple, plain language (3-5 short sentences, no jargon):\n\n"${text}"`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: mode === "suggest_sector" ? 0.1 : 0.5 }
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini Procurement Assist Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  // Drafts a follow-up message for a single CRM lead. Suggest-only: this
  // never sends anything itself -- the client turns the drafted text into a
  // real wa.me/mailto deep link so the actual send is a genuine admin action
  // through their own WhatsApp/email client, not an automated dispatch.
  app.post("/api/gemini/lead-followup", requireUser, aiRateLimiter, async (req, res) => {
    const { leadName, leadSource, leadDistrict, estimatedValue, channel, toneOfVoice, brandName } = req.body;

    if (typeof leadName !== "string" || leadName.trim().length === 0) {
      res.status(400).json({ error: { message: "leadName is required" } });
      return;
    }
    if (channel !== "whatsapp" && channel !== "email") {
      res.status(400).json({ error: { message: "channel must be 'whatsapp' or 'email'." } });
      return;
    }
    for (const [key, value] of Object.entries({ leadSource, leadDistrict, toneOfVoice, brandName })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }
    if (estimatedValue !== undefined && estimatedValue !== null && typeof estimatedValue !== "number") {
      res.status(400).json({ error: { message: "estimatedValue must be a number." } });
      return;
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ text: getMockLeadFollowup(leadName, leadSource, channel, brandName) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const name = (brandName as string) || "our team";
      const tone = (toneOfVoice as string) || "Warm, Honest, Proudly Leonean";
      const channelNote = channel === "whatsapp"
        ? "Write it for WhatsApp: short (under 400 characters), conversational, light emoji use is fine, end with a clear question or call to action."
        : "Write it as a short email body (no more than 5 short paragraphs), slightly more formal, no emoji, end with a clear call to action.";

      const systemInstruction = `You are a friendly sales follow-up writer for "${name}", a business in Sierra Leone. You MUST write in this tone of voice: "${tone}". Never fabricate promises, discounts, or guarantees that weren't stated.`;
      const targetedPrompt = `Draft a follow-up message to a sales lead named "${leadName}"${leadSource ? `, who came in through "${leadSource}"` : ""}${leadDistrict ? `, based in ${leadDistrict}` : ""}${estimatedValue ? `, with an estimated deal value of Le ${Number(estimatedValue).toLocaleString()}` : ""}. The goal is to re-engage them and move the conversation forward. ${channelNote}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: 0.6 }
      });

      res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Gemini Lead Follow-up Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  // Proposes a spread of content drafts for a campaign's date range. Returns
  // suggestions only -- nothing is written to content_items here; the client
  // shows them as a preview and the admin picks which ones to actually create
  // (via the existing createContentItem path), same suggest-only contract as
  // the rest of the Content Studio AI panel.
  app.post("/api/gemini/content-plan", requireUser, aiRateLimiter, async (req, res) => {
    const { campaignName, campaignObjective, campaignDescription, startDate, endDate, toneOfVoice, brandName, tagline, mission } = req.body;

    if (typeof campaignName !== "string" || campaignName.trim().length === 0) {
      res.status(400).json({ error: { message: "campaignName is required" } });
      return;
    }
    if (typeof startDate !== "string" || typeof endDate !== "string") {
      res.status(400).json({ error: { message: "startDate and endDate are required" } });
      return;
    }
    for (const [key, value] of Object.entries({ campaignObjective, campaignDescription, toneOfVoice, brandName, tagline, mission })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        res.json({ items: getMockContentPlan(campaignName, startDate, endDate, brandName) });
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const name = (brandName as string) || "our team";
      const tone = (toneOfVoice as string) || "Warm, Honest, Proudly Leonean";

      const systemInstruction = `You are a social media content planner for "${name}", a business in Sierra Leone. Write in this tone of voice: "${tone}".`;
      const targetedPrompt = `Propose a content plan for this campaign, spreading posts evenly across the date range:
Campaign: "${campaignName}"
Objective: ${campaignObjective || "not specified"}
Description: ${campaignDescription || "not specified"}
Date range: ${startDate} to ${endDate}

Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of 3 to 6 objects, each shaped exactly like:
{"title": "internal draft title", "contentType": "Social Post" | "WhatsApp Promo" | "Video Script" | "Radio Brief" | "Email News", "platform": "e.g. Facebook, WhatsApp, Instagram", "headline": "short hook", "body": "the full caption/script text", "hashtags": ["#Tag1", "#Tag2"], "scheduledDate": "YYYY-MM-DD within the given range"}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: targetedPrompt,
        config: { systemInstruction, temperature: 0.7, responseMimeType: "application/json" }
      });

      const items = parseJsonArrayLoose(response.text || "");
      res.json({ items: items || [] });
    } catch (err: any) {
      console.error("Gemini Content Plan Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  app.post("/api/gemini/advert-copy", requireUser, aiRateLimiter, async (req, res) => {
    const { businessName, category, subject, description, toneOfVoice } = req.body;
    if (typeof subject !== "string" || subject.trim().length === 0) {
      res.status(400).json({ error: { message: "subject is required" } });
      return;
    }
    for (const [key, value] of Object.entries({ businessName, category, description, toneOfVoice })) {
      if (value !== undefined && value !== null && (typeof value !== "string" || value.length > MAX_FIELD_LENGTH)) {
        res.status(400).json({ error: { message: `${key} must be a string under ${MAX_FIELD_LENGTH} characters.` } });
        return;
      }
    }

    try {
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";
      if (!hasKey) {
        res.json(getMockAdvertCopy(subject, description));
        return;
      }

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const tone = (toneOfVoice as string) || "Confident, warm, plain-spoken";
      const systemInstruction = `You are an advertising copywriter for a Sierra Leone / Liberia marketplace. Write short, punchy, honest ad copy in this tone: "${tone}". No emojis, no hype words like "revolutionary".`;
      const prompt = `Tighten this into advert copy for "${businessName || "a local business"}"${category ? ` (category: ${category})` : ""}.
Subject: ${subject}
Details: ${description || "not specified"}

Respond with ONLY a valid JSON object (no markdown, no code fences) shaped exactly like:
{"headline": "punchy headline, max ~7 words", "body": "1-2 sentence advert body, max ~30 words"}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { systemInstruction, temperature: 0.7, responseMimeType: "application/json" }
      });

      const parsed = parseJsonObjectLoose(response.text || "");
      res.json(parsed && parsed.headline ? { headline: String(parsed.headline), body: String(parsed.body || "") } : getMockAdvertCopy(subject, description));
    } catch (err: any) {
      console.error("Gemini Advert Copy Error:", err);
      res.status(500).json({
        error: { code: "GEMINI_ERROR", message: "An error occurred calling the AI assist service. Please try again shortly." }
      });
    }
  });

  // Vite Middleware Setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OK] Server listening on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

// Gemini is instructed to return raw JSON, but models occasionally wrap it in
// a markdown code fence despite that instruction -- strip one if present
// before parsing, and return null (never throw) so the caller can fall back
// to plain text instead of failing the whole request.
function parseJsonArrayLoose(raw: string): any[] | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonObjectLoose(raw: string): Record<string, any> | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Local fallback advert copy when no Gemini key is configured -- a light
// cleanup of the subject/description into headline + body.
function getMockAdvertCopy(subject: string, description?: string): { headline: string; body: string } {
  const headline = subject.trim().replace(/\.$/, "").slice(0, 60) || "Now available";
  const body = (description || subject).trim().replace(/\s+/g, " ").slice(0, 140);
  return { headline, body };
}

// Structured local fallback for 'captions'/'ideas' when no Gemini key is
// configured -- mirrors getMockAIResponse's flavor text below, but shaped as
// discrete items instead of one text blob, matching what the real Gemini
// call returns for these two modes.
function getMockAIVariants(
  format: "captions" | "ideas",
  prompt: string,
  toneOfVoice?: string,
  brandName?: string
): any[] {
  const tone = toneOfVoice || "Warm, Honest, Proudly Leonean";
  const name = brandName || "Sierra Organic";

  if (format === "ideas") {
    return [
      {
        title: "Our Farmers, Our Heroes Video Series",
        concept: `Short video profiles highlighting smallholder farmers sourcing for ${name}, in a "${tone}" tone.`,
        platform: "Facebook & TikTok",
        executionStep: "Post a 30-second clip of a farmer sharing their harvest story with a warm, personal caption.",
      },
      {
        title: "Taste of Home Diaspora Giveaway",
        concept: "Encourage diaspora followers to share their favorite home memory for a chance to gift goods to their family.",
        platform: "WhatsApp & Facebook",
        executionStep: "Create an eye-catching graphic asking for stories in the comments.",
      },
      {
        title: "Behind-the-Scenes Packing Day",
        concept: "Real-time, transparent showcase of quality control and safe shipping of goods.",
        platform: "Facebook Stories",
        executionStep: "Take vertical snapshot photos showing neat packaging and happy drivers.",
      },
      {
        title: "Weekly Interactive Polls",
        concept: `Ask customers what local recipes they want tips on, tied to this goal: "${prompt}".`,
        platform: "WhatsApp Business Status",
        executionStep: "Post a status update poll using standard Leonean culinary favorites.",
      },
    ];
  }

  return [
    {
      headline: "Pure, Fresh, Proudly Local",
      body: `Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚`,
      hashtags: ["#Manohub", "#EatSalone", "#ProudlyLeonean"],
    },
    {
      headline: "Home, Delivered",
      body: `Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱`,
      hashtags: ["#Manohub", "#DiasporaLove"],
    },
    {
      headline: "Taste You Trust",
      body: `Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours.`,
      hashtags: ["#EatSalone", "#Manohub"],
    },
  ];
}

// Multi-template local simulated responses for low-bandwidth / offline or local key fallback
function getMockAIResponse(prompt: string, option: string, toneOfVoice?: string, brandName?: string): string {
  const tone = toneOfVoice || "Warm, Honest, Proudly Leonean";
  const name = brandName || "Sierra Organic";

  if (option === "brief") {
    return `[LOCAL BACKUP AI BRIEF GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

### Campaign Setup ("${prompt}")
- Structured for organic Facebook and direct WhatsApp outreach.
- High impact visual layout optimized for standard smartphones.
- Campaign tagline: "Harvested with pride, shared with love."
- Focuses on the core mission of "${name}" in a "${tone}" tone of voice.

**Audience Profile:**
- Sierra Leonean diaspora sponsoring local goods for parents back home.

**Recommended Channels:**
- WhatsApp Business, Facebook Videos, and local radio broadcasts.`;
  } else if (option === "copy" || option === "captions") {
    return `[LOCAL BACKUP AI SOCIAL CAPTION GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

Variant 1 (Proud & Local):
"Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚"

Variant 2 (Diaspora Connection):
"Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱"

Variant 3 (Modern / Everyday):
"Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours. #EatSalone #Manohub"`;
  } else if (option === "ideas") {
    return `[LOCAL BACKUP AI CONTENT IDEAS GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

Idea 1: "Our Farmers, Our Heroes" Video Series
- Platform: Facebook & TikTok
- Concept: Short video profiles highlighting smallholder farmers in Bo or Kenema sourcing for ${name}.
- Action: Post a 30-second clip of a farmer sharing their harvest story with a warm, personal caption.

Idea 2: "Taste of Home" Diaspora Giveaway
- Platform: WhatsApp & Facebook
- Concept: Encourage diaspora followers to share their favorite home memory for a chance to gift a bag of goods to their family.
- Action: Create an eye-catching graphic with a "${tone}" caption asking for stories in the comments.

Idea 3: Behind-the-Scenes Packing Day
- Platform: Facebook Stories
- Concept: Real-time, transparent showcase of quality control and safe shipping of goods.
- Action: Take vertical snapshot photos showing neat packaging and happy drivers.

Idea 4: Weekly Interactive Polls
- Platform: WhatsApp Business Status
- Concept: Ask customers what local recipes they want tips on.
- Action: Post a status update poll using standard Leonean culinary favorites.`;
  } else if (option === "script") {
    return `[LOCAL BACKUP AI RADIO SCRIPT GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

[SOUND EFFECT: Acoustic drums, lively but warm Leonean beat plays softly in the background]

NARRATOR (Expressive, warm Sierra Leonean accent matching a "${tone}" vibe):
"Wetin sweeter pass we own local flavor? Nothing! ${name} brings you our very own organic native foods, harvested with pride."

[SOUND EFFECT: Sound of packaging, laughter of family in a cozy kitchen]

NARRATOR:
"Support our local farmers, feed your family with real nutrition. Easy to order from UK, USA, or right here in Sierra Leone. Connecting our growth, together."

CTA (Call To Action):
"WhatsApp us at +232 76 000 000. ${name}: Connecting our growth."`;
  }
  return `### ${name} Brand Campaign Setup ("${prompt}")
- Styled with a "${tone}" tone of voice.
- Campaign tagline: "Harvested with pride, shared with love."`;
}

// Local fallback for procurement AI assist when no Gemini key is configured.
function getMockProcurementAIResponse(mode: string, text: string, sectorNames?: string[]): string {
  if (mode === "suggest_sector") {
    const lower = text.toLowerCase();
    const match = (sectorNames || []).find((s) => lower.includes(s.toLowerCase()));
    return match || (sectorNames && sectorNames[0]) || "General";
  }
  return `[LOCAL BACKUP SUMMARY] This tender is asking qualified businesses to submit a bid. Read the deadline, eligibility, and submission instructions carefully, and reach out to the buyer's contact if anything is unclear before you apply. (AI summary unavailable — configure GEMINI_API_KEY for full explanations.)`;
}

// Local fallback for lead follow-up drafting when no Gemini key is configured.
function getMockLeadFollowup(leadName: string, leadSource: string | undefined, channel: string, brandName?: string): string {
  const name = brandName || "our team";
  if (channel === "whatsapp") {
    return `Hi ${leadName}! 👋 This is ${name} following up on your enquiry${leadSource ? ` via ${leadSource}` : ""}. Are you still interested in moving forward? Happy to answer any questions here on WhatsApp.`;
  }
  return `Hi ${leadName},\n\nI wanted to follow up on your recent enquiry with ${name}${leadSource ? ` via ${leadSource}` : ""}. Please let me know if you have any questions or would like to move forward — happy to help.\n\nBest regards,\n${name}`;
}

// Local fallback for content-plan suggestions when no Gemini key is configured.
function getMockContentPlan(campaignName: string, startDate: string, endDate: string, brandName?: string): any[] {
  const name = brandName || "Sierra Organic";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const spanMs = Math.max(0, end.getTime() - start.getTime());
  const dateAt = (fraction: number) => new Date(start.getTime() + spanMs * fraction).toISOString().split("T")[0];

  return [
    {
      title: `${campaignName} — Announcement`,
      contentType: "Social Post",
      platform: "Facebook",
      headline: `Introducing: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} is excited to launch "${campaignName}"! Stay tuned for more details. 🌾`,
      hashtags: ["#Manohub", "#EatSalone"],
      scheduledDate: dateAt(0),
    },
    {
      title: `${campaignName} — Mid-campaign reminder`,
      contentType: "WhatsApp Promo",
      platform: "WhatsApp",
      headline: `Don't miss out — ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] Reminder from ${name}: "${campaignName}" is still going strong. Message us to find out more.`,
      hashtags: ["#Manohub"],
      scheduledDate: dateAt(0.5),
    },
    {
      title: `${campaignName} — Closing push`,
      contentType: "Social Post",
      platform: "Facebook & Instagram",
      headline: `Last chance: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} wraps up "${campaignName}" soon — don't miss your chance to get involved.`,
      hashtags: ["#Manohub", "#EatSalone"],
      scheduledDate: dateAt(0.9),
    },
  ];
}

startServer().catch(err => {
  console.error("[FATAL] Server startup failure:", err);
  process.exit(1);
});
