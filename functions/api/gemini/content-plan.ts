import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_FIELD_LENGTH } from '../_lib/shared';
import { getMockContentPlan, parseJsonArrayLoose } from '../_lib/mocks';

interface EventContext {
  request: Request;
  env: Env;
}

// Mirrors server.ts's /api/gemini/content-plan exactly. Suggest-only: returns
// suggestions for the client to preview -- nothing is written to
// content_items here, the admin picks which ones to actually create.
export const onRequestPost = async ({ request, env }: EventContext): Promise<Response> => {
  const userId = await requireUserId(request, env);
  if (!userId) return errorResponse('Authentication required.', 401);

  if (!(await checkRateLimit(env, userId))) {
    return errorResponse('Too many AI requests. Please wait a moment and try again.', 429);
  }

  const body = (await request.json().catch(() => null)) as {
    campaignName?: string;
    campaignObjective?: string;
    campaignDescription?: string;
    startDate?: string;
    endDate?: string;
    toneOfVoice?: string;
    brandName?: string;
    tagline?: string;
    mission?: string;
  } | null;
  if (!body) return errorResponse('Invalid request body.', 400);

  const { campaignName, campaignObjective, campaignDescription, startDate, endDate, toneOfVoice, brandName, tagline, mission } = body;

  if (typeof campaignName !== 'string' || campaignName.trim().length === 0) {
    return errorResponse('campaignName is required', 400);
  }
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    return errorResponse('startDate and endDate are required', 400);
  }
  for (const [key, value] of Object.entries({ campaignObjective, campaignDescription, toneOfVoice, brandName, tagline, mission })) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH)) {
      return errorResponse(`${key} must be a string under ${MAX_FIELD_LENGTH} characters.`, 400);
    }
  }

  try {
    const name = brandName || 'our team';
    const tone = toneOfVoice || 'Warm, Honest, Proudly Leonean';

    const systemInstruction = `You are a social media content planner for "${name}", a business in Sierra Leone. Write in this tone of voice: "${tone}".`;
    const targetedPrompt = `Propose a content plan for this campaign, spreading posts evenly across the date range:
Campaign: "${campaignName}"
Objective: ${campaignObjective || 'not specified'}
Description: ${campaignDescription || 'not specified'}
Date range: ${startDate} to ${endDate}

Respond with ONLY a valid JSON array (no markdown, no commentary, no code fences) of 3 to 6 objects, each shaped exactly like:
{"title": "internal draft title", "contentType": "Social Post" | "WhatsApp Promo" | "Video Script" | "Radio Brief" | "Email News", "platform": "e.g. Facebook, WhatsApp, Instagram", "headline": "short hook", "body": "the full caption/script text", "hashtags": ["#Tag1", "#Tag2"], "scheduledDate": "YYYY-MM-DD within the given range"}`;

    const responseText = await callGemini(env, systemInstruction, targetedPrompt, 0.7, 'application/json');
    const items = parseJsonArrayLoose(responseText);
    return jsonResponse({ items: items || [] });
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      return jsonResponse({ items: getMockContentPlan(campaignName, startDate, endDate, brandName) });
    }
    console.error('Gemini Content Plan Error:', err);
    return errorResponse('An error occurred calling the AI assist service. Please try again shortly.', 500);
  }
};
