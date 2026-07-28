const PROCUREMENT_TABS = ['overview', 'tenders', 'pipeline', 'supplier-profile', 'services'] as const;

export type ProcurementTab = (typeof PROCUREMENT_TABS)[number];

export function isProcurementTab(tab: string): tab is ProcurementTab {
  return PROCUREMENT_TABS.includes(tab as ProcurementTab);
}

