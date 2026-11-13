import type {
  IndicatorCategory,
  SafetyCategory,
  SafetyRiskLevel,
} from './safety-rule-engine.types';

export interface KeywordRule {
  id: string;
  category: IndicatorCategory;
  severity: SafetyRiskLevel;
  title: string;
  explanation: string;
  phrases: string[];
  exactMatch?: boolean;
}

export const THREAT_RULES: KeywordRule[] = [
  {
    id: 'THREAT_VIOLENCE_EXPLICIT',
    category: 'THREATS',
    severity: 'HIGH',
    title: 'Explicit Threat of Violence or Physical Harm',
    explanation:
      'Contains statements expressing an intention to commit physical violence, bodily harm, or severe assault.',
    phrases: [
      'kill you',
      'kill u',
      'slit your throat',
      'break your neck',
      'beat you to death',
      'shoot you',
      'put a bullet',
      'die in pain',
      'murder you',
      'stab you',
      'strangle you',
      'hunt you down',
      'execute you',
      'burn your house',
      'burn you alive',
      'break your legs',
      'put you in the hospital',
      'gonna hurt you',
      'end you',
      'you are dead',
      'you will bleed',
    ],
  },
  {
    id: 'THREAT_EXTORTION_BLACKMAIL',
    category: 'THREATS',
    severity: 'HIGH',
    title: 'Blackmail, Extortion, or Coercion',
    explanation:
      'Contains coercive statements demanding compliance, money, or actions under threat of exposing private content, reputation damage, or offline retaliation.',
    phrases: [
      'leak your nudes',
      'leak your photos',
      'leak your private',
      'expose you',
      'expose your',
      'pay me or',
      'pay or else',
      'send money or',
      'give me money or',
      'send photos or',
      'ruin your life',
      'ruin your career',
      'send to your boss',
      'send to your employer',
      'send to your parents',
      'send to your family',
      'send to your friends',
      'tell everyone your secret',
      'post your intimate',
      'blackmail',
      'extort',
    ],
  },
  {
    id: 'THREAT_STALKING_SURVEILLANCE',
    category: 'THREATS',
    severity: 'HIGH',
    title: 'Physical Stalking, Surveillance, or Locational Presence',
    explanation:
      'Contains claims or implications of tracking the victim, being physically present near their location, or monitoring their real-world movements.',
    phrases: [
      'know where you live',
      'outside your house',
      'outside your window',
      'outside your building',
      'outside your door',
      'followed you home',
      'followed you to',
      'standing in front of',
      'waiting outside',
      'watching you sleep',
      'watching your house',
      'tracking your car',
      'tracking your phone',
      'found your home',
      'saw you today',
      'saw you at',
      'know your routine',
      'see you through the window',
      'standing outside right now',
    ],
  },
  {
    id: 'THREAT_DOXXING_INTENT',
    category: 'THREATS',
    severity: 'HIGH',
    title: 'Doxxing or Locational Exposure Threat',
    explanation:
      'Contains explicit intent to publish private residential addresses, phone numbers, or confidential locating information without consent.',
    phrases: [
      'dox you',
      'doxx you',
      'post your home address',
      'post your address',
      'leak your address',
      'leak your phone',
      'drop your address',
      'share your details',
      'publish your location',
      'leak your ip',
      'post your real name and address',
      'share your workplace',
      'post where you work',
    ],
  },
  {
    id: 'THREAT_SELF_HARM_INCITEMENT',
    category: 'THREATS',
    severity: 'HIGH',
    title: 'Incitement to Self-Harm or Suicide',
    explanation:
      'Contains statements directly encouraging or commanding self-harm, suicide, or self-inflicted violence.',
    phrases: [
      'kill yourself',
      'go kill yourself',
      'kys',
      'hang yourself',
      'end your life',
      'drink bleach',
      'slit your wrists',
      'take your own life',
      'go die',
      'jump off a bridge',
      'nobody wants you alive',
    ],
  },
];

