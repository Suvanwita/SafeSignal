import {
  ABUSIVE_LANGUAGE_RULES,
  HARASSMENT_RULES,
  SAFETY_ACTIONS_MAP,
  SENSITIVE_INFO_PATTERNS,
  THREAT_RULES,
  type KeywordRule,
} from './safety-dictionaries';
import {
  SAFETY_INTELLIGENCE_DISCLAIMER,
  type IndicatorCategory,
  type RepeatedActivityMetrics,
  type SafetyAnalysisResult,
  type SafetyCategory,
  type SafetyEngineOptions,
  type SafetyIndicator,
  type SafetyRiskLevel,
} from './safety-rule-engine.types';

function normalizeForSearch(text: string): string {
  let normalized = text.toLowerCase();

  // Common leetspeak & evasion substitutions
  normalized = normalized
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/\+/g, 't');

  // Collapse repeated characters beyond 2 (e.g., "kiiiiillll" -> "kill")
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

function extractSnippet(
  source: string,
  matchedTerm: string,
  maxLength = 120,
): string {
  const lowerSource = source.toLowerCase();
  const lowerTerm = matchedTerm.toLowerCase();
  const idx = lowerSource.indexOf(lowerTerm);

  if (idx === -1) {
    return source.slice(0, maxLength);
  }

  const start = Math.max(0, idx - 30);
  const end = Math.min(source.length, idx + matchedTerm.length + 50);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';

  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}

function evaluateKeywordRules(
  text: string,
  normalizedText: string,
  rules: KeywordRule[],
): SafetyIndicator[] {
  const indicators: SafetyIndicator[] = [];

  for (const rule of rules) {
    const matchedPhrases: string[] = [];
    let occurrences = 0;
    let firstSnippet: string | undefined;

    for (const phrase of rule.phrases) {
      const normPhrase = phrase.toLowerCase().trim();
      if (!normPhrase) continue;

      let found = false;
      let count = 0;

      if (normPhrase.includes(' ')) {
        // Multi-word phrase search in normalized text
        let pos = 0;
        while ((pos = normalizedText.indexOf(normPhrase, pos)) !== -1) {
          found = true;
          count++;
          pos += normPhrase.length;
        }
      } else {
        // Single-word regex with word boundary check
        const escaped = normPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        const matches = normalizedText.match(regex);
        if (matches && matches.length > 0) {
          found = true;
          count = matches.length;
        }
      }

      if (found) {
        matchedPhrases.push(phrase);
        occurrences += count;
        if (!firstSnippet) {
          firstSnippet = extractSnippet(text, phrase);
        }
      }
    }

    if (matchedPhrases.length > 0) {
      indicators.push({
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        explanation: rule.explanation,
        matchedTerms: Array.from(new Set(matchedPhrases)),
        occurrences,
        snippet: firstSnippet,
      });
    }
  }

  return indicators;
}

function evaluateSensitiveInfo(text: string): SafetyIndicator[] {
  const indicators: SafetyIndicator[] = [];

  for (const pattern of SENSITIVE_INFO_PATTERNS) {
    // Reset regex state
    pattern.regex.lastIndex = 0;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const matchedStr = match[0].trim();
      if (matchedStr.length > 0 && !matches.includes(matchedStr)) {
        matches.push(matchedStr);
      }
    }

    if (matches.length > 0) {
      indicators.push({
        id: pattern.id,
        category: pattern.category,
        severity: pattern.severity,
        title: pattern.title,
        explanation: pattern.explanation,
        matchedTerms: matches.map((m) =>
          m.length > 6 ? `${m.slice(0, 3)}***${m.slice(-3)}` : '***',
        ),
        occurrences: matches.length,
        snippet: extractSnippet(text, matches[0]),
      });
    }
  }

  return indicators;
}

