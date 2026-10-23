export type EntityType = "api_key" | "email" | "phone" | "credit_card" | "national_id" | "ip_address";

export type DetectedEntity = {
  id: string;
  type: EntityType;
  raw: string;
  placeholder: string;
  start: number;
  end: number;
};

export type ReplacementMap = Record<string, string>;

export type MaskResult = {
  maskedText: string;
  replacements: ReplacementMap;
  detected: DetectedEntity[];
};

// Validates Credit Card number via Luhn Algorithm
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function detectSensitiveEntities(text: string): DetectedEntity[] {
  if (!text) return [];

  const entities: DetectedEntity[] = [];
  const seenPlaceholders = new Map<string, string>();
  let apiKeyCount = 1;
  let emailCount = 1;
  let idCount = 1;
  let cardCount = 1;
  let phoneCount = 1;

  const getPlaceholder = (type: EntityType, raw: string, getNum: () => number, prefix: string) => {
    const key = `${type}:${raw}`;
    if (seenPlaceholders.has(key)) return seenPlaceholders.get(key)!;
    const ph = `[${prefix}_${getNum()}]`;
    seenPlaceholders.set(key, ph);
    return ph;
  };

  const hasOverlap = (start: number, end: number) => {
    return entities.some(e => Math.max(start, e.start) < Math.min(end, e.end));
  };

  // 1. API Keys & Secrets
  const apiKeyRegex = /\b(?:sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|gsk_[A-Za-z0-9]{20,}|gh[pous]_[A-Za-z0-9_]{36,}|nvapi-[A-Za-z0-9_-]{30,})\b/g;
  let match: RegExpExecArray | null;
  while ((match = apiKeyRegex.exec(text)) !== null) {
    const raw = match[0];
    entities.push({
      id: `api_key_${entities.length + 1}`,
      type: "api_key",
      raw,
      placeholder: getPlaceholder("api_key", raw, () => apiKeyCount++, "API_KEY"),
      start: match.index,
      end: match.index + raw.length,
    });
  }

  // 2. Email Addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    const raw = match[0];
    entities.push({
      id: `email_${entities.length + 1}`,
      type: "email",
      raw,
      placeholder: getPlaceholder("email", raw, () => emailCount++, "EMAIL"),
      start: match.index,
      end: match.index + raw.length,
    });
  }

  // 3. National IDs (US SSN: 000-00-0000; Sri Lankan NIC: 9 digits + V/X or 12 digits)
  const nationalIdRegex = /\b(?:\d{3}-\d{2}-\d{4}|\d{9}[vVxX]|\d{12})\b/g;
  while ((match = nationalIdRegex.exec(text)) !== null) {
    const raw = match[0];
    if (hasOverlap(match.index, match.index + raw.length)) continue;
    // For 12-digit strings: only treat as a Sri Lankan NIC if it starts with
    // a plausible birth year (19xx or 20xx). Other 12-digit numbers (e.g.
    // Unix timestamps) are skipped to avoid false positives.
    if (/^\d{12}$/.test(raw) && !raw.startsWith("19") && !raw.startsWith("20")) {
      continue;
    }
    entities.push({
      id: `id_${entities.length + 1}`,
      type: "national_id",
      raw,
      placeholder: getPlaceholder("national_id", raw, () => idCount++, "NATIONAL_ID"),
      start: match.index,
      end: match.index + raw.length,
    });
  }

  // 4. Credit Cards
  const ccRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g;
  while ((match = ccRegex.exec(text)) !== null) {
    const raw = match[0];
    if (hasOverlap(match.index, match.index + raw.length)) continue;
    if (isValidLuhn(raw)) {
      entities.push({
        id: `card_${entities.length + 1}`,
        type: "credit_card",
        raw,
        placeholder: getPlaceholder("credit_card", raw, () => cardCount++, "CARD_NUMBER"),
        start: match.index,
        end: match.index + raw.length,
      });
    }
  }

  // 5. Phone Numbers (international or formatted local)
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    const raw = match[0];
    // Check not already overlapping an earlier match
    if (!hasOverlap(match.index, match.index + raw.length)) {
      entities.push({
        id: `phone_${entities.length + 1}`,
        type: "phone",
        raw,
        placeholder: getPlaceholder("phone", raw, () => phoneCount++, "PHONE_NUMBER"),
        start: match.index,
        end: match.index + raw.length,
      });
    }
  }

  // Sort by start position
  return entities.sort((a, b) => a.start - b.start);
}

export function maskText(text: string, entitiesToMask?: DetectedEntity[]): MaskResult {
  const detected = entitiesToMask || detectSensitiveEntities(text);
  if (!detected.length) {
    return { maskedText: text, replacements: {}, detected: [] };
  }

  const replacements: ReplacementMap = {};
  // Sort descending by position to replace safely from back to front
  const sorted = [...detected].sort((a, b) => b.start - a.start);
  let masked = text;

  for (const item of sorted) {
    replacements[item.placeholder] = item.raw;
    masked = masked.slice(0, item.start) + item.placeholder + masked.slice(item.end);
  }

  return {
    maskedText: masked,
    replacements,
    detected,
  };
}

export function unmaskText(maskedText: string, replacements: ReplacementMap): string {
  if (!maskedText || !replacements || Object.keys(replacements).length === 0) {
    return maskedText;
  }

  let result = maskedText;
  for (const [placeholder, original] of Object.entries(replacements)) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/_/g, "[_\\s-]");
    result = result.replace(new RegExp(pattern, "gi"), original);
  }
  return result;
}
