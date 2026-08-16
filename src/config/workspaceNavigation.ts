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
  ShieldCheck,
  Shield,
  ScanSearch,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { hasWorkspaceCapability } from '../domain/access/policy';
import type { AccessContext } from '../domain/access/policy';
import { getSubscriberType } from '../domain/subscriptions/subscriberTypes';

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
          { id: 'overview', label: 'Control Centre', icon: BarChart2 },
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
          { id: 'campaign-performance', label: 'Performance & Attribution', icon: BarChart2 },
        ],
      },
      {
        group: 'Marketplaces & Tourism',
        items: [
          { id: 'directory', label: 'Business Directory', icon: Landmark },
          { id: 'influencers', label: 'Influencer Marketplace', icon: Users },
          { id: 'events', label: 'Events Management', icon: Sparkles },
          { id: 'tourism', label: 'Tourism Management', icon: Compass },
        ],
      },
      {
        group: 'Operations',
        items: [
          { id: 'opportunity-ingestion', label: 'Opportunity Ingestion', icon: ScanSearch },
          { id: 'admin-tender-review', label: 'Tender Review', icon: Shield },
          { id: 'operations-hub', label: 'Customer Requests', icon: UserCheck },
          { id: 'admin-services', label: 'Customer Support Centre', icon: LifeBuoy },
        ],
      },
      {
        group: 'Administration',
        items: [
          { id: 'admin-organizations', label: 'Subscriber Management', icon: Users },
          { id: 'admin-subscriptions', label: 'Automated Subscription Billing', icon: CreditCard },
          { id: 'agency-workspace', label: 'Agency Oversight', icon: UserCheck },
          { id: 'admin-analytics', label: 'Platform Analytics', icon: Landmark },
          { id: 'admin-audit-log', label: 'Audit Log', icon: ClipboardList },
          { id: 'admin-finance', label: 'Finance Ledger', icon: CreditCard },
          { id: 'admin-resilience', label: 'Reliability & Recovery', icon: LifeBuoy },
          { id: 'admin-access', label: 'Settings & Access', icon: Settings },
          { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
        ],
      },
    ];
  }

  if (context.platformStaffRole === 'finance') return [{ group: 'Finance', items: [
    { id: 'overview', label: 'Finance Control Centre', icon: BarChart2 },
    { id: 'admin-finance', label: 'Finance Ledger', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
  ] }];
  if (context.platformStaffRole === 'editorial') return [{ group: 'Editorial', items: [
    { id: 'overview', label: 'Editorial Control Centre', icon: BarChart2 },
    { id: 'content-cms', label: 'Pages & Editorial', icon: BookOpen },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
  ] }];
  if (context.platformStaffRole === 'support') return [{ group: 'Support', items: [
    { id: 'overview', label: 'Support Control Centre', icon: BarChart2 },
    { id: 'admin-services', label: 'Customer Support Centre', icon: LifeBuoy },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
  ] }];
  if (context.platformStaffRole === 'auditor') return [{ group: 'Assurance', items: [
    { id: 'overview', label: 'Audit Control Centre', icon: BarChart2 },
    { id: 'admin-audit-log', label: 'Audit Log', icon: ClipboardList },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
  ] }];

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
  const isAgency = hasWorkspaceCapability(context, 'agency:manage');

  groups.push({
    group: 'Support',
    items: [{ id: 'services', label: 'Customer Support Centre', icon: LifeBuoy }],
  });

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
        { id: 'tenders', label: 'Tenders & Document Intelligence', icon: FileSearch },
        { id: 'pipeline', label: 'Pipeline & Recommendations', icon: BarChart2 },
        ...(context.subscriberType === 'viewer' ? [{ id: 'supplier-profile', label: 'Supplier Profile', icon: Award }] : []),
      ],
    });
  }

  if (hasWorkspaceCapability(context, 'advertising:manage')) {
    groups.push({
      group: 'Advertising',
      items: [
        { id: 'campaign-builder', label: 'Campaigns', icon: Compass },
        { id: 'advert-packages', label: 'Packages & Checkout', icon: CreditCard },
        { id: 'campaign-performance', label: 'Performance & Attribution', icon: BarChart2 },
        { id: 'advertising', label: 'My Adverts', icon: Sparkles },
      ],
    });
  }

  if (isAgency) {
    groups.push({
      group: 'Agency',
      items: [{ id: 'agency-workspace', label: 'Client Workspace', icon: Users }],
    });
  }

  if (hasWorkspaceCapability(context, 'organization:manage')) {
    const subscriber = getSubscriberType(context.subscriberType);
    groups.push({
      group: 'Account',
      items: [
        ...(!isAgency ? [{ id: 'agency-workspace', label: 'Agency Access', icon: UserCheck }] : []),
        { id: 'org-profile', label: subscriber.profileLabel, icon: Settings },
        { id: 'team', label: 'Team', icon: UserPlus },
        { id: 'billing', label: 'Billing & Renewals', icon: CreditCard },
        { id: 'account-security', label: 'Account Security', icon: ShieldCheck },
      ],
    });
  }

  return groups;
}
