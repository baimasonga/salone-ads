import { Env, requireUserId, checkRateLimit, jsonResponse, errorResponse, callGemini, MAX_PROMPT_LENGTH, MAX_FIELD_LENGTH } from '../_lib/shared';
import { getMockAIResponse } from '../_lib/mocks';

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

    const text = await callGemini(env, systemInstruction, targetedPrompt, 0.75);
    return jsonResponse({ text });
  } catch (err: any) {
    if (err?.message === 'NO_KEY') {
      return jsonResponse({ text: getMockAIResponse(prompt, option || '', toneOfVoice, brandName) });
    }
    console.error('Gemini Server Error:', err);
    return errorResponse('An error occurred calling the Gemini AI service. Please try again shortly.', 500);
  }
};
