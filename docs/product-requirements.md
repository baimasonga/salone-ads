# SaloneReach Product Requirements Document (PRD)

## 1. Overview and Positioning
SaloneReach is the digital growth and advertising platform connecting Sierra Leonean businesses, organizations, creators, and communities with local and global audiences (diaspora, NGOs, investors, and tourists).

### Positioning Statement
> SaloneReach is the digital growth and advertising platform connecting Sierra Leonean businesses, organizations, creators, and communities with audiences in Sierra Leone and around the world.

## 2. Target Audience
*   **Businesses in Sierra Leone:** Seeking local and international customer acquisition, brand visibility, and direct marketing channels.
*   **Sierra Leonean Diaspora:** Seeking to support local enterprises, sponsor community programs, buy products for family back home, or invest in Salone.
*   **Local Creators & Influencers:** Musicians, artists, and creators seeking sponsorship, monetization, and audience planning tools.
*   **NGOs & Dev Partners:** Seeking communication toolkits for public outreach, community research, and campaign deployment.
*   **Tourists & Historical Enthusiasts:** Finding local hospitality, cultural events, and travel packages.

## 3. Core Product Modules (MVP Scope)
1.  **Campaign Management:** Structured tool for defining advertising objectives, target locations (districts in SL, diaspora hubs), channels, and content items.
2.  **Content Studio:** Template-driven editor for social creatives, short-form briefs, and scriptwriting, integrated with an AI Campaign Assistant.
3.  **AI Campaign Assistant:** Gemini-powered generator for briefs, copy, video scripts, radio scripts, and hashtags with localized tone tuning.
4.  **Publishing & Calendar:** Multi-view agenda for planning content, with real-time feedback and high-fidelity manual export packages.
5.  **Tracking & CRM Leads:** URL/UTM tracker and WhatsApp link generator paired with a lightweight, secure CRM for capturing conversions.
6.  **Business Directory & Marketplace:** Searchable, verified registry of local businesses and verified influencer cards to facilitate commercial discoverability.
7.  **Analytics & Attribution:** High-contrast dashboards visualizing campaign reach, clicks, WhatsApp conversions, and spend metrics.

## 4. Unstable/Low-Bandwidth Considerations
Since many local users face slow, costly, or unstable internet:
*   **Direct-to-Client Local Saving:** Draft campaigns, content, and profile listings must autosave directly to LocalStorage to protect against sudden signal drop-off.
*   **Direct Upload Control:** Clear indicators of upload size and file compression toggles.
*   **Deferred Elements:** Images and heavy graphic elements default to optimized SVGs, low-res placeholders, or manual-click-to-load video cards.

## 5. Security & Isolation
*   **Multi-tenant Organization Structure:** Logical data boundaries.
*   **Role-Based Permissions:** Restricting campaign modification, financial invoices, and directory claiming to authorized members.
*   **Audit Logging:** Recording mission-critical events (publishing, membership invites, invoice settlements).