function analyzeRepeatedActivity(
  text: string,
  options?: SafetyEngineOptions,
): {
  metrics: RepeatedActivityMetrics;
  indicator: SafetyIndicator | null;
} {
  // Sentence duplication check
  const rawSentences = text
    .split(/[.\n!?;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 10);

  const sentenceCounts = new Map<string, number>();
  for (const s of rawSentences) {
    sentenceCounts.set(s, (sentenceCounts.get(s) ?? 0) + 1);
  }

  const duplicateSentences: string[] = [];
  let totalRepeatedCount = 0;
  for (const [sent, count] of sentenceCounts.entries()) {
    if (count >= 2) {
      duplicateSentences.push(sent);
      totalRepeatedCount += count;
    }
  }

  // Capitalization ratio
  const alphaChars = text.replace(/[^a-zA-Z]/g, '');
  const upperChars = text.replace(/[^A-Z]/g, '');
  const capsRatio =
    alphaChars.length >= 20 ? upperChars.length / alphaChars.length : 0;
  const highCapsRatio = capsRatio > 0.65;

  // Excessive aggressive punctuation (e.g., "!!!!", "????", "!?!?")
  const punctuationAggression = /(?:!{3,}|\?{3,}|[!\\?]{3,})/.test(text);

  // Incident context metrics
  const incidentContext = options?.incidentContext;
  const incidentReportCount = incidentContext?.reportCount;
  const incidentProfileCount = incidentContext?.profileCount;
  const rapidTimelineEscalation = Boolean(
    (incidentReportCount && incidentReportCount >= 2) ||
      (incidentProfileCount && incidentProfileCount >= 2) ||
      (incidentContext?.highSeverityReportsCount &&
        incidentContext.highSeverityReportsCount >= 1),
  );

  const metrics: RepeatedActivityMetrics = {
    repeatedPhrasesCount: totalRepeatedCount,
    duplicateSentences: duplicateSentences.slice(0, 5),
    highCapsRatio,
    capsRatio: Number(capsRatio.toFixed(2)),
    punctuationAggression,
    incidentReportCount,
    incidentProfileCount,
    rapidTimelineEscalation,
  };

  let indicator: SafetyIndicator | null = null;
  const reasons: string[] = [];

  if (duplicateSentences.length > 0) {
    reasons.push(
      `Detected ${duplicateSentences.length} repetitive message statement(s) repeated ${totalRepeatedCount} times.`,
    );
  }
  if (highCapsRatio) {
    reasons.push(
      `High uppercase character ratio (${Math.round(capsRatio * 100)}%) indicating aggressive or shouting tone.`,
    );
  }
  if (punctuationAggression) {
    reasons.push(
      'Repeated hostile punctuation patterns (multiple consecutive exclamation/question marks).',
    );
  }
  if (rapidTimelineEscalation) {
    reasons.push(
      `Incident history shows multiple persistent reports (${incidentReportCount ?? 0}) or associated suspicious profiles (${incidentProfileCount ?? 0}).`,
    );
  }

  if (reasons.length > 0) {
    const isHigh =
      rapidTimelineEscalation &&
      (duplicateSentences.length >= 2 || highCapsRatio);
    indicator = {
      id: 'ACTIVITY_REPEATED_SUSPICIOUS',
      category: 'REPEATED_ACTIVITY',
      severity: isHigh ? 'HIGH' : 'MEDIUM',
      title: 'Repeated Suspicious or Aggressive Activity Pattern',
      explanation: reasons.join(' '),
      matchedTerms: duplicateSentences.slice(0, 3),
      occurrences: Math.max(
        totalRepeatedCount,
        duplicateSentences.length,
        incidentReportCount ?? 1,
      ),
      snippet: duplicateSentences[0]
        ? extractSnippet(text, duplicateSentences[0])
        : undefined,
    };
  }

  return { metrics, indicator };
}

export class SafetyRuleEngine {
  static analyze(
    rawText: string,
    options?: SafetyEngineOptions,
  ): SafetyAnalysisResult {
    const text = rawText || '';
    const normalizedText = normalizeForSearch(text);
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    // Combine default rules with any custom keywords
    const threatRules = [...THREAT_RULES];
    if (options?.customThreatKeywords && options.customThreatKeywords.length > 0) {
      threatRules.push({
        id: 'THREAT_CUSTOM_KEYWORDS',
        category: 'THREATS',
        severity: 'HIGH',
        title: 'Custom User-Configured Threat Indicator',
        explanation: 'Triggered by custom threat keywords provided in analysis settings.',
        phrases: options.customThreatKeywords,
      });
    }

    const abuseRules = [...ABUSIVE_LANGUAGE_RULES];
    if (options?.customAbuseKeywords && options.customAbuseKeywords.length > 0) {
      abuseRules.push({
        id: 'ABUSE_CUSTOM_KEYWORDS',
        category: 'ABUSIVE_LANGUAGE',
        severity: 'MEDIUM',
        title: 'Custom User-Configured Abusive Indicator',
        explanation: 'Triggered by custom abusive language terms provided in analysis settings.',
        phrases: options.customAbuseKeywords,
      });
    }

    const harassmentRules = [...HARASSMENT_RULES];
    if (
      options?.customHarassmentKeywords &&
      options.customHarassmentKeywords.length > 0
    ) {
      harassmentRules.push({
        id: 'HARASSMENT_CUSTOM_KEYWORDS',
        category: 'HARASSMENT',
        severity: 'MEDIUM',
        title: 'Custom User-Configured Harassment Indicator',
        explanation: 'Triggered by custom harassment terms provided in analysis settings.',
        phrases: options.customHarassmentKeywords,
      });
    }

    // 1. Evaluate categories
    const indicators: SafetyIndicator[] = [];

    // Threats
    indicators.push(
      ...evaluateKeywordRules(text, normalizedText, threatRules),
    );

    // Abusive language
    indicators.push(...evaluateKeywordRules(text, normalizedText, abuseRules));

    // Harassment
    indicators.push(
      ...evaluateKeywordRules(text, normalizedText, harassmentRules),
    );

    // Sensitive Personal Information
    indicators.push(...evaluateSensitiveInfo(text));

    // Custom Sensitive Regexes
    if (options?.customSensitiveRegexes) {
      for (const customRegex of options.customSensitiveRegexes) {
        try {
          const rx = new RegExp(customRegex.pattern, 'gi');
          const matches = text.match(rx);
          if (matches && matches.length > 0) {
            indicators.push({
              id: `SPI_CUSTOM_${customRegex.name.toUpperCase().replace(/\s+/g, '_')}`,
              category: 'SENSITIVE_INFO',
              severity: customRegex.severity ?? 'MEDIUM',
              title: `Custom Sensitive Information: ${customRegex.name}`,
              explanation: `Matched custom sensitive pattern for "${customRegex.name}".`,
              matchedTerms: matches.slice(0, 3).map((m) => '***'),
              occurrences: matches.length,
              snippet: extractSnippet(text, matches[0]),
            });
          }
        } catch {
          // ignore invalid custom regex pattern
        }
      }
    }

    // Repeated Activity
    const { metrics, indicator: repeatedActivityIndicator } =
      analyzeRepeatedActivity(text, options);
    if (repeatedActivityIndicator) {
      indicators.push(repeatedActivityIndicator);
    }

    // 2. Compute Scoring & Risk Level
    let score = 0;
    let hasHighSeverity = false;
    let mediumCount = 0;
    let lowCount = 0;

    for (const ind of indicators) {
      if (ind.severity === 'HIGH') {
        hasHighSeverity = true;
        score += 35 * Math.min(ind.occurrences, 3);
      } else if (ind.severity === 'MEDIUM') {
        mediumCount++;
        score += 15 * Math.min(ind.occurrences, 2);
      } else if (ind.severity === 'LOW') {
        lowCount++;
        score += 5 * Math.min(ind.occurrences, 2);
      }
    }

    if (metrics.rapidTimelineEscalation) {
      score += 15;
    }

    const overallScore = Math.min(100, Math.max(0, score));

    // Risk level: LOW, MEDIUM, or HIGH
    let riskLevel: SafetyRiskLevel = 'LOW';

    if (hasHighSeverity || overallScore >= 60 || mediumCount >= 3) {
      riskLevel = 'HIGH';
    } else if (overallScore >= 20 || mediumCount >= 1) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    // 3. Category & Secondary Categories
    const categoriesFound = Array.from(
      new Set(indicators.map((ind) => ind.category as SafetyCategory)),
    );

    let primaryCategory: SafetyCategory = 'BENIGN';
    if (categoriesFound.includes('THREATS')) {
      primaryCategory = 'THREATS';
    } else if (categoriesFound.includes('HARASSMENT')) {
      primaryCategory = 'HARASSMENT';
    } else if (categoriesFound.includes('ABUSIVE_LANGUAGE')) {
      primaryCategory = 'ABUSIVE_LANGUAGE';
    } else if (categoriesFound.includes('SENSITIVE_INFO')) {
      primaryCategory = 'SENSITIVE_INFO';
    } else if (categoriesFound.includes('REPEATED_ACTIVITY')) {
      primaryCategory = 'REPEATED_ACTIVITY';
    } else if (categoriesFound.length > 0) {
      primaryCategory = categoriesFound[0];
    }

    if (categoriesFound.length > 2 && riskLevel === 'HIGH') {
      primaryCategory = 'MULTI_VECTOR';
    }

    const secondaryCategories = categoriesFound.filter(
      (c) => c !== primaryCategory,
    );

    // 4. Explanations for each indicator
    const explanations = indicators.map(
      (ind) => `[${ind.category} / ${ind.severity}] ${ind.title}: ${ind.explanation}`,
    );

    if (explanations.length === 0) {
      explanations.push(
        'No overt threats, abusive language, harassment cues, sensitive personal info, or repeated hostile patterns were detected based on current rule sets.',
      );
    }

    // 5. Suggested Safety Actions
    const suggestedActions = [...(SAFETY_ACTIONS_MAP[riskLevel] || SAFETY_ACTIONS_MAP.LOW)];

    // Category-specific targeted actions
    if (categoriesFound.includes('SENSITIVE_INFO')) {
      const spiAction =
        'Privacy Scrubbing: Personal identifiers or contact details were identified. Apply SafeSignal redaction before sharing incident records with third parties.';
      if (!suggestedActions.includes(spiAction)) {
        suggestedActions.push(spiAction);
      }
    }
    if (categoriesFound.includes('THREATS')) {
      const threatAction =
        'Physical Safety Protocol: If threats reference your home, family, or workplace, inform trusted security contacts or local authorities immediately.';
      if (!suggestedActions.includes(threatAction)) {
        suggestedActions.splice(1, 0, threatAction);
      }
    }

    // 6. Summary formulation
    let summary = '';
    if (riskLevel === 'HIGH') {
      summary = `High safety risk identified (${primaryCategory}). Detected ${indicators.length} indicator(s) including high-severity patterns. Immediate protective measures and case documentation recommended.`;
    } else if (riskLevel === 'MEDIUM') {
      summary = `Moderate safety risk identified (${primaryCategory}). Detected ${indicators.length} indicator(s). Review account boundaries, mute/block sender, and monitor incident progression.`;
    } else {
      summary =
        indicators.length > 0
          ? `Low safety risk identified (${primaryCategory}). Isolated low-intensity terms detected. Ongoing passive monitoring recommended.`
          : 'Low safety risk. No threat, harassment, or privacy violation indicators detected in submitted content.';
    }

    return {
      category: primaryCategory,
      secondaryCategories,
      riskLevel,
      overallScore,
      summary,
      indicators,
      explanations,
      suggestedActions,
      disclaimer: SAFETY_INTELLIGENCE_DISCLAIMER,
      metrics: {
        textLength: text.length,
        wordCount,
        repeatedActivity: metrics,
      },
      analyzedAt: new Date().toISOString(),
    };
  }
}
