import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_FIELD_LENGTH } from '../_lib/shared';
import { getMockLeadFollowup } from '../_lib/mocks';

interface EventContext {
  request: Request;
  env: Env;
}

// Mirrors server.ts's /api/gemini/lead-followup exactly. Suggest-only: this
// never sends anything -- the client turns the drafted text into a real
// wa.me/mailto deep link so sending stays a genuine admin action.
export const onRequestPost = async ({ request, env }: EventContext): Promise<Response> => {
  const userId = await requireUserId(request, env);
  if (!userId) return errorResponse('Authentication required.', 401);

  if (!(await checkRateLimit(env, userId))) {
    return errorResponse('Too many AI requests. Please wait a moment and try again.', 429);
  }

  const body = (await request.json().catch(() => null)) as {
    leadName?: string;
    leadSource?: string;
    leadDistrict?: string;
    estimatedValue?: number;
    channel?: string;
    toneOfVoice?: string;
    brandName?: string;
  } | null;
  if (!body) return errorResponse('Invalid request body.', 400);

  const { leadName, leadSource, leadDistrict, estimatedValue, channel, toneOfVoice, brandName } = body;

  if (typeof leadName !== 'string' || leadName.trim().length === 0) {
    return errorResponse('leadName is required', 400);
  }
  if (channel !== 'whatsapp' && channel !== 'email') {
    return errorResponse("channel must be 'whatsapp' or 'email'.", 400);
  }
  for (const [key, value] of Object.entries({ leadSource, leadDistrict, toneOfVoice, brandName })) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH)) {
      return errorResponse(`${key} must be a string under ${MAX_FIELD_LENGTH} characters.`, 400);
    }
  }
  if (estimatedValue !== undefined && estimatedValue !== null && typeof estimatedValue !== 'number') {
    return errorResponse('estimatedValue must be a number.', 400);
  }

  try {
    const name = brandName || 'our team';
    const tone = toneOfVoice || 'Warm, Honest, Proudly Leonean';
    const channelNote =
      channel === 'whatsapp'
        ? 'Write it for WhatsApp: short (under 400 characters), conversational, light emoji use is fine, end with a clear question or call to action.'
        : 'Write it as a short email body (no more than 5 short paragraphs), slightly more formal, no emoji, end with a clear call to action.';

    const systemInstruction = `You are a friendly sales follow-up writer for "${name}", a business in Sierra Leone. You MUST write in this tone of voice: "${tone}". Never fabricate promises, discounts, or guarantees that weren't stated.`;
    const targetedPrompt = `Draft a follow-up message to a sales lead named "${leadName}"${leadSource ? `, who came in through "${leadSource}"` : ''}${leadDistrict ? `, based in ${leadDistrict}` : ''}${estimatedValue ? `, with an estimated deal value of Le ${Number(estimatedValue).toLocaleString()}` : ''}. The goal is to re-engage them and move the conversation forward. ${channelNote}`;

    const responseText = await callGemini(env, systemInstruction, targetedPrompt, 0.6);
    return jsonResponse({ text: responseText });
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      return jsonResponse({ text: getMockLeadFollowup(leadName, leadSource, channel, brandName) });
    }
    console.error('Gemini Lead Follow-up Error:', err);
    return errorResponse('An error occurred calling the AI assist service. Please try again shortly.', 500);
  }
};
