export const BRAND_NAME = 'SafeSignal';
export const BRAND_TAGLINE = 'Your safety. Your evidence. Your voice.';

export type NavBadgeTone = 'alert' | 'verified' | 'neutral';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon:
    | 'dashboard'
    | 'overview'
    | 'identity'
    | 'abuse'
    | 'evidence'
    | 'privacy'
    | 'incidents'
    | 'intelligence'
    | 'settings'
    | 'reports';
  badge?: {
    text: string;
    tone: NavBadgeTone;
  };
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const SIDEBAR_NAVIGATION: NavSection[] = [
  {
    title: 'Command Center',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'dashboard',
      },
    ],
  },
  {
    title: 'Protection & Response',
    items: [
      {
        id: 'identity',
        label: 'Identity Protection',
        href: '/identity',
        icon: 'identity',
      },
      {
        id: 'abuse',
        label: 'Abuse Reporting',
        href: '/abuse',
        icon: 'abuse',
      },
      {
        id: 'evidence',
        label: 'Evidence Vault',
        href: '/evidence',
        icon: 'evidence',
      },
      {
        id: 'privacy',
        label: 'Privacy Protection',
        href: '/privacy',
        icon: 'privacy',
      },
      {
        id: 'incidents',
        label: 'Incident Management',
        href: '/incidents',
        icon: 'incidents',
        badge: { text: 'Active', tone: 'alert' },
      },
      {
        id: 'intelligence',
        label: 'Safety Intelligence',
        href: '/intelligence',
        icon: 'intelligence',
      },
    ],
  },
  {
    title: 'Preferences',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: 'settings',
      },
    ],
  },
];
