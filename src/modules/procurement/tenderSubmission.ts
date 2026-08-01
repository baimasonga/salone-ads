import type {
  CreateOpportunityInput,
  OpportunityDocument,
  OpportunityListItem,
} from '../../lib/procurement/opportunityApi';

export interface TenderSubmissionRequest {
  organizationId: string;
  organizationName: string;
  input: CreateOpportunityInput;
  documents: File[];
  documentsArePublic: boolean;
}

export interface TenderSubmissionDependencies {
  createOpportunity: (
    organizationId: string,
    organizationName: string,
    input: CreateOpportunityInput,
  ) => Promise<OpportunityListItem>;
  uploadDocument: (
    organizationId: string,
    opportunityId: string,
    file: File,
    isPublic: boolean,
  ) => Promise<OpportunityDocument>;
}

export interface TenderSubmissionResult {
  opportunity: OpportunityListItem;
  uploadedDocuments: OpportunityDocument[];
  failedDocumentCount: number;
}

export function partitionTenderDocuments<T extends { size: number }>(
  documents: readonly T[],
  maximumBytes: number,
): { accepted: T[]; rejected: T[] } {
  return documents.reduce<{ accepted: T[]; rejected: T[] }>(
    (result, document) => {
      result[document.size <= maximumBytes ? 'accepted' : 'rejected'].push(document);
      return result;
    },
    { accepted: [], rejected: [] },
  );
}

export function tenderSubmissionFeedback(failedDocumentCount: number): string {
  if (failedDocumentCount === 0) {
    return 'Tender submitted for admin review. It will go live once approved.';
  }
  const plural = failedDocumentCount === 1;
  return `Tender submitted for admin review, but ${failedDocumentCount} document${plural ? '' : 's'} failed to upload — attach ${plural ? 'it' : 'them'} again from the Documents panel below.`;
}

export async function submitTenderWithDocuments(
  request: TenderSubmissionRequest,
  dependencies: TenderSubmissionDependencies,
): Promise<TenderSubmissionResult> {
  const opportunity = await dependencies.createOpportunity(
    request.organizationId,
    request.organizationName,
    request.input,
  );
  const uploadedDocuments: OpportunityDocument[] = [];
  let failedDocumentCount = 0;

  for (const document of request.documents) {
    try {
      uploadedDocuments.push(await dependencies.uploadDocument(
        request.organizationId,
        opportunity.id,
        document,
        request.documentsArePublic,
      ));
    } catch {
      failedDocumentCount += 1;
    }
  }

  return { opportunity, uploadedDocuments, failedDocumentCount };
}
