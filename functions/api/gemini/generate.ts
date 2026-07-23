import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_PROMPT_LENGTH, MAX_FIELD_LENGTH } from '../_lib/shared';
import { getMockAIResponse, getMockAIVariants, parseJsonArrayLoose } from '../_lib/mocks';

interface EventContext {
  request: Request;
  env: Env;
}

export const onRequestPost = async ({ request, env }: EventContext): Promise<Response> => {
  const userId = await requireUserId(request, env);
  if (!userId) return errorResponse('Authentication required.', 401);

  if (!(await checkRateLimit(env, userId))) {
    return errorResponse('Too many AI requests. Please wait a moment and try again.', 429);
  }

  const body = (await request.json().catch(() => null)) as {
    prompt?: string;
    option?: string;
    toneOfVoice?: string;
    brandName?: string;
    tagline?: string;
    mission?: string;
  } | null;
  if (!body) return errorResponse('Invalid request body.', 400);

  const { prompt, option, toneOfVoice, brandName, tagline, mission } = body;

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return errorResponse('Prompt is required', 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return errorResponse(`Prompt must be under ${MAX_PROMPT_LENGTH} characters.`, 400);
  }
  for (const [key, value] of Object.entries({ toneOfVoice, brandName, tagline, mission })) {
    if (value !== undefined && (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH)) {
      return errorResponse(`${key} must be a string under ${MAX_FIELD_LENGTH} characters.`, 400);
    }
  }

  // 'captions'/'copy' and 'ideas' each generate multiple discrete variants
  // that become individual Content Studio drafts -- ask Gemini for structured
  // JSON so the client can render one card per variant. Mirrors server.ts's
  // /api/gemini/generate exactly.
  const structuredFormat: 'captions' | 'ideas' | null =
    option === 'captions' || option === 'copy' ? 'captions' : option === 'ideas' ? 'ideas' : null;

  try {
    let systemInstruction =
      'You are an expert advertising copywriter and content strategist specializing in Sierra Leone and West African markets, as well as the global diaspora.';
    if (brandName) systemInstruction += ` You are generating content for the brand: "${brandName}".`;
    if (tagline) systemInstruction += ` Brand tagline: "${tagline}".`;
    if (mission) systemInstruction += ` Brand mission/goal: "${mission}".`;
    if (toneOfVoice) {
      systemInstruction += ` You MUST write strictly in this tone of voice: "${toneOfVoice}". Make sure the generated copy sounds natural, authentic, and adheres perfectly to these tone parameters.`;
    } else {
      systemInstruction += ' Write in a Warm, Honest, Proudly Leonean tone of voice.';
    }

    let targetedPrompt = prompt;
    if (structuredFormat === 'captions') {
      targetedPrompt = `Generate exactly 3 high-converting social media post caption variants based on this topic or objective: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 3 objects, each shaped exactly like:
{"headline": "a short catchy headline/hook", "body": "the full caption text, including appropriate local emojis and a call-to-action such as WhatsApp ordering info or local delivery highlights", "hashtags": ["#Tag1", "#Tag2", "#Tag3"]}`;
    } else if (structuredFormat === 'ideas') {
      targetedPrompt = `Generate exactly 4 highly creative and actionable social media content ideas based on this brand goal or topic: "${prompt}".
Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of exactly 4 objects, each shaped exactly like:
{"title": "idea title", "concept": "brief concept detail, why it works for this audience", "platform": "recommended platform, e.g. Facebook, WhatsApp, TikTok, Instagram", "executionStep": "one concrete step to launch it"}`;
    } else if (option === 'script') {
      targetedPrompt = `Generate a professional radio or television advertisement script based on this product/goal: "${prompt}". Include character directions, sound effect cues [SFX], and a strong Leonean call to action.`;
    } else if (option === 'brief') {
      targetedPrompt = `Generate a comprehensive campaign brief based on: "${prompt}". Include key objectives, target audience description (local vs diaspora), recommended channel breakdown, and risk mitigations.`;
    }

    const text = await callGemini(env, systemInstruction, targetedPrompt, 0.75, structuredFormat ? 'application/json' : undefined);

    if (structuredFormat) {
      const items = parseJsonArrayLoose(text);
      if (items) return jsonResponse({ format: structuredFormat, items });
      return jsonResponse({ format: 'text', text: text || 'No content returned.' });
    }
    return jsonResponse({ format: 'text', text: text || 'No content returned.' });
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      if (structuredFormat) {
        return jsonResponse({ format: structuredFormat, items: getMockAIVariants(structuredFormat, prompt, toneOfVoice, brandName) });
      }
      return jsonResponse({ format: 'text', text: getMockAIResponse(prompt, option || '', toneOfVoice, brandName) });
    }
    console.error('Gemini Server Error:', err);
    return errorResponse('An error occurred calling the Gemini AI service. Please try again shortly.', 500);
  }
};
