export const PLATFORMS = [
  'X',
  'INSTAGRAM',
  'FACEBOOK',
  'TIKTOK',
  'YOUTUBE',
  'LINKEDIN',
  'TELEGRAM',
  'WHATSAPP',
  'DISCORD',
  'REDDIT',
  'EMAIL',
  'WEBSITE',
  'OTHER',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface PlatformOption {
  value: Platform;
  label: string;
  handlePlaceholder: string;
  urlPlaceholder: string;
}

export const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  {
    value: 'X',
    label: 'X (Twitter)',
    handlePlaceholder: 'safesignal_hq',
    urlPlaceholder: 'https://x.com/safesignal_hq',
  },
  {
    value: 'INSTAGRAM',
    label: 'Instagram',
    handlePlaceholder: 'safesignal.official',
    urlPlaceholder: 'https://instagram.com/safesignal.official',
  },
  {
    value: 'FACEBOOK',
    label: 'Facebook',
    handlePlaceholder: 'safesignal.page',
    urlPlaceholder: 'https://facebook.com/safesignal.page',
  },
  {
    value: 'TIKTOK',
    label: 'TikTok',
    handlePlaceholder: 'safesignal_official',
    urlPlaceholder: 'https://www.tiktok.com/@safesignal_official',
  },
  {
    value: 'YOUTUBE',
    label: 'YouTube',
    handlePlaceholder: 'SafeSignalChannel',
    urlPlaceholder: 'https://www.youtube.com/@SafeSignalChannel',
  },
  {
    value: 'LINKEDIN',
    label: 'LinkedIn',
    handlePlaceholder: 'safesignal-security',
    urlPlaceholder: 'https://www.linkedin.com/company/safesignal-security',
  },
  {
    value: 'TELEGRAM',
    label: 'Telegram',
    handlePlaceholder: 'safesignal_alerts',
    urlPlaceholder: 'https://t.me/safesignal_alerts',
  },
  {
    value: 'WHATSAPP',
    label: 'WhatsApp',
    handlePlaceholder: '+15550100',
    urlPlaceholder: 'https://wa.me/15550100',
  },
  {
    value: 'DISCORD',
    label: 'Discord',
    handlePlaceholder: 'safesignal#0001',
    urlPlaceholder: 'https://discord.gg/safesignal',
  },
  {
    value: 'REDDIT',
    label: 'Reddit',
    handlePlaceholder: 'u/safesignal_hq',
    urlPlaceholder: 'https://www.reddit.com/user/safesignal_hq',
  },
  {
    value: 'EMAIL',
    label: 'Official Email',
    handlePlaceholder: 'security@organization.org',
    urlPlaceholder: 'https://organization.org/contact',
  },
  {
    value: 'WEBSITE',
    label: 'Website / Domain',
    handlePlaceholder: 'organization.org',
    urlPlaceholder: 'https://organization.org',
  },
  {
    value: 'OTHER',
    label: 'Other Platform',
    handlePlaceholder: 'official_account',
    urlPlaceholder: 'https://example.org/official_account',
  },
] as const;

export const PLATFORM_LABEL_MAP: Record<Platform, string> = PLATFORM_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item.label;
    return acc;
  },
  {} as Record<Platform, string>,
);

export interface OfficialAccount {
  id: string;
  userId: string;
  platform: Platform;
  username: string;
  profileUrl: string | null;
  displayName: string | null;
  isPrimary: boolean;
  declarationStatus: 'USER_DECLARED';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfficialAccountInput {
  platform: Platform;
  username: string;
  profileUrl?: string;
  displayName?: string;
  notes?: string;
  isPrimary?: boolean;
}

export interface UpdateOfficialAccountInput {
  platform?: Platform;
  username?: string;
  profileUrl?: string | null;
  displayName?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
}
