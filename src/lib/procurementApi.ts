// Compatibility facade for legacy procurement imports. New and migrated
// consumers should import their focused domain module directly.
export * from './procurement/opportunityApi';
export * from './procurement/sourcingApi';
export * from './procurement/supplierVerificationApi';
export * from './procurement/savedSearchApi';
export * from './procurement/responseApi';
export * from './procurement/bidSubmissionApi';
export * from './procurement/bidPipelineApi';
export * from './procurement/notificationApi';
export * from './procurement/teamApi';
export * from './procurement/subscriptionRequestApi';
export * from './procurement/serviceRequestApi';
export * from './procurement/insightsApi';
export * from './procurement/entitlementAssistApi';

// Adjacent commercial, advertising, CMS and audience domains retain
// compatibility exports while their remaining consumers migrate.
export * from './advertisingApi';
export * from './advertBillingApi';
export * from './agencyApi';
export * from './landingCmsApi';
export * from './audienceApi';
