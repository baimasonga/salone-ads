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

    try {
      // Lazy check and fallback to local interactive completion model if no custom key exists
      const hasKey = process.env.GEMINI_API_KEY &&
                     process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" &&
                     process.env.GEMINI_API_KEY.trim() !== "";

      if (!hasKey) {
        const mockResponse = getMockAIResponse(prompt, option, toneOfVoice, brandName);
        res.json({ text: mockResponse });
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
      if (option === 'captions' || option === 'copy') {
        targetedPrompt = `Generate 3 high-converting social media post captions/copy variants based on this topic or objective: "${prompt}".
For each variant, provide:
1. A short catchy Headline/Hook
2. The Body Caption (include appropriate local emojis and call-to-actions, e.g., WhatsApp ordering info or local delivery highlights)
3. 4-5 relevant hashtags (e.g. #SaloneReach, #EatSalone, plus custom ones).
Format with clear separators so it is easy to read.`;
      } else if (option === 'ideas') {
        targetedPrompt = `Generate 4 highly creative and actionable social media content ideas or campaign themes based on this brand goal or topic: "${prompt}".
For each idea, provide:
1. Title of the idea
2. Brief Concept details (why it works for this audience)
3. Recommended Platform/Channel (e.g., Facebook, WhatsApp, TikTok, Instagram)
4. Concrete Execution Step (how to launch it).
Format with clear separators.`;
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
        }
      });

      res.json({ text: response.text });
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
"Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours. #EatSalone #SaloneReach"`;
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

startServer().catch(err => {
  console.error("[FATAL] Server startup failure:", err);
  process.exit(1);
});
