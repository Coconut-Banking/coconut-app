import {
  createPaymentLink,
  deliverPaymentLink,
  findSettlementForPerson,
} from "../payment-link";

jest.mock("react-native", () => ({
  Share: { share: jest.fn(async () => ({})) },
  Alert: { alert: jest.fn() },
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

const { Share } = jest.requireMock("react-native") as {
  Share: { share: jest.Mock };
};
const Clipboard = jest.requireMock("expo-clipboard") as {
  setStringAsync: jest.Mock;
};

describe("findSettlementForPerson", () => {
  const suggestions = [
    {
      fromMemberId: "m-koushik",
      toMemberId: "m-me",
      fromName: "Koushik",
      toName: "You",
      amount: 7.63,
    },
    {
      fromMemberId: "m-aaran",
      toMemberId: "m-me",
      fromName: "Aaran Muraleetharan",
      toName: "You",
      amount: 7.63,
    },
  ];

  const members = [
    { id: "m-koushik", displayName: "Koushik" },
    { id: "m-aaran", displayName: "Aaran Muraleetharan" },
  ];

  it("matches by member id when display name differs from assignee name", () => {
    const hit = findSettlementForPerson(
      { name: "Koushik Paul", memberId: "m-koushik", totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-koushik");
  });

  it("matches fuzzy first name", () => {
    const hit = findSettlementForPerson(
      { name: "Aaran", memberId: null, totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-aaran");
  });

  it("ignores memberId from a different group", () => {
    const hit = findSettlementForPerson(
      { name: "Koushik", memberId: "m-old-group-id", totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-koushik");
  });
});

describe("createPaymentLink", () => {
  beforeEach(() => {
    Share.share.mockClear();
    Clipboard.setStringAsync.mockClear();
  });

  it("returns url and token on success", async () => {
    const apiFetch = jest.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          url: "https://coconut-app.dev/pay/abc123",
          token: "abc123",
        }),
    }));

    const result = await createPaymentLink(apiFetch, {
      amount: 12.5,
      groupId: "g1",
      payerMemberId: "p1",
      receiverMemberId: "r1",
    });

    expect(result).toEqual({
      ok: true,
      url: "https://coconut-app.dev/pay/abc123",
      token: "abc123",
    });
    expect(apiFetch).toHaveBeenCalledWith("/api/stripe/create-payment-link", {
      method: "POST",
      body: {
        amount: 12.5,
        currency: "USD",
        groupId: "g1",
        payerMemberId: "p1",
        receiverMemberId: "r1",
      },
    });
  });

  it("surfaces API errors", async () => {
    const apiFetch = jest.fn(async () => ({
      ok: false,
      text: async () => JSON.stringify({ error: "Nothing left to settle" }),
    }));

    const result = await createPaymentLink(apiFetch, {
      amount: 12.5,
      groupId: "g1",
      payerMemberId: "p1",
      receiverMemberId: "r1",
    });

    expect(result).toEqual({ ok: false, error: "Nothing left to settle" });
  });
});

describe("deliverPaymentLink", () => {
  beforeEach(() => {
    Share.share.mockClear();
    Clipboard.setStringAsync.mockClear();
  });

  it("copies link and opens share sheet", async () => {
    const apiFetch = jest.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          url: "https://coconut-app.dev/pay/tok99",
          token: "tok99",
        }),
    }));

    const result = await deliverPaymentLink(
      apiFetch,
      {
        amount: 9,
        groupId: "g1",
        payerMemberId: "p1",
        receiverMemberId: "r1",
      },
      { personName: "Sam", amount: 9, offerShare: true },
    );

    expect(result.ok).toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      "https://coconut-app.dev/pay/tok99",
    );
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("https://coconut-app.dev/pay/tok99"),
        url: "https://coconut-app.dev/pay/tok99",
      }),
    );
  });
});
