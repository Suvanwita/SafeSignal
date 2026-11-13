import { SafetyRuleEngine } from './safety-rule-engine';
import { SAFETY_INTELLIGENCE_DISCLAIMER } from './safety-rule-engine.types';

describe('SafetyRuleEngine', () => {
  describe('Abusive Language Analysis', () => {
    it('detects severe slurs with HIGH risk and abusive category', () => {
      const text = 'You are a filthy subhuman and deserve nothing.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('ABUSIVE_LANGUAGE');
      expect(result.indicators.some((i) => i.id === 'ABUSE_SEVERE_SLUR_HATE')).toBe(true);
      expect(result.explanations.length).toBeGreaterThan(0);
      expect(result.disclaimer).toBe(SAFETY_INTELLIGENCE_DISCLAIMER);
    });

    it('detects hostile profanity and vulgarity with MEDIUM risk', () => {
      const text = 'Shut the fuck up you worthless scum and get out of here!';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.category).toBe('ABUSIVE_LANGUAGE');
      expect(
        result.indicators.some((i) => i.id === 'ABUSE_HOSTILE_PROFANITY_INSULT'),
      ).toBe(true);
      expect(result.suggestedActions.length).toBeGreaterThan(0);
    });

    it('detects mild demeaning language with LOW risk when isolated', () => {
      const text = 'That was really stupid and you are a clown.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('LOW');
      expect(result.category).toBe('ABUSIVE_LANGUAGE');
      expect(result.indicators.some((i) => i.id === 'ABUSE_MILD_DEROGATORY')).toBe(true);
    });

    it('handles leetspeak and character repetition in abuse words', () => {
      const text = 'You b!tch shut up right now';
      const result = SafetyRuleEngine.analyze(text);

      expect(
        result.indicators.some((i) => i.id === 'ABUSE_HOSTILE_PROFANITY_INSULT'),
      ).toBe(true);
    });

    it('avoids false positives for substring matches like skill or class', () => {
      const text = 'He showed exceptional skill in our coding class with great documentation.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('LOW');
      expect(result.category).toBe('BENIGN');
      expect(result.indicators.length).toBe(0);
    });
  });

  describe('Threat Keywords Analysis', () => {
    it('detects explicit violence threat with HIGH risk', () => {
      const text = 'I will hunt you down and kill you if you speak again.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('THREATS');
      const ind = result.indicators.find((i) => i.id === 'THREAT_VIOLENCE_EXPLICIT');
      expect(ind).toBeDefined();
      expect(ind?.matchedTerms).toEqual(expect.arrayContaining(['kill you', 'hunt you down']));
      expect(result.suggestedActions.some((a) => a.includes('Emergency Services') || a.includes('112 / 911'))).toBe(true);
    });

    it('detects extortion and blackmail statements with HIGH risk', () => {
      const text = 'Pay me or I will leak your nudes to your boss and ruin your life!';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('THREATS');
      expect(
        result.indicators.some((i) => i.id === 'THREAT_EXTORTION_BLACKMAIL'),
      ).toBe(true);
    });

    it('detects physical surveillance and stalking indicators with HIGH risk', () => {
      const text = 'I know where you live. I am outside your house waiting right now.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('THREATS');
      expect(
        result.indicators.some((i) => i.id === 'THREAT_STALKING_SURVEILLANCE'),
      ).toBe(true);
    });

    it('detects doxxing intent threats with HIGH risk', () => {
      const text = 'Keep talking and I will post your home address and drop your address for everyone.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('THREATS');
      expect(
        result.indicators.some((i) => i.id === 'THREAT_DOXXING_INTENT'),
      ).toBe(true);
    });

    it('detects self-harm incitement keywords with HIGH risk', () => {
      const text = 'Nobody cares about you, go kill yourself and drink bleach.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('THREATS');
      expect(
        result.indicators.some((i) => i.id === 'THREAT_SELF_HARM_INCITEMENT'),
      ).toBe(true);
    });
  });

  describe('Harassment Indicators Analysis', () => {
    it('detects persistent contact demands and boundary violations', () => {
      const text =
        'Why are you running? Answer me right now! Stop ignoring me! You cannot hide!';
      const result = SafetyRuleEngine.analyze(text);

      expect(['MEDIUM', 'HIGH']).toContain(result.riskLevel);
      expect(
        result.indicators.some((i) => i.id === 'HARASSMENT_PERSISTENT_PRESSURE'),
      ).toBe(true);
      expect(result.suggestedActions.some((a) => a.includes('Mute or block'))).toBe(true);
    });

    it('detects intimidation and isolation phrasing', () => {
      const text = 'No one will help you. Watch your back because you will regret this.';
      const result = SafetyRuleEngine.analyze(text);

      expect(
        result.indicators.some((i) => i.id === 'HARASSMENT_INTIMIDATION_ISOLATION'),
      ).toBe(true);
    });

    it('detects coordinated brigading and raid calls', () => {
      const text = 'Everyone report this profile now! Raid this account and flood comments!';
      const result = SafetyRuleEngine.analyze(text);

      expect(
        result.indicators.some((i) => i.id === 'HARASSMENT_COORDINATED_BRIGADING'),
      ).toBe(true);
    });
  });

  describe('Sensitive Personal Information (SPI) Analysis', () => {
    it('detects Indian phone numbers and personal email addresses', () => {
      const text = 'Contact me at victim.support@example.org or call +91 9876543210 immediately.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.indicators.some((i) => i.id === 'SPI_EMAIL_ADDRESS')).toBe(true);
      expect(result.indicators.some((i) => i.id === 'SPI_PHONE_INDIAN')).toBe(true);
      expect(result.suggestedActions.some((a) => a.includes('Privacy') || a.includes('redact'))).toBe(true);
    });

    it('detects Aadhaar and PAN card numbers with HIGH severity indicators', () => {
      const text = 'Your Aadhaar is 2345 6789 0123 and PAN is ABCDE1234F.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.indicators.some((i) => i.id === 'SPI_GOVT_AADHAAR')).toBe(true);
      expect(result.indicators.some((i) => i.id === 'SPI_GOVT_PAN')).toBe(true);
    });

    it('detects physical address patterns', () => {
      const text = 'Flat 402, Lotus Residency, 5th Cross Road, Indiranagar, Bangalore 560038';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.indicators.some((i) => i.id === 'SPI_PHYSICAL_ADDRESS')).toBe(true);
    });
  });

  describe('Repeated Suspicious Activity Analysis', () => {
    it('detects duplicate message statements within text', () => {
      const text =
        'I am not going away ever. I am not going away ever. I am not going away ever.';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.metrics.repeatedActivity.duplicateSentences.length).toBeGreaterThan(0);
      expect(
        result.indicators.some((i) => i.id === 'ACTIVITY_REPEATED_SUSPICIOUS'),
      ).toBe(true);
    });

    it('detects excessive uppercase shouting aggression', () => {
      const text = 'WHY ARE YOU NOT ANSWERING ME YOU WILL PAY FOR THIS RIGHT NOW YOU COWARD';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.metrics.repeatedActivity.highCapsRatio).toBe(true);
      expect(result.metrics.repeatedActivity.capsRatio).toBeGreaterThan(0.65);
    });

    it('incorporates incident context metrics for rapid escalation', () => {
      const text = 'Check your messages.';
      const result = SafetyRuleEngine.analyze(text, {
        incidentContext: {
          reportCount: 4,
          profileCount: 2,
          highSeverityReportsCount: 2,
        },
      });

      expect(result.metrics.repeatedActivity.rapidTimelineEscalation).toBe(true);
      expect(
        result.indicators.some((i) => i.id === 'ACTIVITY_REPEATED_SUSPICIOUS'),
      ).toBe(true);
    });
  });

  describe('Multi-Vector & Combined Scenarios', () => {
    it('classifies multi-vector attacks with combined threats, abuse, and SPI', () => {
      const text =
        'Listen you bitch, I know where you live at Flat 101, MG Road, 560001. Pay me or I will slit your throat and leak your nudes to everyone!';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('HIGH');
      expect(result.category).toBe('MULTI_VECTOR');
      expect(result.indicators.length).toBeGreaterThanOrEqual(3);
      expect(result.explanations.length).toBeGreaterThanOrEqual(3);
      expect(result.suggestedActions.length).toBeGreaterThanOrEqual(3);
    });

    it('evaluates custom user-configured keywords', () => {
      const text = 'We will zaphod your mainframe soon.';
      const result = SafetyRuleEngine.analyze(text, {
        customThreatKeywords: ['zaphod'],
      });

      expect(result.riskLevel).toBe('HIGH');
      expect(result.indicators.some((i) => i.id === 'THREAT_CUSTOM_KEYWORDS')).toBe(true);
      expect(result.indicators[0].matchedTerms).toContain('zaphod');
    });

    it('returns benign classification for harmless everyday messages', () => {
      const text =
        'Hi, could you please send over the meeting agenda for tomorrow? Thanks so much!';
      const result = SafetyRuleEngine.analyze(text);

      expect(result.riskLevel).toBe('LOW');
      expect(result.category).toBe('BENIGN');
      expect(result.overallScore).toBe(0);
      expect(result.indicators.length).toBe(0);
      expect(result.disclaimer).toBe(SAFETY_INTELLIGENCE_DISCLAIMER);
    });
  });
});
