import { OfficialAccount, Platform } from '@prisma/client';
import {
  SIMILARITY_DISCLAIMER,
  analyzeSuspiciousProfileAgainstOfficialAccounts,
} from './similarity-analyzer';

describe('analyzeSuspiciousProfileAgainstOfficialAccounts', () => {
  const officialX: OfficialAccount = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: 'user-1',
    platform: Platform.X,
    handle: 'safesignal_hq',
    displayName: 'SafeSignal Official',
    profileUrl: 'https://x.com/safesignal_hq',
    verified: false,
    isPrimary: true,
    notes: 'Verified security updates and customer trust helpdesk channel',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };

  const officialSite: OfficialAccount = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: 'user-1',
    platform: Platform.WEBSITE,
    handle: 'safesignal.org',
    displayName: 'SafeSignal Portal',
    profileUrl: 'https://safesignal.org',
    verified: false,
    isPrimary: false,
    notes: 'Main public portal',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };

  it('produces NO_BASELINE score=0 when user has no official accounts', () => {
    const result = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: Platform.X,
        username: 'safes1gnal_support',
        displayName: 'SafeSignal Official Help',
        profileUrl: 'https://x.com/safes1gnal_support',
        bio: 'DM us for SafeSignal support',
      },
      [],
    );

    expect(result.level).toBe('NO_BASELINE');
    expect(result.overallScore).toBe(0);
    expect(result.matchedOfficialAccountId).toBeNull();
    expect(result.disclaimer).toBe(SIMILARITY_DISCLAIMER);
    expect(result.indicators[0]?.category).toBe('BASELINE');
  });

  it('detects lookalike username, display-name, bio overlap, and URL handle similarity with explainable breakdown', () => {
    const result = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: Platform.X,
        username: 'safes1gnal_hq_support',
        displayName: 'SafeSignal Official Support',
        profileUrl: 'https://x.com/safes1gnal_hq_support',
        bio: 'Official customer support helpdesk for SafeSignal (@safesignal_hq). Security updates.',
      },
      [officialX],
    );

    expect(result.level).toBe('HIGH_SIMILARITY');
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(result.matchedOfficialAccountId).toBe(officialX.id);
    expect(result.disclaimer).toContain('not proof');

    const best = result.bestMatch!;
    expect(best.dimensions.username.score).toBeGreaterThanOrEqual(80);
    expect(best.dimensions.displayName.score).toBeGreaterThanOrEqual(65);
    expect(best.dimensions.bio.score).toBeGreaterThanOrEqual(65);
    expect(best.dimensions.profileUrl.score).toBeGreaterThanOrEqual(70);
    expect(best.indicators.length).toBeGreaterThanOrEqual(3);
  });

  it('flags non-standard platform domain and lookalike custom website domain', () => {
    const result = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: Platform.X,
        username: 'safesignal_help',
        displayName: 'SafeSignal Portal',
        profileUrl: 'https://safes1gnal.org/login',
        bio: 'Visit our public portal for urgent recovery',
      },
      [officialSite],
    );

    expect(result.bestMatch?.dimensions.profileUrl.score).toBeGreaterThanOrEqual(
      70,
    );
    const categories = result.indicators.map((item) => item.category);
    expect(categories).toContain('PROFILE_URL');
  });

  it('scores unrelated profiles as LOW_SIMILARITY', () => {
    const result = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: Platform.INSTAGRAM,
        username: 'sunset_photography_club',
        displayName: 'Sunset Collectors',
        profileUrl: 'https://instagram.com/sunset_photography_club',
        bio: 'Daily landscape photography from coastal trails.',
      },
      [officialX, officialSite],
    );

    expect(result.level).toBe('LOW_SIMILARITY');
    expect(result.overallScore).toBeLessThan(40);
  });
});
