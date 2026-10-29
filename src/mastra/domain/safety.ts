/**
 * Pure domain safety rules for Kora Skin Coach.
 * Zero external or LLM dependencies.
 *
 * Implements Article 3:
 * - "Red flags (changing mole, bleeding, pus, fever, swelling of face/lips, self-harm) -> rule-based referral before any model call."
 * - "No medical diagnosis, ever. Cosmetic wellness only."
 * - "Rx and pregnancy: never recommend prescription/regulated ingredients. If pregnant/nursing, only generally_ok ingredients."
 */

export interface RedFlagResult {
  hasRedFlag: boolean;
  matchedFlags: string[];
  referralMessage: string;
}

export const MEDICAL_DISCLAIMER = 'This is general information, not medical advice.';

export const RED_FLAG_REFERRAL_BASE =
  'Please consult a doctor or board-certified dermatologist promptly. What you described requires an in-person medical evaluation and cannot be assessed safely by an app.';

/**
 * Deterministic regex patterns matching acute symptoms and red flags.
 */
export const RED_FLAG_PATTERNS: { name: string; pattern: RegExp; urgentNote: string }[] = [
  {
    name: 'changing_mole',
    pattern: /\b(?:mole|beauty mark|spot)\b.{0,40}\b(?:chang(?:ing|ed)|grow(?:ing|n)|bleed(?:ing)?|asymmetr|irregular border|darkening|multi-?color)\b/i,
    urgentNote: 'A changing, irregular, or bleeding mole requires immediate evaluation by a dermatologist.',
  },
  {
    name: 'bleeding_or_pus',
    pattern: /\b(?:bleeding|oozing|pus|weeping|crusting|open sore|drainage)\b/i,
    urgentNote: 'Skin lesions with bleeding, oozing, or pus require clinical examination to rule out infection.',
  },
  {
    name: 'face_or_lip_swelling',
    pattern: /\b(?:swelling|swollen)\b.{0,30}\b(?:face|lips?|eyes?|eyelids?|throat|tongue)\b|\b(?:angioedema|anaphylax)\b/i,
    urgentNote: 'Sudden swelling of the face, lips, or eyelids can indicate a serious allergic reaction.',
  },
  {
    name: 'fever_with_rash',
    pattern: /\b(?:fever|chills|high temp(?:erature)?)\b.{0,40}\b(?:rash|skin|breakout|redness|hives)\b|\b(?:rash|skin|breakout|redness|hives)\b.{0,40}\b(?:fever|chills|high temp(?:erature)?)\b/i,
    urgentNote: 'A rash accompanied by fever or chills requires urgent medical attention.',
  },
  {
    name: 'spreading_severe_rash',
    pattern: /\b(?:spreading rapidly|severe rash|blistering (?:skin|rash)|skin peeling off|hives all over)\b/i,
    urgentNote: 'A rapidly spreading rash or blistering skin requires immediate clinical care.',
  },
  {
    name: 'severe_pain',
    pattern: /\b(?:unbearable|excruciating|severe) pain\b.{0,30}\b(?:skin|face|burn)\b/i,
    urgentNote: 'Severe or unbearable skin pain should be checked by a physician immediately.',
  },
  {
    name: 'self_harm',
    pattern: /\b(?:suicid|kill myself|harm myself|end it all|want to die)\b/i,
    urgentNote: 'If you are experiencing thoughts of self-harm, please reach out to emergency services or call/text 988 (in the US & Canada).',
  },
];

/**
 * Pure function: Detects medical red flags in user text deterministically.
 */
export function detectRedFlags(text: string): RedFlagResult {
  if (!text || typeof text !== 'string') {
    return { hasRedFlag: false, matchedFlags: [], referralMessage: '' };
  }

  const matchedFlags: string[] = [];
  const urgentNotes: string[] = [];

  for (const { name, pattern, urgentNote } of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) {
      matchedFlags.push(name);
      urgentNotes.push(urgentNote);
    }
  }

  if (matchedFlags.length === 0) {
    return { hasRedFlag: false, matchedFlags: [], referralMessage: '' };
  }

  const notesText = urgentNotes.join(' ');
  const referralMessage = `${notesText}\n\n${RED_FLAG_REFERRAL_BASE}\n\n${MEDICAL_DISCLAIMER}`;

  return {
    hasRedFlag: true,
    matchedFlags,
    referralMessage,
  };
}

/**
 * Prescription or regulated active ingredients that AI coach must NEVER recommend.
 */
export const RESTRICTED_PRESCRIPTION_KEYWORDS = [
  'tretinoin',
  'adapalene',
  'tazarotene',
  'isotretinoin',
  'trifarotene',
  'hydroquinone',
  'clindamycin',
  'erythromycin',
  'metronidazole',
  'ivermectin',
  'spironolactone',
  'doxycycline',
  'minocycline',
  'accutane',
];

export function isPrescriptionOrRegulated(ingredientIdOrName: string): boolean {
  const normalized = ingredientIdOrName.toLowerCase().trim();
  return RESTRICTED_PRESCRIPTION_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Safe ingredients for pregnancy or nursing.
 * When pregnant/nursing, only `generally_ok` ingredients are permitted.
 */
export function isPregnancySafe(pregnancyStatus?: string): boolean {
  if (!pregnancyStatus) return false;
  return pregnancyStatus.toLowerCase().trim() === 'generally_ok';
}
