/** Plaid purchase location fields (in-store / card-present when bank provides them). */
export type TransactionLocationFields = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

export type PurchaseLocationInput = TransactionLocationFields & {
  /** Bank / card network descriptor (Plaid `name` / our `raw_name`). */
  rawName?: string | null;
  /** Cleaned merchant label — may still embed city when Plaid location is empty. */
  merchantName?: string | null;
};

const COUNTRY_LABEL: Record<string, string> = {
  US: "USA",
  GB: "UK",
  AE: "UAE",
  KR: "Korea",
};

/** Cities often appended to foreign POS / card descriptors when Plaid `location` is empty. */
const DESCRIPTOR_CITY: { pattern: RegExp; city: string; country?: string }[] = [
  { pattern: /\bSEOUL\b/i, city: "Seoul", country: "KR" },
  { pattern: /\bINCHEON\b/i, city: "Incheon", country: "KR" },
  { pattern: /\bBUSAN\b/i, city: "Busan", country: "KR" },
  { pattern: /\bTOKYO\b/i, city: "Tokyo", country: "JP" },
  { pattern: /\bOSAKA\b/i, city: "Osaka", country: "JP" },
  { pattern: /\bLONDON\b/i, city: "London", country: "GB" },
  { pattern: /\bPARIS\b/i, city: "Paris", country: "FR" },
];

const TRAILING_CITY_IN_LABEL =
  /\s(Seoul|Incheon|Busan|Tokyo|Osaka|London|Paris|Singapore|Hong Kong)\s*$/i;

function hasPlaidLocation(fields: TransactionLocationFields): boolean {
  return Boolean(
    (fields.city ?? "").trim() ||
      (fields.region ?? "").trim() ||
      (fields.country ?? "").trim(),
  );
}

/** ISO 3166-1 alpha-2 → regional indicator flag (e.g. US → 🇺🇸). */
export function countryCodeToFlag(code: string): string {
  const c = code.trim().toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(
    ...[...c].map((ch) => 0x1f1e6 - 65 + ch.charCodeAt(0)),
  );
}

function countryDisplay(code: string): string {
  const c = code.trim().toUpperCase();
  const flag = countryCodeToFlag(c);
  const label = COUNTRY_LABEL[c] ?? c;
  return flag ? `${flag} ${label}` : label;
}

/**
 * Parse city/country embedded in card descriptors (e.g. `POS DEBIT … SEOUL 4752`)
 * when the issuer did not populate Plaid `location`.
 */
export function inferLocationFromDescriptor(
  ...texts: (string | null | undefined)[]
): TransactionLocationFields | null {
  for (const text of texts) {
    const t = (text ?? "").trim();
    if (!t) continue;

    for (const { pattern, city, country } of DESCRIPTOR_CITY) {
      if (pattern.test(t)) return { city, country: country ?? null };
    }

    // US: take the last `City ST MM/DD` or `City ST zip` chunk (descriptor often prefixes junk).
    const usDateMatches = [
      ...t.matchAll(/\b([A-Za-z][A-Za-z .'-]{2,28})\s+([A-Z]{2})\s+\d{2}\/\d{2}/g),
    ];
    const usZipMatches = [
      ...t.matchAll(/\b([A-Za-z][A-Za-z .'-]{2,28})\s+([A-Z]{2})\s+\d{4,5}\b/g),
    ];
    const us = usDateMatches.at(-1) ?? usZipMatches.at(-1);
    if (us) {
      const cityName = us[1].trim();
      const region = us[2];
      const words = cityName.split(/\s+/);
      const cityOnly =
        words.length > 2 && /\.(com|net|org)$/i.test(words[0])
          ? words.slice(1).join(" ")
          : cityName;
      if (
        cityOnly.length >= 3 &&
        !/^(POS|DEBIT|CREDIT|LLC|LTD|INC)$/i.test(cityOnly)
      ) {
        return { city: cityOnly, region, country: "US" };
      }
    }

    const trailing = t.match(TRAILING_CITY_IN_LABEL);
    if (trailing) {
      const cityToken = trailing[1];
      const hit = DESCRIPTOR_CITY.find((d) =>
        d.pattern.test(cityToken),
      );
      return {
        city: cityToken.replace(/\b\w/g, (c) => c.toUpperCase()),
        country: hit?.country ?? null,
      };
    }
  }

  return null;
}

/**
 * Compact subtitle for a purchase location (Home / Bank rows).
 * Omits redundant "USA" when city/region already imply a domestic US charge.
 */
export function formatPurchaseLocation(fields: TransactionLocationFields): string | null {
  const city = (fields.city ?? "").trim();
  const region = (fields.region ?? "").trim();
  const country = (fields.country ?? "").trim().toUpperCase();

  const placeParts: string[] = [];
  if (city) placeParts.push(city);
  if (region && region.toLowerCase() !== city.toLowerCase()) placeParts.push(region);
  const place = placeParts.join(", ");

  if (!place && !country) return null;

  if (place && country && country !== "US") {
    return `${place} · ${countryDisplay(country)}`;
  }
  if (place) return place;
  if (country) return countryDisplay(country);
  return null;
}

/** Plaid location first; else infer from bank descriptor / merchant suffix (e.g. Seoul in POS strings). */
export function resolvePurchaseLocation(input: PurchaseLocationInput): string | null {
  if (hasPlaidLocation(input)) {
    return formatPurchaseLocation(input);
  }
  const inferred = inferLocationFromDescriptor(input.rawName, input.merchantName);
  if (inferred) return formatPurchaseLocation(inferred);
  return null;
}
