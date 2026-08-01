import type { ServiceType } from '../../lib/procurement/serviceRequestApi';

export const serviceTypeLabels: Record<ServiceType, string> = {
  document_retrieval: 'Document Retrieval',
  tender_clarification: 'Tender Clarification',
  eligibility_assessment: 'Eligibility Assessment',
  bid_readiness_review: 'Bid-Readiness Review',
  proposal_review: 'Proposal Review',
  company_profile_prep: 'Company Profile Preparation',
  supplier_registration_assistance: 'Supplier Registration Assistance',
  featured_placement: 'Featured Placement Request',
  other: 'Other',
};
