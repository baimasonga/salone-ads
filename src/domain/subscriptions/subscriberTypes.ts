export type SubscriberType = 'free' | 'viewer' | 'publisher' | 'advertiser';

export const SUBSCRIBER_TYPES: Array<{
  value: SubscriberType;
  label: string;
  description: string;
  planCode: 'free' | 'professional' | 'business' | 'advertiser';
}> = [
  { value: 'viewer', label: 'Tender Viewer', description: 'Find tenders, receive alerts and submit confidential bids.', planCode: 'professional' },
  { value: 'publisher', label: 'Tender Publisher', description: 'Publish tenders, manage responses and receive supplier bids.', planCode: 'business' },
  { value: 'advertiser', label: 'Business Advertiser', description: 'Request advertising and monitor campaign performance.', planCode: 'advertiser' },
  { value: 'free', label: 'Free Access', description: 'Explore public opportunities before choosing a paid service.', planCode: 'free' },
];

export function isSubscriberType(value: unknown): value is SubscriberType {
  return SUBSCRIBER_TYPES.some((type) => type.value === value);
}