export const ABUSIVE_LANGUAGE_RULES: KeywordRule[] = [
  {
    id: 'ABUSE_SEVERE_SLUR_HATE',
    category: 'ABUSIVE_LANGUAGE',
    severity: 'HIGH',
    title: 'Severe Slurs or Identity-Targeted Hate Speech',
    explanation:
      'Contains severely derogatory terms, slurs, or dehumanizing language targeted at marginalized groups, religion, gender, sexual orientation, or disability.',
    phrases: [
      'nigger',
      'nigga',
      'faggot',
      'chink',
      'kike',
      'spic',
      'tranny',
      'shemale',
      'retard',
      'subhuman',
      'filthy dog',
      'vermin',
      'aberration',
    ],
  },
  {
    id: 'ABUSE_HOSTILE_PROFANITY_INSULT',
    category: 'ABUSIVE_LANGUAGE',
    severity: 'MEDIUM',
    title: 'Hostile Profanity and Direct Degradation',
    explanation:
      'Contains targeted profane hostility, sexualized insults, or aggressive vulgarity intended to humiliate or intimidate.',
    phrases: [
      'motherfucker',
      'mother fucker',
      'bitch',
      'whore',
      'slut',
      'cunt',
      'piece of shit',
      'worthless scum',
      'filthy trash',
      'ugly bitch',
      'fat bitch',
      'dickhead',
      'asshole',
      'bastard',
      'scumbag',
      'eat shit',
      'rot in hell',
      'burn in hell',
      'go to hell',
      'shut the fuck up',
      'fuck off',
      'fucking loser',
    ],
  },
  {
    id: 'ABUSE_MILD_DEROGATORY',
    category: 'ABUSIVE_LANGUAGE',
    severity: 'LOW',
    title: 'Mild Derogatory or Demeaning Language',
    explanation:
      'Contains low-intensity demeaning terms, uncivil insults, or mocking language.',
    phrases: [
      'idiot',
      'stupid',
      'moron',
      'pathetic loser',
      'dumbass',
      'clown',
      'loser',
      'useless',
      'worthless',
      'garbage human',
      'shut up',
    ],
  },
];

export const HARASSMENT_RULES: KeywordRule[] = [
  {
    id: 'HARASSMENT_PERSISTENT_PRESSURE',
    category: 'HARASSMENT',
    severity: 'MEDIUM',
    title: 'Persistent Contact Demands and Boundary Violation',
    explanation:
      'Contains aggressive demands compelling immediate interaction, attempting to bypass blocking controls, or refusing to accept communication boundaries.',
    phrases: [
      'answer me',
      'answer right now',
      'answer my calls',
      'pick up the phone',
      'pick up right now',
      'stop ignoring me',
      'why are you running',
      'you cannot hide',
      'you cant hide',
      'i won’t stop calling',
      'i wont stop calling',
      'i will keep messaging',
      'reply immediately',
      'check your dms',
      'unblock me',
      'unblock me or',
      'made another account',
      'made a new profile',
      'you cannot block me',
      'you cant block me',
      'wont leave you alone',
      'won’t leave you alone',
      'never leave you alone',
    ],
  },
  {
    id: 'HARASSMENT_INTIMIDATION_ISOLATION',
    category: 'HARASSMENT',
    severity: 'MEDIUM',
    title: 'Psychological Intimidation and Isolation',
    explanation:
      'Contains intimidation tactics intended to instill fear, create a sense of helplessness, or claim that the victim has no support.',
    phrases: [
      'no one will help you',
      'nobody will help you',
      'nobody believes you',
      'no one believes you',
      'you have nowhere to go',
      'nowhere to hide',
      'watch your back',
      'fear me',
      'you will regret this',
      'make you pay',
      'you asked for this',
      'you brought this on yourself',
      'you are not safe',
      'you will never be safe',
    ],
  },
  {
    id: 'HARASSMENT_COORDINATED_BRIGADING',
    category: 'HARASSMENT',
    severity: 'MEDIUM',
    title: 'Coordinated Brigading or Mob Harassment Call',
    explanation:
      'Contains calls to organize group harassment, mass spamming, raiding, or collective targeting against an individual.',
    phrases: [
      'everyone report',
      'mass report',
      'raid this account',
      'raid this profile',
      'mass spam',
      'flood comments',
      'spam their dms',
      'target this person',
      'target this account',
      'dislike bomb',
      'take down their profile',
      'brigade',
    ],
  },
];

export interface SensitivePatternRule {
  id: string;
  category: 'SENSITIVE_INFO';
  severity: SafetyRiskLevel;
  title: string;
  explanation: string;
  regex: RegExp;
  maskType: string;
}

