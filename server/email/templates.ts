export function createEmailRenderers(htmlEscape: (value: string) => string) {
function renderAudienceEmail(input: {
  subject: string;
  previewText: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  unsubscribeHref?: string;
}): string {
  const paragraphs = input.body.split(/\n{2,}/).map(paragraph =>
    `<p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.7">${htmlEscape(paragraph).replace(/\n/g, "<br />")}</p>`
  ).join("");
  let safeCtaHref = "";
  try {
    const parsed = new URL(input.ctaHref);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") safeCtaHref = parsed.toString();
  } catch {
    safeCtaHref = "";
  }
  const cta = input.ctaLabel && safeCtaHref
    ? `<a href="${htmlEscape(safeCtaHref)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:13px 20px;font-weight:700;font-size:13px;margin:6px 0 24px">${htmlEscape(input.ctaLabel)}</a>`
    : "";
  const unsubscribe = input.unsubscribeHref
    ? `<p style="margin:24px 0 0;color:#94a3b8;font-size:11px;line-height:1.5">You received this because you subscribed to Hyderra updates. <a href="${htmlEscape(input.unsubscribeHref)}" style="color:#64748b">Unsubscribe securely</a>.</p>`
    : `<p style="margin:24px 0 0;color:#94a3b8;font-size:11px">This is a Hyderra test message.</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(input.subject)}</title></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${htmlEscape(input.previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#fff;border:2px solid #0f172a"><tr><td style="background:#0f172a;padding:22px 28px;color:#fff"><div style="font-size:21px;font-weight:900;letter-spacing:3px">HYD<span style="color:#10b981">ERRA</span></div><div style="margin-top:5px;color:#94a3b8;font-size:10px;letter-spacing:2px">OPPORTUNITIES · BUSINESS · AUDIENCE</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 20px;color:#0f172a;font-size:28px;line-height:1.2">${htmlEscape(input.subject)}</h1>${paragraphs}${cta}${unsubscribe}</td></tr><tr><td style="background:#f4d35e;border-top:2px solid #0f172a;padding:14px 28px;color:#0f172a;font-size:11px;font-weight:700">Hyderra · Built for the Mano River market</td></tr></table></td></tr></table></body></html>`;
}

function renderTenderAlertEmail(input: {
  frequency: 'immediate' | 'daily' | 'weekly';
  opportunities: Array<{
    title: string;
    slug: string;
    buyerName: string;
    deadline: string | null;
    searchName: string;
    matchScore: number;
  }>;
  appOrigin: string;
}): string {
  const label = input.frequency === 'immediate'
    ? 'New tender alert'
    : input.frequency === 'daily' ? 'Daily tender digest' : 'Weekly tender digest';
  const cards = input.opportunities.map((opportunity) => {
    const href = `${input.appOrigin}/tenders/${encodeURIComponent(opportunity.slug)}`;
    const deadline = opportunity.deadline
      ? new Date(opportunity.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : 'See notice';
    return `<tr><td style="padding:18px 0;border-bottom:1px solid #cbd5e1"><div style="color:#047857;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${htmlEscape(opportunity.searchName)} · ${opportunity.matchScore}% match</div><h2 style="margin:7px 0 5px;color:#0f172a;font-size:18px;line-height:1.3">${htmlEscape(opportunity.title)}</h2><p style="margin:0 0 12px;color:#64748b;font-size:13px">${htmlEscape(opportunity.buyerName || 'Buyer not specified')} · Closes ${htmlEscape(deadline)}</p><a href="${htmlEscape(href)}" style="color:#047857;font-size:13px;font-weight:800">View verified tender →</a></td></tr>`;
  }).join('');
  const manageHref = `${input.appOrigin}/tenders`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${input.opportunities.length} matching tender ${input.opportunities.length === 1 ? 'opportunity' : 'opportunities'} from Hyderra</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:650px;background:#fff;border:2px solid #0f172a"><tr><td style="background:#0f172a;padding:22px 28px;color:#fff"><div style="font-size:21px;font-weight:900;letter-spacing:3px">HYD<span style="color:#10b981">ERRA</span></div><div style="margin-top:5px;color:#94a3b8;font-size:10px;letter-spacing:2px">${label.toUpperCase()}</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0;color:#0f172a;font-size:26px">${htmlEscape(label)}</h1><p style="margin:8px 0 18px;color:#475569;font-size:14px">These reviewed opportunities match your saved search criteria.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table><p style="margin:24px 0 0;color:#94a3b8;font-size:11px;line-height:1.5">You receive these alerts because you created a saved search on Hyderra. <a href="${htmlEscape(manageHref)}" style="color:#64748b">Manage or pause your alerts</a>.</p></td></tr><tr><td style="background:#f4d35e;border-top:2px solid #0f172a;padding:14px 28px;color:#0f172a;font-size:11px;font-weight:700">Hyderra · Verified opportunities for the Mano River market</td></tr></table></td></tr></table></body></html>`;
}

  return { renderAudienceEmail, renderTenderAlertEmail };
}
