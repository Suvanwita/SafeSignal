import { OfficialAccount, Platform } from '@prisma/client';
import type {
  DimensionBreakdown,
  ImpersonationIndicator,
  OfficialAccountComparison,
  SimilarityAnalysisResultPayload,
  SimilarityLevel,
} from './dto/suspicious-profile-response.dto';

export interface SuspiciousProfileSnapshot {
  platform: Platform;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  bio: string | null;
}

export const SIMILARITY_DISCLAIMER =
  'Similarity scores and indicators are automated heuristics comparing submitted text and URLs against your user-declared official accounts. They serve as review indicators, not proof of impersonation or fake account status.';

const DIMENSION_WEIGHTS = {
  username: 0.4,
  displayName: 0.25,
  bio: 0.2,
  profileUrl: 0.15,
} as const;

const IMPERSONATION_AFFIXES = [
  'official',
  'real',
  'support',
  'help',
  'team',
  'admin',
  'verify',
  'verified',
  'security',
  'backup',
  'news',
  'hq',
  'staff',
  'service',
  'desk',
];

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'with',
  'your',
  'our',
  'we',
]);

const EXPECTED_PLATFORM_HOSTS: Partial<Record<Platform, string[]>> = {
  X: ['x.com', 'twitter.com'],
  INSTAGRAM: ['instagram.com'],
  FACEBOOK: ['facebook.com', 'fb.com'],
  TIKTOK: ['tiktok.com'],
  YOUTUBE: ['youtube.com', 'youtu.be'],
  LINKEDIN: ['linkedin.com'],
  TELEGRAM: ['t.me', 'telegram.me'],
  WHATSAPP: ['wa.me', 'whatsapp.com'],
  DISCORD: ['discord.com', 'discord.gg'],
  REDDIT: ['reddit.com'],
};

const KNOWN_SOCIAL_HOSTS = new Set(
  Object.values(EXPECTED_PLATFORM_HOSTS).flat(),
);

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function normalizedLevenshtein(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

function toHomoglyphSkeleton(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1|!li]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]/g, '');
}

function normalizePlainText(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeMeaningful(raw: string): string[] {
  const normalized = normalizePlainText(raw);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
    ),
  );
}

function bigrams(str: string): string[] {
  const clean = str.replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return clean ? [clean] : [];
  const pairs: string[] = [];
  for (let i = 0; i < clean.length - 1; i += 1) {
    pairs.push(clean.slice(i, i + 2));
  }
  return pairs;
}

function diceSimilarity(a: string, b: string): number {
  const pairsA = bigrams(a);
  const pairsB = bigrams(b);
  if (pairsA.length === 0 || pairsB.length === 0) return 0;
  const countB = new Map<string, number>();
  for (const p of pairsB) {
    countB.set(p, (countB.get(p) ?? 0) + 1);
  }
  let matches = 0;
  for (const p of pairsA) {
    const remaining = countB.get(p) ?? 0;
    if (remaining > 0) {
      matches += 1;
      countB.set(p, remaining - 1);
    }
  }
  return (2 * matches) / (pairsA.length + pairsB.length);
}

