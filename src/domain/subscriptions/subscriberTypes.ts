export type SubscriberType = 'free' | 'viewer' | 'publisher' | 'advertiser';

export const SUBSCRIBER_TYPES: Array<{
  value: SubscriberType;
  label: string;
  description: string;
  planCode: 'free' | 'professional' | 'business' | 'advertiser';
  features: string[];
  profileLabel: string;
}> = [
  { value: 'viewer', label: 'Tender Viewer', description: 'Find tenders, receive alerts and submit confidential bids.', planCode: 'professional', features: ['Full tender details', 'Tender alerts', 'Confidential bid submissions'], profileLabel: 'Organisation & Supplier Profile' },
  { value: 'publisher', label: 'Tender Publisher', description: 'Publish tenders, manage responses and receive supplier bids.', planCode: 'business', features: ['Publish and manage tenders', 'Receive supplier bids', 'Tender response tracking'], profileLabel: 'Organisation & Buyer Profile' },
  { value: 'advertiser', label: 'Business Advertiser', description: 'Request advertising and monitor campaign performance.', planCode: 'advertiser', features: ['Advertising requests', 'Campaign workspace', 'Performance monitoring'], profileLabel: 'Business & Advertising Profile' },
  { value: 'free', label: 'Free Access', description: 'Explore public opportunities before choosing a paid service.', planCode: 'free', features: ['Public opportunities', 'Basic saved interests', 'Upgrade when ready'], profileLabel: 'Organisation Profile' },
];

export function isSubscriberType(value: unknown): value is SubscriberType {
  return SUBSCRIBER_TYPES.some((type) => type.value === value);
}

export function getSubscriberType(value: SubscriberType) {
  return SUBSCRIBER_TYPES.find((type) => type.value === value) ?? SUBSCRIBER_TYPES[3];
}
