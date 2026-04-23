import { getMerchantLogoDomain, getMerchantLogoUrl } from "./merchant-logos";

describe("getMerchantLogoDomain", () => {
  it("matches exact merchant names", () => {
    expect(getMerchantLogoDomain("Uber")).toBe("uber.com");
    expect(getMerchantLogoDomain("Starbucks")).toBe("starbucks.com");
    expect(getMerchantLogoDomain("Netflix")).toBe("netflix.com");
  });

  it("matches partial merchant names (transaction descriptions)", () => {
    expect(getMerchantLogoDomain("UBER TRIP 12345")).toBe("uber.com");
    expect(getMerchantLogoDomain("STARBUCKS #4521")).toBe("starbucks.com");
    expect(getMerchantLogoDomain("APPLE.COM/BILL")).toBe("apple.com");
  });

  it("is case-insensitive", () => {
    expect(getMerchantLogoDomain("NETFLIX")).toBe("netflix.com");
    expect(getMerchantLogoDomain("netflix")).toBe("netflix.com");
    expect(getMerchantLogoDomain("Netflix")).toBe("netflix.com");
  });

  it("returns null for unknown merchants", () => {
    expect(getMerchantLogoDomain("Random Local Shop")).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(getMerchantLogoDomain(null)).toBeNull();
    expect(getMerchantLogoDomain(undefined)).toBeNull();
    expect(getMerchantLogoDomain("")).toBeNull();
  });

  it("handles multi-word merchants", () => {
    expect(getMerchantLogoDomain("Burger King #123")).toBe("bk.com");
    expect(getMerchantLogoDomain("Taco Bell")).toBe("tacobell.com");
  });
});

describe("getMerchantLogoUrl", () => {
  it("returns CDN URL for known merchant", () => {
    const url = getMerchantLogoUrl("Uber");
    expect(url).toContain("logos.getquikturn.io/uber.com");
    expect(url).toContain("token=");
  });

  it("includes size parameter", () => {
    const url = getMerchantLogoUrl("Uber", 128);
    expect(url).toContain("size=128");
  });

  it("returns null for unknown merchant", () => {
    expect(getMerchantLogoUrl("Unknown Shop")).toBeNull();
  });
});
