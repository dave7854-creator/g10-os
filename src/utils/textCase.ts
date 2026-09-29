// Title-case utility for standardizing text across the app.
// Applies title case to names, descriptions, labels, and categories.
// Small connector words stay lowercase unless they start the phrase.
// Acronyms and model names are preserved.

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of',
  'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'via', 'per', 'pro',
]);

// Words that are commonly acronyms or should stay fully uppercase
const ACRONYMS = new Set([
  'VIN', 'API', 'GPS', 'LED', 'ABS', 'ECU', 'PCM', 'TCM', 'BCM',
  'SUV', 'AWD', 'FWD', 'RWD', '4WD', 'DOHC', 'SOHC', 'EFI', 'MPG',
  'RPM', 'AC', 'DC', 'HP', 'SUV', 'ATV', 'UTV', 'FMVSS',
  'NHTSA', 'DOT', 'EPA', 'CARB', 'OEM', ' aftermarket',
  'I', 'II', 'III', 'IV', 'V', 'VI',
]);

// Known automotive model name fragments that have special casing
const MODEL_PATTERNS: { match: RegExp; replace: string }[] = [
  { match: /\b Silverado\b/gi, replace: ' Silverado' },
  { match: /\b F-?150\b/gi, replace: ' F-150' },
  { match: /\b F-?250\b/gi, replace: ' F-250' },
  { match: /\b F-?350\b/gi, replace: ' F-350' },
  { match: /\b F-?450\b/gi, replace: ' F-450' },
  { match: /\b F-?550\b/gi, replace: ' F-550' },
  { match: /\b F-?650\b/gi, replace: ' F-650' },
  { match: /\b2500\b/gi, replace: '2500' },
  { match: /\b1500\b/gi, replace: '1500' },
  { match: /\b3500\b/gi, replace: '3500' },
];

function isAcronym(word: string): boolean {
  return ACRONYMS.has(word.toUpperCase());
}

export function toTitleCase(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const trimmed = text.trim();
  if (trimmed.length === 0) return text;

  const words = trimmed.split(/\s+/);

  const result = words.map((word, index) => {
    if (word.length === 0) return word;

    // Preserve words that are already all uppercase and length >= 2 (likely acronyms)
    if (word.length >= 2 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
      return word;
    }

    // Check against known acronyms (case-insensitive)
    if (isAcronym(word)) {
      return word.toUpperCase();
    }

    // Handle hyphenated words (e.g., "four-wheel" → "Four-Wheel")
    if (word.includes('-')) {
      const parts = word.split('-');
      const cased = parts.map((part) => {
        if (part.length === 0) return part;
        if (isAcronym(part)) return part.toUpperCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      });
      return cased.join('-');
    }

    // Handle words with numbers attached (e.g., "4wd", "v8")
    const numLetterMatch = word.match(/^(\d+)([a-zA-Z]+)$/);
    if (numLetterMatch) {
      const num = numLetterMatch[1];
      const letters = numLetterMatch[2];
      if (isAcronym(letters)) {
        return num + letters.toUpperCase();
      }
      return num + letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    }

    // First word is always capitalized
    if (index === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    // Last word is always capitalized
    if (index === words.length - 1) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    // Small words stay lowercase (unless first or last)
    if (SMALL_WORDS.has(word.toLowerCase())) {
      return word.toLowerCase();
    }

    // Normal case: capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  let joined = result.join(' ');

  // Apply model name corrections
  for (const pattern of MODEL_PATTERNS) {
    joined = joined.replace(pattern.match, pattern.replace);
  }

  return joined;
}
