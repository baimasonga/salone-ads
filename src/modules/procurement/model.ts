export type ProcurementTier = 'Free' | 'Viewer' | 'Publisher' | null;

export function resolveProcurementTier(
  canPublish: boolean,
  canViewDetails: boolean,
): Exclude<ProcurementTier, null> {
  if (canPublish) return 'Publisher';
  if (canViewDetails) return 'Viewer';
  return 'Free';
}

