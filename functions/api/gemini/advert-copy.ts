import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_FIELD_LENGTH } from '../_lib/shared';
import { getMockAdvertCopy, parseJsonObjectLoose } from '../_lib/mocks';

interface EventContext {
  request: Request;
  env: Env;
}

// Mirrors server.ts's /api/gemini/advert-copy exactly. Returns tightened
// advert copy as { headline, body } for the creative generator.
export const onRequestPost = async ({ request, env }: EventContext): Promise<Response> => {
  const userId = await requireUserId(request, env);
  if (!userId) return errorResponse('Authentication required.', 401);

  if (!(await checkRateLimit(env, userId))) {
    return errorResponse('Too many AI requests. Please wait a moment and try again.', 429);
  }

  const body = (await request.json().catch(() => null)) as {
    businessName?: string;
    category?: string;
    subject?: string;
    description?: string;
    toneOfVoice?: string;
  } | null;
  if (!body) return errorResponse('Invalid request body.', 400);

  const { businessName, category, subject, description, toneOfVoice } = body;
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    return errorResponse('subject is required', 400);
  }
  for (const [key, value] of Object.entries({ businessName, category, description, toneOfVoice })) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH)) {
      return errorResponse(`${key} must be a string under ${MAX_FIELD_LENGTH} characters.`, 400);
    }
  }

  try {
    const tone = toneOfVoice || 'Confident, warm, plain-spoken';
    const systemInstruction = `You are an advertising copywriter for a Sierra Leone / Liberia marketplace. Write short, punchy, honest ad copy in this tone: "${tone}". No emojis, no hype words like "revolutionary".`;
    const prompt = `Tighten this into advert copy for "${businessName || 'a local business'}"${category ? ` (category: ${category})` : ''}.
Subject: ${subject}
Details: ${description || 'not specified'}

Respond with ONLY a valid JSON object (no markdown, no code fences) shaped exactly like:
{"headline": "punchy headline, max ~7 words", "body": "1-2 sentence advert body, max ~30 words"}`;

    const responseText = await callGemini(env, systemInstruction, prompt, 0.7, 'application/json');
    const parsed = parseJsonObjectLoose(responseText);
    return jsonResponse(parsed && parsed.headline ? { headline: String(parsed.headline), body: String(parsed.body || '') } : getMockAdvertCopy(subject, description));
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      return jsonResponse(getMockAdvertCopy(subject, description));
    }
    console.error('Gemini Advert Copy Error:', err);
    return errorResponse('An error occurred calling the AI assist service. Please try again shortly.', 500);
  }
};
