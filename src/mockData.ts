import { DirectoryProfile, InfluencerProfile, Campaign, ContentItem, Lead, SocialConnection } from './types';

export const INITIAL_DIRECTORY_PROFILES: DirectoryProfile[] = [
  {
    id: 'dir-1',
    businessName: 'Freetown Haven Hotel',
    category: 'Hotels & Tourism',
    description: 'Boutique hotel located on Lumley Beach. Offering premium ocean views, conference centers, and traditional cuisine for homecoming tourists.',
    district: 'Western Area Urban',
    city: 'Freetown',
    whatsapp: '+232 76 123456',
    email: 'info@freetownhaven.com',
    isVerified: true,
    diasporaSupport: true
  },
  {
    id: 'dir-2',
    businessName: 'Bo Organic Agricultural Coop',
    category: 'Agriculture',
    description: 'Farmer cooperative producing premium parboiled native rice and organic cocoa butter. Supplying local markets and shipping internationally.',
    district: 'Bo',
    city: 'Bo Town',
    whatsapp: '+232 79 987654',
    email: 'contact@boorganic.org',
    isVerified: true,
    diasporaSupport: true
  },
  {
    id: 'dir-3',
    businessName: 'Salone Tech Hub',
    category: 'Technology & Media',
    description: 'Shared co-working space, digital skills agency, and incubator for Freetown tech talents. Designing localized digital branding systems.',
    district: 'Western Area Urban',
    city: 'Freetown',
    whatsapp: '+232 30 555666',
    email: 'hello@salonetech.io',
    isVerified: false,
    diasporaSupport: false
  },
  {
    id: 'dir-4',
    businessName: 'Kenema Cocoa Exporters',
    category: 'Agriculture',
    description: 'Sourcing single-origin cocoa beans from smallholder growers in eastern Sierra Leone for direct fairtrade European shipment.',
    district: 'Kenema',
    city: 'Kenema',
    whatsapp: '+232 88 111222',
    email: 'sales@kenemacocoa.com',
    isVerified: true,
    diasporaSupport: true
  },
  {
    id: 'dir-5',
    businessName: 'Sweet Salone Catering',
    category: 'Restaurants & Catering',
    description: 'Authentic Sierra Leonean dishes (Cassava leaf, groundnut soup, fry fish, ginger beer) catering for weddings, diaspora homecoming bashes, and corporate summits.',
    district: 'Western Area Urban',
    city: 'Freetown',
    whatsapp: '+232 77 444333',
    email: 'orders@sweetsalone.sl',
    isVerified: false,
    diasporaSupport: true
  }
];

export const INITIAL_INFLUENCER_PROFILES: InfluencerProfile[] = [
  {
    id: 'inf-1',
    displayName: 'DJ Salone Mix',
    location: 'London, UK / Freetown',
    district: 'Western Area Urban',
    categories: ['Music & Events', 'Culture'],
    platforms: ['Instagram', 'TikTok', 'YouTube'],
    audienceSize: '120K+',
    engagementRate: '4.8%',
    rateRange: '$150 - $400 / post',
    isVerified: true
  },
  {
    id: 'inf-2',
    displayName: 'Fatima Salone Vlogger',
    location: 'Freetown, Sierra Leone',
    district: 'Western Area Urban',
    categories: ['Tourism & Travel', 'Food'],
    platforms: ['TikTok', 'YouTube', 'Facebook'],
    audienceSize: '85K+',
    engagementRate: '6.2%',
    rateRange: 'Le 2,500,000 / video',
    isVerified: true
  },
  {
    id: 'inf-3',
    displayName: 'Kadiatu Fashion King',
    location: 'Bo Town, Sierra Leone',
    district: 'Bo',
    categories: ['Fashion & Lifestyle', 'Local Brands'],
    platforms: ['Instagram', 'TikTok'],
    audienceSize: '42K+',
    engagementRate: '3.5%',
    rateRange: 'Le 1,200,000 / post',
    isVerified: false
  },
  {
    id: 'inf-4',
    displayName: 'Abu the Investor',
    location: 'Maryland, USA',
    categories: ['Investment', 'Diaspora News', 'Tech'],
    platforms: ['LinkedIn', 'YouTube'],
    audienceSize: '25K+',
    engagementRate: '5.1%',
    rateRange: '$250 - $600 / campaign',
    isVerified: true
  }
];

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-1',
    name: 'Christmas Homecoming Festival',
    description: 'Attracting diaspora tourists in the UK and US to Lumley Beach and historic Bunce Island for festive concerts and heritage tours.',
    objective: 'Tourism & Bookings',
    status: 'Active',
    totalBudget: 45000000,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    channels: ['Facebook Video', 'Instagram Ads', 'WhatsApp Broadcast'],
    district: 'Western Area Urban',
    diasporaMarket: 'United Kingdom'
  },
  {
    id: 'camp-2',
    name: 'Native Parboiled Rice Launch',
    description: 'Promoting local organic long-grain parboiled rice processed in Bo. Scoping diaspora sponsorships to buy food directly for parents back home.',
    objective: 'Product Sales',
    status: 'Scheduled',
    totalBudget: 15000000,
    startDate: '2026-08-01',
    endDate: '2026-09-15',
    channels: ['WhatsApp click campaign', 'TikTok Challenge', 'Manual Flyer Package'],
    district: 'Bo',
    diasporaMarket: 'United States'
  },
  {
    id: 'camp-3',
    name: 'Kenema Cocoa Brand Brief',
    description: 'Creative brand awareness targeting craft chocolatiers and organic suppliers in North America looking for direct sustainable trade partnerships.',
    objective: 'Investor Enquiries',
    status: 'Planning',
    totalBudget: 8000000,
    startDate: '2026-09-01',
    endDate: '2026-10-31',
    channels: ['LinkedIn Organic', 'YouTube Video'],
    district: 'Kenema',
    diasporaMarket: 'Canada'
  }
];

