/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  type: string;
  country: string;
  district?: string;
  primaryObjective: string;
  monthlyBudget: string;
}

export interface BrandKit {
  brandName: string;
  legalName: string;
  mission: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  fonts: string;
  toneOfVoice: string;
  prohibitedTerminology: string[];
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  objective: string;
  status: 'Draft' | 'Planning' | 'Approved' | 'Scheduled' | 'Active' | 'Completed' | 'Failed';
  totalBudget: number;
  startDate: string;
  endDate: string;
  channels: string[];
  district?: string;
  diasporaMarket?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  contentType: 'Social Post' | 'WhatsApp Promo' | 'Video Script' | 'Radio Brief' | 'Email News';
  platform: string;
  headline: string;
  bodyText: string;
  hashtags: string[];
  scheduledDate: string;
  status: 'Draft' | 'Awaiting Review' | 'Approved' | 'Scheduled' | 'Published' | 'Failed';
  version: number;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  telephone: string;
  whatsapp: string;
  district?: string;
  source: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Converted' | 'Lost';
  estimatedValue: number;
}

export interface DirectoryProfile {
  id: string;
  businessName: string;
  category: string;
  description: string;
  district: string;
  city: string;
  whatsapp: string;
  email: string;
  isVerified: boolean;
  diasporaSupport: boolean;
}

export interface InfluencerProfile {
  id: string;
  displayName: string;
  location: string;
  district?: string;
  categories: string[];
  platforms: string[];
  audienceSize: string;
  engagementRate: string;
  rateRange: string;
  isVerified: boolean;
}

export interface SocialConnection {
  platform: string;
  accountName: string;
  status: 'Connected' | 'Sandbox' | 'Expired' | 'Not Configured';
  connectionHealth: 'Healthy' | 'Warning' | 'Disconnected' | 'None';
}
