import { describe, expect, it } from "@jest/globals";
import {
  countryCodeToFlag,
  formatPurchaseLocation,
  inferLocationFromDescriptor,
  resolvePurchaseLocation,
} from "../transaction-location";

describe("formatPurchaseLocation", () => {
  it("joins city and region", () => {
    expect(formatPurchaseLocation({ city: "San Francisco", region: "CA" })).toBe(
      "San Francisco, CA",
    );
  });

  it("appends non-US country", () => {
    expect(
      formatPurchaseLocation({ city: "Paris", region: "Île-de-France", country: "FR" }),
    ).toMatch(/^Paris, Île-de-France · 🇫🇷 FR$/);
  });

  it("omits US when place is present", () => {
    expect(
      formatPurchaseLocation({ city: "Austin", region: "TX", country: "US" }),
    ).toBe("Austin, TX");
  });

  it("shows country alone when no city/region", () => {
    expect(formatPurchaseLocation({ country: "JP" })).toMatch(/🇯🇵 JP/);
  });
});

describe("countryCodeToFlag", () => {
  it("returns empty for invalid codes", () => {
    expect(countryCodeToFlag("USA")).toBe("");
  });
});

describe("inferLocationFromDescriptor", () => {
  it("reads Seoul from Korean POS debit strings", () => {
    expect(
      inferLocationFromDescriptor("POS DEBIT CJ OLIVE YOUNG CO., LTD SEOUL 4752"),
    ).toEqual({ city: "Seoul", country: "KR" });
  });

  it("reads trailing Seoul from merchant label", () => {
    expect(inferLocationFromDescriptor(null, "Cj Olive Young Hongik U Seoul")).toEqual({
      city: "Seoul",
      country: "KR",
    });
  });

  it("reads US city/state from descriptor", () => {
    expect(
      inferLocationFromDescriptor("CLEAR *CLEARME.COM NEW YORK NY 05/07"),
    ).toEqual({ city: "NEW YORK", region: "NY", country: "US" });
  });
});

describe("resolvePurchaseLocation", () => {
  it("prefers Plaid fields over descriptor", () => {
    expect(
      resolvePurchaseLocation({
        city: "Austin",
        region: "TX",
        rawName: "POS DEBIT … SEOUL 4752",
      }),
    ).toBe("Austin, TX");
  });

  it("falls back to descriptor when Plaid location empty", () => {
    expect(
      resolvePurchaseLocation({
        rawName: "POS DEBIT VITA CAFE +83 14220 SEOUL",
        merchantName: "Vita Cafe",
      }),
    ).toMatch(/Seoul · 🇰🇷/);
  });
});
