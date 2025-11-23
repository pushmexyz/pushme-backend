// Stream-safe profanity filter
// This is a basic implementation - in production, use a more robust library

const PROFANITY_WORDS: string[] = [
  // Add your list of profanity words here
  // This is a placeholder - use a proper profanity filter library in production
];

const SLUR_PATTERNS: string[] = [
  // Add patterns for slurs and hate speech
  // This is a placeholder
];

export function filterProfanity(text: string): { filtered: string; hasProfanity: boolean } {
  let filtered = text;
  let hasProfanity = false;

  // Check against profanity list
  for (const word of PROFANITY_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(filtered)) {
      hasProfanity = true;
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
  }

  // Check against slur patterns
  for (const pattern of SLUR_PATTERNS) {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(filtered)) {
      hasProfanity = true;
      filtered = filtered.replace(regex, '***');
    }
  }

  return { filtered, hasProfanity };
}

export function sanitizeText(text: string): string {
  // Remove control characters except newlines and tabs
  let sanitized = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  const MAX_LENGTH = 280;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

export function validateTextContent(text: string): { valid: boolean; sanitized: string; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, sanitized: '', error: 'Text content cannot be empty' };
  }

  const sanitized = sanitizeText(text);
  const { filtered, hasProfanity } = filterProfanity(sanitized);

  if (hasProfanity) {
    // In production, you might want to reject or flag this
    // For now, we'll return the filtered version
    return { valid: true, sanitized: filtered };
  }

  return { valid: true, sanitized };
}