function parseSafeUrl(raw: string | null): {
  host: string;
  slug: string;
} | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const segments = parsed.pathname
      .split('/')
      .map((seg) => seg.trim())
      .filter(Boolean);
    const rawSlug = segments[segments.length - 1] ?? '';
    return {
      host,
      slug: rawSlug.replace(/^@+/, '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

function classifyLevel(score: number): Exclude<SimilarityLevel, 'NO_BASELINE'> {
  if (score >= 70) return 'HIGH_SIMILARITY';
  if (score >= 40) return 'MODERATE_SIMILARITY';
  return 'LOW_SIMILARITY';
}

function computeHandleMetrics(candidate: string, officialHandle: string) {
  const susNorm = normalizeHandle(candidate);
  const offNorm = normalizeHandle(officialHandle);
  const susSkel = toHomoglyphSkeleton(susNorm);
  const offSkel = toHomoglyphSkeleton(offNorm);

  const directSim = normalizedLevenshtein(susNorm, offNorm);
  const skelSim =
    susSkel && offSkel ? normalizedLevenshtein(susSkel, offSkel) : directSim;

  let affixMatched: string | null = null;
  let containmentBonus = 0;

  if (offSkel.length >= 3 && susSkel.includes(offSkel) && susSkel !== offSkel) {
    const remainder = susSkel.replace(offSkel, '');
    const hit = IMPERSONATION_AFFIXES.find((affix) =>
      remainder.includes(affix),
    );
    if (hit) {
      affixMatched = hit;
      containmentBonus = 0.86;
    } else if (remainder.length <= 4) {
      containmentBonus = 0.8;
    }
  }

  const rawBest = Math.max(directSim, skelSim * 0.96, containmentBonus);
  const score = Math.min(100, Math.max(0, Math.round(rawBest * 100)));

  return {
    susNorm,
    offNorm,
    offSkel,
    directSim,
    skelSim,
    affixMatched,
    score,
  };
}

function scoreUsername(
  suspiciousUsername: string,
  officialHandle: string,
): {
  dimension: DimensionBreakdown;
  indicators: ImpersonationIndicator[];
} {
  const {
    susNorm,
    offNorm,
    offSkel,
    directSim,
    skelSim,
    affixMatched,
    score,
  } = computeHandleMetrics(suspiciousUsername, officialHandle);
  const indicators: ImpersonationIndicator[] = [];
  const reasons: string[] = [];

  if (susNorm === offNorm) {
    reasons.push(`Identical normalized handle "${susNorm}"`);
    indicators.push({
      id: 'username-exact-match',
      category: 'USERNAME',
      level: 'HIGH',
      title: 'Matching username handle',
      explanation: `Submitted username "${suspiciousUsername}" matches declared handle "${officialHandle}" after case/@ normalization.`,
    });
  } else {
    if (skelSim > directSim + 0.08 && skelSim >= 0.75) {
      reasons.push(
        `High lookalike similarity (${Math.round(skelSim * 100)}%) after normalizing character/separator substitutions`,
      );
      indicators.push({
        id: 'username-lookalike-substitution',
        category: 'USERNAME',
        level: 'HIGH',
        title: 'Lookalike character or separator substitution',
        explanation: `"${suspiciousUsername}" closely mirrors "${officialHandle}" once lookalike characters (e.g., 0/o, 1/l, 3/e) and punctuation separators are normalized.`,
      });
    } else if (directSim >= 0.72) {
      reasons.push(
        `Close spelling similarity (${Math.round(directSim * 100)}%) to "${officialHandle}"`,
      );
      indicators.push({
        id: 'username-spelling-proximity',
        category: 'USERNAME',
        level: 'HIGH',
        title: 'High handle spelling similarity',
        explanation: `"${suspiciousUsername}" shares ${score}% string similarity with declared handle "${officialHandle}".`,
      });
    }

    if (affixMatched) {
      reasons.push(
        `Contains official handle "${offSkel}" with impersonation-style affix "${affixMatched}"`,
      );
      indicators.push({
        id: 'username-impersonation-affix',
        category: 'USERNAME',
        level: 'HIGH',
        title: `Contains handle plus "${affixMatched}" affix`,
        explanation: `Username embeds the official handle alongside "${affixMatched}", a common pattern in lookalike or spoofed support profiles.`,
      });
    } else if (score >= 45 && indicators.length === 0) {
      reasons.push(
        `Moderate handle similarity (${score}%) compared with "${officialHandle}"`,
      );
      indicators.push({
        id: 'username-moderate-overlap',
        category: 'USERNAME',
        level: 'MODERATE',
        title: 'Moderate username overlap',
        explanation: `Submitted username shows ${score}% lexical similarity with "${officialHandle}".`,
      });
    }
  }

  const explanation =
    reasons.length > 0
      ? reasons.join('. ') + '.'
      : `Low lexical similarity (${score}%) between "${suspiciousUsername}" and declared handle "${officialHandle}".`;

  return {
    dimension: {
      score,
      available: true,
      weight: DIMENSION_WEIGHTS.username,
      explanation,
      indicators: indicators.map((item) => item.title),
    },
    indicators,
  };
}

function scoreDisplayName(
  suspiciousDisplayName: string | null,
  official: OfficialAccount,
): {
  dimension: DimensionBreakdown;
  indicators: ImpersonationIndicator[];
} {
  if (!suspiciousDisplayName || !suspiciousDisplayName.trim()) {
    return {
      dimension: {
        score: null,
        available: false,
        weight: DIMENSION_WEIGHTS.displayName,
        explanation: 'No display name was submitted for comparison.',
        indicators: [],
      },
      indicators: [],
    };
  }

  const targetName = official.displayName?.trim() || null;
  if (!targetName) {
    const susNorm = normalizePlainText(suspiciousDisplayName);
    const offHandleTokens = tokenizeMeaningful(
      official.handle.replace(/[_.-]/g, ' '),
    );
    const susTokens = tokenizeMeaningful(susNorm);
    const shared = susTokens.filter((token) => offHandleTokens.includes(token));

    if (shared.length > 0) {
      const score = Math.min(
        85,
        Math.round((shared.length / Math.max(offHandleTokens.length, 1)) * 75),
      );
      const indicator: ImpersonationIndicator = {
        id: 'display-name-matches-handle-tokens',
        category: 'DISPLAY_NAME',
        level: score >= 60 ? 'MODERATE' : 'INFO',
        title: 'Display name overlaps official handle terms',
        explanation: `Submitted display name "${suspiciousDisplayName}" includes term(s) [${shared.join(', ')}] from official handle "${official.handle}".`,
      };
      return {
        dimension: {
          score,
          available: true,
          weight: DIMENSION_WEIGHTS.displayName,
          explanation: indicator.explanation,
          indicators: [indicator.title],
        },
        indicators: [indicator],
      };
    }

    return {
      dimension: {
        score: null,
        available: false,
        weight: DIMENSION_WEIGHTS.displayName,
        explanation:
          'This declared official account has no display name set, so direct display-name comparison was skipped.',
        indicators: [],
      },
      indicators: [],
    };
  }

  const susClean = normalizePlainText(suspiciousDisplayName);
  const offClean = normalizePlainText(targetName);
  const levSim = normalizedLevenshtein(susClean, offClean);
  const susTokens = tokenizeMeaningful(susClean);
  const offTokens = tokenizeMeaningful(offClean);
  const intersection = susTokens.filter((t) => offTokens.includes(t));
  const unionSize = new Set([...susTokens, ...offTokens]).size;
  const jaccard = unionSize > 0 ? intersection.length / unionSize : 0;
  const containment =
    offTokens.length > 0 ? intersection.length / offTokens.length : 0;

  const combined = Math.max(levSim, jaccard * 0.9 + containment * 0.1);
  const score = Math.min(100, Math.max(0, Math.round(combined * 100)));
  const indicators: ImpersonationIndicator[] = [];

  let explanation: string;
  if (susClean === offClean) {
    explanation = `Display name "${suspiciousDisplayName}" exactly matches official display name "${targetName}".`;
    indicators.push({
      id: 'display-name-exact',
      category: 'DISPLAY_NAME',
      level: 'HIGH',
      title: 'Exact display-name match',
      explanation,
    });
  } else if (score >= 70) {
    explanation = `Display name "${suspiciousDisplayName}" closely matches "${targetName}" (${score}% similarity${intersection.length > 0 ? `, shared terms: ${intersection.join(', ')}` : ''}).`;
    indicators.push({
      id: 'display-name-high',
      category: 'DISPLAY_NAME',
      level: 'HIGH',
      title: 'High display-name similarity',
      explanation,
    });
  } else if (score >= 40) {
    explanation = `Display name shares partial similarity (${score}%) with "${targetName}"${intersection.length > 0 ? ` (overlapping terms: ${intersection.join(', ')})` : ''}.`;
    indicators.push({
      id: 'display-name-moderate',
      category: 'DISPLAY_NAME',
      level: 'MODERATE',
      title: 'Partial display-name overlap',
      explanation,
    });
  } else {
    explanation = `Display name "${suspiciousDisplayName}" has low similarity (${score}%) to "${targetName}".`;
  }

  return {
    dimension: {
      score,
      available: true,
      weight: DIMENSION_WEIGHTS.displayName,
      explanation,
      indicators: indicators.map((i) => i.title),
    },
    indicators,
  };
}

function scoreBioText(
  suspiciousBio: string | null,
  official: OfficialAccount,
): {
  dimension: DimensionBreakdown;
  indicators: ImpersonationIndicator[];
} {
  if (!suspiciousBio || !suspiciousBio.trim()) {
    return {
      dimension: {
        score: null,
        available: false,
        weight: DIMENSION_WEIGHTS.bio,
        explanation: 'No bio text was submitted for this suspicious profile.',
        indicators: [],
      },
      indicators: [],
    };
  }

  const offUrl = parseSafeUrl(official.profileUrl);
  const offDomainBase =
    offUrl && !KNOWN_SOCIAL_HOSTS.has(offUrl.host) ? offUrl.host : '';

  const referenceParts = [
    official.displayName ?? '',
    official.notes ?? '',
    official.handle.replace(/[_.-]/g, ' '),
    offDomainBase,
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  if (referenceParts.length === 0) {
    return {
      dimension: {
        score: null,
        available: false,
        weight: DIMENSION_WEIGHTS.bio,
        explanation:
          'No official account reference metadata available to compare bio text.',
        indicators: [],
      },
      indicators: [],
    };
  }

  const bioNorm = normalizePlainText(suspiciousBio);
  const bioTokens = tokenizeMeaningful(suspiciousBio);
  const refTokens = tokenizeMeaningful(referenceParts.join(' '));
  const sharedTokens = bioTokens.filter((token) => refTokens.includes(token));

  const containment =
    refTokens.length > 0 ? sharedTokens.length / refTokens.length : 0;
  const jaccard =
    bioTokens.length + refTokens.length - sharedTokens.length > 0
      ? sharedTokens.length /
        (bioTokens.length + refTokens.length - sharedTokens.length)
      : 0;

  const notesDice = official.notes
    ? diceSimilarity(bioNorm, normalizePlainText(official.notes))
    : 0;

  const handleBare = normalizeHandle(official.handle);
  const mentionsHandle =
    handleBare.length >= 3 &&
    suspiciousBio.toLowerCase().includes(handleBare);
  const mentionsDisplayName =
    Boolean(official.displayName) &&
    normalizePlainText(official.displayName as string).length >= 3 &&
    bioNorm.includes(normalizePlainText(official.displayName as string));
  const mentionsDomain =
    Boolean(offDomainBase) &&
    suspiciousBio.toLowerCase().includes(offDomainBase);

  const hasEntityReference =
    mentionsHandle || mentionsDisplayName || mentionsDomain;
  const hasAuthorityClaim =
    /(official|support|help\s?desk|customer\s?service|verified|backup\s?account|dm\s+us)/i.test(
      suspiciousBio,
    );

  let rawScore = Math.max(
    notesDice,
    containment * 0.7 + jaccard * 0.3,
    mentionsDisplayName ? 0.68 : 0,
    mentionsHandle ? 0.72 : 0,
    mentionsDomain ? 0.75 : 0,
  );

  if (hasEntityReference && hasAuthorityClaim) {
    rawScore = Math.max(rawScore, 0.82);
  }

  const score = Math.min(100, Math.max(0, Math.round(rawScore * 100)));
  const indicators: ImpersonationIndicator[] = [];
  const explanationParts: string[] = [];

  if (mentionsDisplayName || mentionsHandle || mentionsDomain) {
    const refs = [
      mentionsHandle ? `handle "${official.handle}"` : null,
      mentionsDisplayName ? `name "${official.displayName}"` : null,
      mentionsDomain ? `domain "${offDomainBase}"` : null,
    ].filter(Boolean);
    explanationParts.push(`Bio explicitly references ${refs.join(', ')}`);
    indicators.push({
      id: 'bio-entity-reference',
      category: 'BIO',
      level: hasAuthorityClaim ? 'HIGH' : 'MODERATE',
      title: 'Bio references declared identity details',
      explanation: `Submitted bio mentions ${refs.join(', ')}${hasAuthorityClaim ? ' alongside support/official claim phrasing' : ''}.`,
    });
  }

  if (sharedTokens.length > 0 && !mentionsDisplayName) {
    explanationParts.push(
      `Shares ${sharedTokens.length} meaningful term(s) with official profile metadata (${sharedTokens.slice(0, 6).join(', ')})`,
    );
    if (score >= 40 && indicators.length === 0) {
      indicators.push({
        id: 'bio-keyword-overlap',
        category: 'BIO',
        level: score >= 70 ? 'HIGH' : 'MODERATE',
        title: 'Bio terminology overlap',
        explanation: `Bio overlaps with official account description terms: ${sharedTokens.slice(0, 6).join(', ')}.`,
      });
    }
  }

  if (notesDice >= 0.65) {
    explanationParts.push(
      `High phrasing overlap (${Math.round(notesDice * 100)}%) with declared account notes`,
    );
  }

  const explanation =
    explanationParts.length > 0
      ? `${explanationParts.join('. ')}.`
      : `Low textual overlap (${score}%) between submitted bio and declared official metadata.`;

  return {
    dimension: {
      score,
      available: true,
      weight: DIMENSION_WEIGHTS.bio,
      explanation,
      indicators: indicators.map((item) => item.title),
    },
    indicators,
  };
}

function scoreProfileUrl(
  suspiciousProfile: SuspiciousProfileSnapshot,
  official: OfficialAccount,
): {
  dimension: DimensionBreakdown;
  indicators: ImpersonationIndicator[];
} {
  const susUrl = parseSafeUrl(suspiciousProfile.profileUrl);
  const offUrl = parseSafeUrl(official.profileUrl);

  if (!susUrl) {
    return {
      dimension: {
        score: null,
        available: false,
        weight: DIMENSION_WEIGHTS.profileUrl,
        explanation: 'No valid profile URL was submitted for comparison.',
        indicators: [],
      },
      indicators: [],
    };
  }

  const expectedHosts =
    EXPECTED_PLATFORM_HOSTS[suspiciousProfile.platform] ?? [];
  const matchesExpectedPlatformHost =
    expectedHosts.length === 0 ||
    expectedHosts.some(
      (expected) =>
        susUrl.host === expected || susUrl.host.endsWith(`.${expected}`),
    );

  const indicators: ImpersonationIndicator[] = [];
  const reasons: string[] = [];
  let urlScore = 0;

  if (!matchesExpectedPlatformHost) {
    reasons.push(
      `Submitted domain "${susUrl.host}" does not match standard ${suspiciousProfile.platform} host(s) (${expectedHosts.join(', ')})`,
    );
    urlScore = Math.max(urlScore, 55);
    indicators.push({
      id: 'url-unexpected-platform-domain',
      category: 'PROFILE_URL',
      level: 'MODERATE',
      title: 'Non-standard domain for selected platform',
      explanation: `Profile URL uses "${susUrl.host}" instead of ${expectedHosts.join(' / ')}, which may indicate a spoofed external landing page or lookalike domain.`,
    });
  }

  const offHandleNorm = normalizeHandle(official.handle);

  if (susUrl.slug && offHandleNorm) {
    const slugMetrics = computeHandleMetrics(susUrl.slug, offHandleNorm);

    if (slugMetrics.score >= 70) {
      urlScore = Math.max(urlScore, slugMetrics.score);
      reasons.push(
        `URL path slug "/${susUrl.slug}" closely resembles official handle "${offHandleNorm}"`,
      );
      indicators.push({
        id: 'url-path-handle-similarity',
        category: 'PROFILE_URL',
        level: 'HIGH',
        title: 'URL handle slug resembles official handle',
        explanation: `URL path segment "/${susUrl.slug}" on "${susUrl.host}" is ${slugMetrics.score}% similar to official handle "${offHandleNorm}".`,
      });
    }
  }

  if (offUrl) {
    const bothAreKnownSocial =
      KNOWN_SOCIAL_HOSTS.has(susUrl.host) && KNOWN_SOCIAL_HOSTS.has(offUrl.host);

    if (susUrl.host === offUrl.host && !bothAreKnownSocial) {
      urlScore = Math.max(urlScore, 85);
      reasons.push(`Shares exact custom domain "${susUrl.host}"`);
    } else if (!bothAreKnownSocial) {
      const hostSim = Math.max(
        normalizedLevenshtein(susUrl.host, offUrl.host),
        normalizedLevenshtein(
          toHomoglyphSkeleton(susUrl.host),
          toHomoglyphSkeleton(offUrl.host),
        ) * 0.96,
      );
      if (hostSim >= 0.7) {
        const domainScore = Math.round(hostSim * 100);
        urlScore = Math.max(urlScore, domainScore);
        reasons.push(
          `Domain "${susUrl.host}" shows ${domainScore}% lookalike similarity to official domain "${offUrl.host}"`,
        );
        indicators.push({
          id: 'url-lookalike-domain',
          category: 'PROFILE_URL',
          level: 'HIGH',
          title: 'Potential lookalike domain similarity',
          explanation: `Domain "${susUrl.host}" closely resembles official domain "${offUrl.host}" (${domainScore}% similarity).`,
        });
      }
    } else if (susUrl.host === offUrl.host) {
      reasons.push(`Hosted on the same platform domain "${susUrl.host}"`);
      urlScore = Math.max(urlScore, 35);
    }
  }

  const score = Math.min(100, Math.max(0, urlScore));
  const explanation =
    reasons.length > 0
      ? `${reasons.join('. ')}.`
      : `Compared URL "${suspiciousProfile.profileUrl}" against declared official URL${official.profileUrl ? ` "${official.profileUrl}"` : ''} with low structural overlap (${score}%).`;

  return {
    dimension: {
      score,
      available: true,
      weight: DIMENSION_WEIGHTS.profileUrl,
      explanation,
      indicators: indicators.map((item) => item.title),
    },
    indicators,
  };
}

function compareWithOfficialAccount(
  suspicious: SuspiciousProfileSnapshot,
  official: OfficialAccount,
): OfficialAccountComparison {
  const usernameRes = scoreUsername(suspicious.username, official.handle);
  const displayNameRes = scoreDisplayName(suspicious.displayName, official);
  const bioRes = scoreBioText(suspicious.bio, official);
  const profileUrlRes = scoreProfileUrl(suspicious, official);

  const allDimensions = [
    usernameRes.dimension,
    displayNameRes.dimension,
    bioRes.dimension,
    profileUrlRes.dimension,
  ];

  const availableDimensions = allDimensions.filter(
    (dim): dim is DimensionBreakdown & { score: number } =>
      dim.available && dim.score !== null,
  );

  const totalWeight = availableDimensions.reduce(
    (sum, dim) => sum + dim.weight,
    0,
  );
  const weightedSum = availableDimensions.reduce(
    (sum, dim) => sum + dim.score * dim.weight,
    0,
  );

  const overallScore =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const level = classifyLevel(overallScore);

  const indicators: ImpersonationIndicator[] = [
    ...usernameRes.indicators,
    ...displayNameRes.indicators,
    ...bioRes.indicators,
    ...profileUrlRes.indicators,
  ];

  if (suspicious.platform === official.platform && overallScore >= 40) {
    indicators.push({
      id: 'same-platform-context',
      category: 'PLATFORM',
      level: 'INFO',
      title: `Same platform (${official.platform})`,
      explanation: `Reported profile operates on ${official.platform}, the same platform as your declared account "${official.handle}".`,
    });
  }

  const explanationSummary =
    overallScore >= 70
      ? `High similarity indicator (${overallScore}/100) against your declared ${official.platform} account "${official.handle}" across ${availableDimensions.length} evaluated signal(s). Manual review recommended.`
      : overallScore >= 40
        ? `Moderate similarity indicator (${overallScore}/100) against "${official.handle}" across ${availableDimensions.length} evaluated signal(s).`
        : `Low similarity indicator (${overallScore}/100) against "${official.handle}" across ${availableDimensions.length} evaluated signal(s).`;

  return {
    officialAccountId: official.id,
    platform: official.platform,
    username: official.handle,
    displayName: official.displayName,
    profileUrl: official.profileUrl,
    isPrimary: official.isPrimary,
    overallScore,
    level,
    dimensions: {
      username: usernameRes.dimension,
      displayName: displayNameRes.dimension,
      bio: bioRes.dimension,
      profileUrl: profileUrlRes.dimension,
    },
    indicators,
    explanationSummary,
  };
}

export function analyzeSuspiciousProfileAgainstOfficialAccounts(
  suspicious: SuspiciousProfileSnapshot,
  officialAccounts: OfficialAccount[],
): SimilarityAnalysisResultPayload {
  if (officialAccounts.length === 0) {
    const noBaselineIndicator: ImpersonationIndicator = {
      id: 'no-official-baseline',
      category: 'BASELINE',
      level: 'INFO',
      title: 'No official accounts registered for comparison',
      explanation:
        'Register at least one user-declared official account under Identity Protection, then re-run similarity analysis.',
    };

    return {
      overallScore: 0,
      level: 'NO_BASELINE',
      disclaimer: SIMILARITY_DISCLAIMER,
      evaluatedAccountCount: 0,
      matchedOfficialAccountId: null,
      summary:
        'Profile stored for review. No user-declared official accounts were available to compute similarity indicators.',
      indicators: [noBaselineIndicator],
      bestMatch: null,
      comparisons: [],
    };
  }

  const comparisons = officialAccounts
    .map((official) => compareWithOfficialAccount(suspicious, official))
    .sort((a, b) => {
      if (b.overallScore !== a.overallScore) {
        return b.overallScore - a.overallScore;
      }
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return a.username.localeCompare(b.username);
    });

  const bestMatch = comparisons[0];

  return {
    overallScore: bestMatch.overallScore,
    level: bestMatch.level,
    disclaimer: SIMILARITY_DISCLAIMER,
    evaluatedAccountCount: comparisons.length,
    matchedOfficialAccountId: bestMatch.officialAccountId,
    summary: bestMatch.explanationSummary,
    indicators: bestMatch.indicators,
    bestMatch,
    comparisons,
  };
}
