import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart2,
  Bell,
  BookOpen,
  Compass,
  ClipboardList,
  CreditCard,
  FileSearch,
  Landmark,
  LifeBuoy,
  Mail,
  Settings,
  Shield,
  ScanSearch,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { hasWorkspaceCapability } from '../domain/access/policy';
import type { AccessContext } from '../domain/access/policy';

export interface WorkspaceNavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface WorkspaceNavigationGroup {
  group: string;
  items: WorkspaceNavigationItem[];
}

export function buildWorkspaceNavigation(context: AccessContext): WorkspaceNavigationGroup[] {
  if (hasWorkspaceCapability(context, 'platform:administer')) {
    return [
      {
        group: 'Workspace',
        items: [
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'notifications', label: 'Notifications', icon: Bell },
        ],
      },
      {
        group: 'Publishing',
        items: [
          { id: 'landing-cms', label: 'Landing Page', icon: Sparkles },
          { id: 'content-cms', label: 'Pages & Editorial', icon: BookOpen },
          { id: 'audience-hub', label: 'Audience & Messaging', icon: Mail },
        ],
      },
      {
        group: 'Advertising',
        items: [
          { id: 'campaign-builder', label: 'Campaigns', icon: Compass },
          { id: 'admin-advertising', label: 'Advert Requests', icon: Sparkles },
          { id: 'campaign-performance', label: 'Performance', icon: BarChart2 },
          { id: 'agency-workspace', label: 'Agency Clients', icon: Users },
        ],
      },
      {
        group: 'Operations',
        items: [
          { id: 'opportunity-ingestion', label: 'Opportunity Ingestion', icon: ScanSearch },
          { id: 'admin-tender-review', label: 'Tender Review', icon: Shield },
          { id: 'operations-hub', label: 'Customer Requests', icon: UserCheck },
        ],
      },
      {
        group: 'Administration',
        items: [
          { id: 'admin-analytics', label: 'Platform Analytics', icon: Landmark },
          { id: 'admin-audit-log', label: 'Audit Log', icon: ClipboardList },
          { id: 'admin-finance', label: 'Finance Ledger', icon: CreditCard },
          { id: 'admin-resilience', label: 'Reliability & Recovery', icon: LifeBuoy },
          { id: 'admin', label: 'Settings & Access', icon: Settings },
        ],
      },
    ];
  }

  if (context.isPlatformResearcher) {
    return [
      {
        group: 'Research',
        items: [
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'opportunity-ingestion', label: 'Opportunity Ingestion', icon: ScanSearch },
          { id: 'notifications', label: 'Notifications', icon: Bell },
        ],
      },
    ];
  }

  const groups: WorkspaceNavigationGroup[] = [
    {
      group: 'Workspace',
      items: [
        { id: 'overview', label: 'Overview', icon: BarChart2 },
        { id: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];

  if (hasWorkspaceCapability(context, 'content:manage')) {
    groups.push({
      group: 'Editorial',
      items: [{ id: 'content-cms', label: 'Pages & Editorial', icon: BookOpen }],
    });
  }

  if (hasWorkspaceCapability(context, 'procurement:use')) {
    groups.push({
      group: 'Procurement',
      items: [
        { id: 'tenders', label: 'Tenders', icon: FileSearch },
        { id: 'pipeline', label: 'My Pipeline', icon: BarChart2 },
        { id: 'supplier-profile', label: 'Supplier Profile', icon: Award },
        { id: 'services', label: 'Support Services', icon: UserCheck },
      ],
    });
  }

  if (hasWorkspaceCapability(context, 'advertising:manage')) {
    groups.push({
      group: 'Advertising',
      items: [
        { id: 'campaign-builder', label: 'Campaigns', icon: Compass },
        { id: 'advert-packages', label: 'Packages & Checkout', icon: CreditCard },
        { id: 'campaign-performance', label: 'Performance', icon: BarChart2 },
        { id: 'advertising', label: 'My Adverts', icon: Sparkles },
      ],
    });
  }

  if (hasWorkspaceCapability(context, 'agency:manage')) {
    groups.push({
      group: 'Agency',
      items: [{ id: 'agency-workspace', label: 'Client Workspace', icon: Users }],
    });
  }

  if (hasWorkspaceCapability(context, 'organization:manage')) {
    groups.push({
      group: 'Account',
      items: [
        { id: 'team', label: 'Team', icon: UserPlus },
        { id: 'billing', label: 'Billing', icon: CreditCard },
      ],
    });
  }

  return groups;
}