export const SENSITIVE_INFO_PATTERNS: SensitivePatternRule[] = [
  {
    id: 'SPI_PHONE_INDIAN',
    category: 'SENSITIVE_INFO',
    severity: 'MEDIUM',
    title: 'Indian Mobile Phone Number Exposed',
    explanation:
      'Contains a 10-digit Indian mobile telephone number format. Unconsented exposure poses doxxing and unwanted contact risks.',
    regex: /(?:(?:\+91|91|0)[-\s]?)?[6-9]\d{4}[-\s]?\d{5}\b/g,
    maskType: 'PHONE_NUMBER',
  },
  {
    id: 'SPI_PHONE_INTERNATIONAL',
    category: 'SENSITIVE_INFO',
    severity: 'MEDIUM',
    title: 'International Telephone Number Exposed',
    explanation:
      'Contains an international phone number format. Direct exposure creates risk of unsolicited calls or offline harassment.',
    regex: /\+(?:[1-9]\d{0,2})[-\s]?(?:\(?\d{1,4}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}\b/g,
    maskType: 'PHONE_NUMBER',
  },
  {
    id: 'SPI_EMAIL_ADDRESS',
    category: 'SENSITIVE_INFO',
    severity: 'MEDIUM',
    title: 'Personal Email Address Exposed',
    explanation:
      'Contains a valid email address structure. Can be exploited for spam, credential stuffing, or phishing attacks.',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    maskType: 'EMAIL_ADDRESS',
  },
  {
    id: 'SPI_GOVT_AADHAAR',
    category: 'SENSITIVE_INFO',
    severity: 'HIGH',
    title: 'Government Identity (Aadhaar Number) Exposed',
    explanation:
      'Contains a 12-digit Indian national Aadhaar identifier pattern. High risk of identity fraud or impersonation.',
    regex: /\b[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    maskType: 'GOVERNMENT_ID',
  },
  {
    id: 'SPI_GOVT_PAN',
    category: 'SENSITIVE_INFO',
    severity: 'HIGH',
    title: 'Tax Identifier (Indian PAN Card) Exposed',
    explanation:
      'Contains an Indian Permanent Account Number (PAN) identifier pattern.',
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    maskType: 'GOVERNMENT_ID',
  },
  {
    id: 'SPI_GOVT_SSN',
    category: 'SENSITIVE_INFO',
    severity: 'HIGH',
    title: 'National Social Security Number (SSN) Exposed',
    explanation:
      'Contains a US Social Security Number format. High financial and identity theft vulnerability.',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    maskType: 'GOVERNMENT_ID',
  },
  {
    id: 'SPI_CREDIT_CARD',
    category: 'SENSITIVE_INFO',
    severity: 'HIGH',
    title: 'Payment Card Number Exposed',
    explanation:
      'Contains a 13-16 digit payment card number structure, creating direct financial fraud vulnerability.',
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    maskType: 'FINANCIAL_CARD',
  },
  {
    id: 'SPI_PHYSICAL_ADDRESS',
    category: 'SENSITIVE_INFO',
    severity: 'HIGH',
    title: 'Physical Residence / Location Address Pattern',
    explanation:
      'Contains residential or physical location cues (street, apartment, layout, pin code), posing direct offline safety risks.',
    regex:
      /\b(?:(?:flat|apt|apartment|house|plot|door|villa|building|suite|unit)\s*(?:no\.?|#)?\s*[0-9A-Za-z/-]+[,\s]+[A-Za-z0-9\s,./#-]{2,60}(?:street|road|nagar|colony|layout|lane|marg|avenue|cross|floor|block|sector|phase|enclave|residency|apartments?|society|complex)[^.\n]{0,60}(?:[1-8]\d{5}|\d{5})?|\d{1,5}(?:[/-]\d{1,5})?\s+[A-Za-z0-9.\s]{1,40}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|marg|nagar|colony|layout|cross|main)\b(?:[^.\n]{0,40}(?:[1-8]\d{5}|\d{5}))?)\b/gi,
    maskType: 'PHYSICAL_ADDRESS',
  },
];

export const SAFETY_ACTIONS_MAP: Record<SafetyRiskLevel, string[]> = {
  HIGH: [
    'Immediate Safety Check: If you believe you or someone else is in imminent physical danger, immediately contact emergency services (112 / 911) or your nearest local police department.',
    'Preserve Evidentiary Integrity: Do not delete threatening messages, voicemails, or profiles. Use the SafeSignal Evidence Vault to store cryptographically verified SHA-256 records.',
    'Cease Direct Communication: Do not respond, counter-threaten, or negotiate with perpetrators, as communication often escalates aggression.',
    'Formal Cyber Crime Reporting: File a formal complaint with the National Cyber Crime Portal (cybercrime.gov.in) or local law enforcement, attaching your SafeSignal case export.',
    'Isolate Connected Profiles: Set all social accounts to private/friends-only and restrict incoming direct messages to approved contacts.',
  ],
  MEDIUM: [
    'Boundary Enforcement: Mute or block the perpetrator using platform safety tools without prior notice.',
    'Document Incident Progression: Log all incoming messages, timestamps, and usernames in your SafeSignal incident timeline.',
    'Platform Abuse Reports: Submit formal violation reports to host platforms citing targeted harassment or doxxing.',
    'Sensitive Data Redaction: Before sharing evidence or screenshots with third parties, use SafeSignal Privacy Protection to redact addresses, phone numbers, and IDs.',
    'Credential & Session Audit: Enable two-factor authentication (2FA) and terminate any unrecognized active account sessions.',
  ],
  LOW: [
    'Monitor Communication: Keep a passive record of any further unsolicited messages or handle changes.',
    'Platform Keyword Filters: Configure in-app mute filters for abusive terms to minimize unsolicited contact.',
    'Review Privacy Settings: Verify that personal contact information (email, phone, location tags) is hidden from public view.',
  ],
};
