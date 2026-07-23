// Local fallback responses when no GEMINI_API_KEY is configured — mirrors
// server.ts's getMockAIResponse / getMockProcurementAIResponse exactly, so
// behavior is identical whether the app runs on the Express server or here.

// Mirrors server.ts's parseJsonArrayLoose exactly.
export function parseJsonArrayLoose(raw: string): any[] | null {
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

// Mirrors server.ts's getMockAIVariants exactly.
export function getMockAIVariants(
  format: 'captions' | 'ideas',
  prompt: string,
  toneOfVoice?: string,
  brandName?: string
): any[] {
  const tone = toneOfVoice || 'Warm, Honest, Proudly Leonean';
  const name = brandName || 'Sierra Organic';

  if (format === 'ideas') {
    return [
      {
        title: 'Our Farmers, Our Heroes Video Series',
        concept: `Short video profiles highlighting smallholder farmers sourcing for ${name}, in a "${tone}" tone.`,
        platform: 'Facebook & TikTok',
        executionStep: 'Post a 30-second clip of a farmer sharing their harvest story with a warm, personal caption.',
      },
      {
        title: 'Taste of Home Diaspora Giveaway',
        concept: 'Encourage diaspora followers to share their favorite home memory for a chance to gift goods to their family.',
        platform: 'WhatsApp & Facebook',
        executionStep: 'Create an eye-catching graphic asking for stories in the comments.',
      },
      {
        title: 'Behind-the-Scenes Packing Day',
        concept: 'Real-time, transparent showcase of quality control and safe shipping of goods.',
        platform: 'Facebook Stories',
        executionStep: 'Take vertical snapshot photos showing neat packaging and happy drivers.',
      },
      {
        title: 'Weekly Interactive Polls',
        concept: `Ask customers what local recipes they want tips on, tied to this goal: "${prompt}".`,
        platform: 'WhatsApp Business Status',
        executionStep: 'Post a status update poll using standard Leonean culinary favorites.',
      },
    ];
  }

  return [
    {
      headline: 'Pure, Fresh, Proudly Local',
      body: `Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚`,
      hashtags: ['#Manohub', '#EatSalone', '#ProudlyLeonean'],
    },
    {
      headline: 'Home, Delivered',
      body: `Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱`,
      hashtags: ['#Manohub', '#DiasporaLove'],
    },
    {
      headline: 'Taste You Trust',
      body: `Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours.`,
      hashtags: ['#EatSalone', '#Manohub'],
    },
  ];
}

export function getMockAIResponse(prompt: string, option: string, toneOfVoice?: string, brandName?: string): string {
  const tone = toneOfVoice || 'Warm, Honest, Proudly Leonean';
  const name = brandName || 'Sierra Organic';

  if (option === 'brief') {
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
  } else if (option === 'copy' || option === 'captions') {
    return `[LOCAL BACKUP AI SOCIAL CAPTION GENERATION]
Brand Context: ${name}
Target Tone: ${tone}

Variant 1 (Proud & Local):
"Pure, fresh, and harvested directly from our rich soils by ${name}. Bring genuine home flavor back to your dinner table! Order local, support local farmers, and feel Salone pride. 🌾💚"

Variant 2 (Diaspora Connection):
"Send premium local products from ${name} directly to your family in Freetown with zero hassle. Safe, local, and empowering. Sponsored with love. 🇸🇱"

Variant 3 (Modern / Everyday):
"Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours. #EatSalone #Manohub"`;
  } else if (option === 'ideas') {
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
  } else if (option === 'script') {
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

export function getMockProcurementAIResponse(mode: string, text: string, sectorNames?: string[]): string {
  if (mode === 'suggest_sector') {
    const lower = text.toLowerCase();
    const match = (sectorNames || []).find((s) => lower.includes(s.toLowerCase()));
    return match || (sectorNames && sectorNames[0]) || 'General';
  }
  return `[LOCAL BACKUP SUMMARY] This tender is asking qualified businesses to submit a bid. Read the deadline, eligibility, and submission instructions carefully, and reach out to the buyer's contact if anything is unclear before you apply. (AI summary unavailable — configure GEMINI_API_KEY for full explanations.)`;
}

// Mirrors server.ts's getMockLeadFollowup exactly.
export function getMockLeadFollowup(leadName: string, leadSource: string | undefined, channel: string, brandName?: string): string {
  const name = brandName || 'our team';
  if (channel === 'whatsapp') {
    return `Hi ${leadName}! 👋 This is ${name} following up on your enquiry${leadSource ? ` via ${leadSource}` : ''}. Are you still interested in moving forward? Happy to answer any questions here on WhatsApp.`;
  }
  return `Hi ${leadName},\n\nI wanted to follow up on your recent enquiry with ${name}${leadSource ? ` via ${leadSource}` : ''}. Please let me know if you have any questions or would like to move forward — happy to help.\n\nBest regards,\n${name}`;
}

// Mirrors server.ts's getMockContentPlan exactly.
export function getMockContentPlan(campaignName: string, startDate: string, endDate: string, brandName?: string): any[] {
  const name = brandName || 'Sierra Organic';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const spanMs = Math.max(0, end.getTime() - start.getTime());
  const dateAt = (fraction: number) => new Date(start.getTime() + spanMs * fraction).toISOString().split('T')[0];

  return [
    {
      title: `${campaignName} — Announcement`,
      contentType: 'Social Post',
      platform: 'Facebook',
      headline: `Introducing: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} is excited to launch "${campaignName}"! Stay tuned for more details. 🌾`,
      hashtags: ['#Manohub', '#EatSalone'],
      scheduledDate: dateAt(0),
    },
    {
      title: `${campaignName} — Mid-campaign reminder`,
      contentType: 'WhatsApp Promo',
      platform: 'WhatsApp',
      headline: `Don't miss out — ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] Reminder from ${name}: "${campaignName}" is still going strong. Message us to find out more.`,
      hashtags: ['#Manohub'],
      scheduledDate: dateAt(0.5),
    },
    {
      title: `${campaignName} — Closing push`,
      contentType: 'Social Post',
      platform: 'Facebook & Instagram',
      headline: `Last chance: ${campaignName}`,
      body: `[LOCAL BACKUP CONTENT PLAN] ${name} wraps up "${campaignName}" soon — don't miss your chance to get involved.`,
      hashtags: ['#Manohub', '#EatSalone'],
      scheduledDate: dateAt(0.9),
    },
  ];
}
