import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_PROMPT_LENGTH } from '../_lib/shared';
import { getMockProcurementAIResponse } from '../_lib/mocks';

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
    mode?: string;
    text?: string;
    sectorNames?: string[];
  } | null;
  if (!body) return errorResponse('Invalid request body.', 400);

  const { mode, text, sectorNames } = body;

  if (typeof mode !== 'string' || !['suggest_sector', 'explain_tender'].includes(mode)) {
    return errorResponse("mode must be 'suggest_sector' or 'explain_tender'.", 400);
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return errorResponse('text is required', 400);
  }
  if (text.length > MAX_PROMPT_LENGTH) {
    return errorResponse(`text must be under ${MAX_PROMPT_LENGTH} characters.`, 400);
  }
  if (mode === 'suggest_sector' && (!Array.isArray(sectorNames) || sectorNames.length === 0)) {
    return errorResponse('sectorNames is required for suggest_sector', 400);
  }

  try {
    let systemInstruction: string;
    let targetedPrompt: string;
    let temperature: number;

    if (mode === 'suggest_sector') {
      systemInstruction =
        'You are a procurement classification assistant. Given a tender title and description, respond with ONLY the single best-matching sector name from the provided list, and nothing else.';
      targetedPrompt = `Sectors: ${(sectorNames as string[]).join(', ')}\n\nTender: "${text}"\n\nWhich single sector from the list best matches? Reply with only the sector name, exactly as given.`;
      temperature = 0.1;
    } else {
      systemInstruction =
        'You are a plain-language assistant explaining government and NGO procurement tenders to small business owners in Sierra Leone who may not be familiar with procurement jargon. Be concise, concrete, and avoid legal/technical terms where possible. Never claim that following your explanation guarantees winning the tender.';
      targetedPrompt = `Explain this tender in simple, plain language (3-5 short sentences, no jargon):\n\n"${text}"`;
      temperature = 0.5;
    }

    const responseText = await callGemini(env, systemInstruction, targetedPrompt, temperature);
    return jsonResponse({ text: responseText });
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      return jsonResponse({ text: getMockProcurementAIResponse(mode, text, sectorNames) });
    }
    console.error('Gemini Procurement Assist Error:', err);
    return errorResponse('An error occurred calling the AI assist service. Please try again shortly.', 500);
  }
};
