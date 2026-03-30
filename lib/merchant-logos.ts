/**
 * Allowlist of known merchants → domain for favicon.
 * Keep in sync with coconut/lib/merchant-logos.ts.
 * Only these show actual logos; others use letter avatars.
 */
const MERCHANT_DOMAINS: Record<string, string> = {
  lyft: "lyft.com",
  uber: "uber.com",
  tesla: "tesla.com",
  apple: "apple.com",
  starbucks: "starbucks.com",
  amazon: "amazon.com",
  zelle: "zelle.com",
  clipper: "clippercard.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  walmart: "walmart.com",
  target: "target.com",
  costco: "costco.com",
  doordash: "doordash.com",
  grubhub: "grubhub.com",
  instacart: "instacart.com",
  mcdonald: "mcdonalds.com",
  chipotle: "chipotle.com",
  dunkin: "dunkindonuts.com",
  paypal: "paypal.com",
  venmo: "venmo.com",
  chase: "chase.com",
  wells: "wellsfargo.com",
  bankofamerica: "bankofamerica.com",
  google: "google.com",
  airbnb: "airbnb.com",
  expedia: "expedia.com",
  southwest: "southwest.com",
  delta: "delta.com",
  united: "united.com",
  americanexpress: "americanexpress.com",
  amex: "americanexpress.com",
  capitalone: "capitalone.com",
  discover: "discover.com",
  kroger: "kroger.com",
  wholefoods: "wholefoodsmarket.com",
  trader: "traderjoes.com",
  publix: "publix.com",
  bestbuy: "bestbuy.com",
  homedepot: "homedepot.com",
  lowes: "lowes.com",
  shell: "shell.com",
  chevron: "chevron.com",
  exxon: "exxonmobil.com",
  bp: "bp.com",
  fandango: "fandango.com",
  wealthsimple: "wealthsimple.com",
};

export function getMerchantLogoDomain(merchantName: string | null | undefined): string | null {
  if (!merchantName) return null;
  const normalized = merchantName.toLowerCase().replace(/\s+/g, "");
  for (const [key, domain] of Object.entries(MERCHANT_DOMAINS)) {
    if (normalized.includes(key)) return domain;
  }
  return null;
}

/** Google favicon URL for a domain; sz=64 works well for list items. */
export function getMerchantLogoUrl(merchantName: string | null | undefined, size: number = 64): string | null {
  const domain = getMerchantLogoDomain(merchantName);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}
