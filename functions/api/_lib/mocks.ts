// Local fallback responses when no GEMINI_API_KEY is configured — mirrors
// server.ts's getMockAIResponse / getMockProcurementAIResponse exactly, so
// behavior is identical whether the app runs on the Express server or here.

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
"Feed your family with the finest organic quality from ${name}. Taste you remember, standards you trust. Delivered in 48 hours. #EatSalone #SaloneReach"`;
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