export const INITIAL_CONTENT_ITEMS: ContentItem[] = [
  {
    id: 'cont-1',
    title: 'Lumley Beach Concert Reel',
    contentType: 'Video Script',
    platform: 'Instagram / TikTok',
    headline: 'Feel the sand, hear the beat! 🇸🇱',
    bodyText: 'Are you ready for the ultimate December homecoming? Lumley beach, live African drums, traditional cuisine, and performance from top Salone musicians. Secure your early bird passes before slots run out.',
    hashtags: ['#SweetSalone', '#Homecoming2026', '#SaloneReach', '#LumleyBeats'],
    scheduledDate: '2026-12-05',
    status: 'Approved',
    version: 2
  },
  {
    id: 'cont-2',
    title: 'Diaspora Native Rice Promo',
    contentType: 'WhatsApp Promo',
    platform: 'WhatsApp',
    headline: 'Buy Organic Native Rice for Family Back Home!',
    bodyText: 'Tired of expensive wire transfer fees to feed your parents? Buy a bag of parboiled native rice grown with love in Bo. We deliver directly to Freetown, Makeni, and Bo within 48 hours. Support local growers directly!',
    hashtags: ['#EatSalone', '#SupportBoGrowers', '#DiasporaGives'],
    scheduledDate: '2026-08-10',
    status: 'Scheduled',
    version: 1
  },
  {
    id: 'cont-3',
    title: 'Sustainable Cocoa Trade Thread',
    contentType: 'Social Post',
    platform: 'LinkedIn',
    headline: 'Single-Origin, Single-Harvest Sustainable Cocoa',
    bodyText: 'We are transforming eastern Sierra Leone into a premium hub for single-harvest organic cocoa. Our network of 500 smallholder growers in Kenema guarantees complete traceability and zero chemical processing. Direct fairtrade shipping now open.',
    hashtags: ['#KenemaCocoa', '#SustainableTrade', '#SaloneReach', '#OrganicChocolate'],
    scheduledDate: '2026-09-02',
    status: 'Draft',
    version: 1
  }
];

export const INITIAL_LEADS: Lead[] = [
  {
    id: 'lead-1',
    name: 'Mohamed Bangura',
    email: 'mohamed.b@gmail.com',
    telephone: '+44 7712 345678',
    whatsapp: '+447712345678',
    district: 'London Hub',
    source: 'Christmas Homecoming Festival',
    status: 'Qualified',
    estimatedValue: 12500000
  },
  {
    id: 'lead-2',
    name: 'Aminata Kallon',
    email: 'aminata_k@hotmail.com',
    telephone: '+232 76 456789',
    whatsapp: '+23276456789',
    district: 'Western Area Urban',
    source: 'Native Parboiled Rice Launch',
    status: 'Converted',
    estimatedValue: 2400000
  },
  {
    id: 'lead-3',
    name: 'Jeffrey Jenkins',
    email: 'j.jenkins@chocolatiers.com',
    telephone: '+1 301 555 1212',
    whatsapp: '+13015551212',
    district: 'Maryland Hub',
    source: 'Kenema Cocoa Brand Brief',
    status: 'New',
    estimatedValue: 180000000
  },
  {
    id: 'lead-4',
    name: 'Sarah Kamara',
    email: 'skamara@ngoworld.org',
    telephone: '+232 30 998877',
    whatsapp: '+23230998877',
    district: 'Bo',
    source: 'Native Parboiled Rice Launch',
    status: 'Proposal Sent',
    estimatedValue: 35000000
  }
];

export const INITIAL_SOCIAL_CONNECTIONS: SocialConnection[] = [
  {
    platform: 'Facebook & Instagram',
    accountName: 'SaloneReach Sandbox',
    status: 'Sandbox',
    connectionHealth: 'Healthy'
  },
  {
    platform: 'WhatsApp Business API',
    accountName: 'SaloneReach Broadcast',
    status: 'Connected',
    connectionHealth: 'Healthy'
  },
  {
    platform: 'TikTok Creator Hub',
    accountName: 'Unconfigured Platform',
    status: 'Not Configured',
    connectionHealth: 'None'
  },
  {
    platform: 'LinkedIn Professional Profile',
    accountName: 'SaloneReach Corporate',
    status: 'Expired',
    connectionHealth: 'Warning'
  }
];
