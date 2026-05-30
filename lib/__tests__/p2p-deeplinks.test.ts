jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
}));

import { describe, it, expect } from "@jest/globals";
import {
  getVenmoDeepLink,
  isVenmoUsername,
} from "../p2p-deeplinks";

describe("p2p-deeplinks", () => {
  it("rejects email as Venmo recipient", () => {
    expect(isVenmoUsername("ansh.personal18@gmail.com")).toBe(false);
    expect(isVenmoUsername("@harshil")).toBe(true);
  });

  it("builds venmo.com username web URL (not query on root)", () => {
    const { webUrl, appUrl } = getVenmoDeepLink(4.6, "anshsharma", "Coconut");
    expect(webUrl).toMatch(/^https:\/\/venmo\.com\/anshsharma\?/);
    expect(webUrl).not.toContain("gmail.com");
    expect(appUrl).toContain("recipients=anshsharma");
  });
});
