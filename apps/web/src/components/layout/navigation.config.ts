export const BRAND_NAME = 'SafeSignal';
export const BRAND_TAGLINE = 'Your safety. Your evidence. Your voice.';

export type NavBadgeTone = 'alert' | 'verified' | 'neutral';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon:
    | 'overview'
    | 'identity'
    | 'incidents'
    | 'abuse'
    | 'evidence'
    | 'intelligence'
    | 'reports'
    | 'privacy';
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
      { id: 'overview', label: 'Overview', href: '/dashboard', icon: 'overview' },
      {
        id: 'incidents',
        label: 'Incidents',
        href: '/incidents',
        icon: 'incidents',
        badge: { text: 'Alert', tone: 'alert' },
      },
      {
        id: 'intelligence',
        label: 'Intelligence',
        href: '/intelligence',
        icon: 'intelligence',
      },
    ],
  },
  {
    title: 'Protection & Custody',
    items: [
      {
        id: 'identity',
        label: 'Identity',
        href: '/identity',
        icon: 'identity',
        badge: { text: 'Declared', tone: 'neutral' },
      },
      { id: 'abuse', label: 'Abuse Reports', href: '/abuse', icon: 'abuse' },
      {
        id: 'evidence',
        label: 'Evidence Vault',
        href: '/evidence',
        icon: 'evidence',
      },
    ],
  },
  {
    title: 'Governance',
    items: [
      { id: 'reports', label: 'Reports', href: '/reports', icon: 'reports' },
      {
        id: 'privacy',
        label: 'Privacy & Access',
        href: '/privacy',
        icon: 'privacy',
      },
    ],
  },
];
