import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

const mockApiFetch = jest.fn();
jest.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

import EmailReceiptsScreen from "../app/(tabs)/email-receipts";

const MOCK_RECEIPTS = [
  {
    id: "r1",
    merchant: "Amazon",
    amount: 42.99,
    date: "2026-03-01T00:00:00Z",
    currency: "USD",
    raw_subject: "Your Amazon.com order",
    raw_from: "ship-confirm@amazon.com",
    line_items: [
      { name: "USB-C Cable", quantity: 2, price: 9.99 },
      { name: "Phone Case", quantity: 1, price: 23.01 },
    ],
  },
  {
    id: "r2",
    merchant: "Walmart",
    amount: 15.5,
    date: "2026-02-28T00:00:00Z",
    currency: "USD",
    raw_subject: "Your Walmart receipt",
    raw_from: "receipt@walmart.com",
    line_items: [],
  },
  {
    id: "r3",
    merchant: "Target",
    amount: 89.0,
    date: "2026-02-25T00:00:00Z",
    currency: "USD",
    raw_subject: "Your Target receipt",
    raw_from: "receipts@target.com",
  },
];

describe("EmailReceiptsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows loading state initially", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<EmailReceiptsScreen />);
    expect(getByText("Loading receipts...")).toBeTruthy();
  });

  it("shows empty state when no receipts exist", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ receipts: [] }) });
    const { getByText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("No receipts yet")).toBeTruthy());
    expect(getByText("Connect Gmail in Settings and scan for receipts.")).toBeTruthy();
    expect(getByText("Go to Settings")).toBeTruthy();
  });

  it("renders receipt list with merchant, date, and amount", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ receipts: MOCK_RECEIPTS }),
    });

    const { getByText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("Amazon")).toBeTruthy());
    expect(getByText("$42.99")).toBeTruthy();
    expect(getByText("Walmart")).toBeTruthy();
    expect(getByText("$15.50")).toBeTruthy();
    expect(getByText("Target")).toBeTruthy();
    expect(getByText("$89.00")).toBeTruthy();
  });

  it("filters receipts by merchant name using search", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ receipts: MOCK_RECEIPTS }),
    });

    const { getByText, getByPlaceholderText, queryByText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("Amazon")).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText("Search receipts..."), "walmart");

    expect(getByText("Walmart")).toBeTruthy();
    expect(queryByText("Amazon")).toBeNull();
    expect(queryByText("Target")).toBeNull();
  });

  it("shows 'No matching receipts' when search has no results", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ receipts: MOCK_RECEIPTS }),
    });

    const { getByText, getByPlaceholderText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("Amazon")).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText("Search receipts..."), "nonexistent");
    expect(getByText("No matching receipts")).toBeTruthy();
    expect(getByText("Try a different search term.")).toBeTruthy();
  });

  it("opens receipt detail modal when a receipt is tapped", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ receipts: MOCK_RECEIPTS }),
    });

    const { getByText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("Amazon")).toBeTruthy());

    fireEvent.press(getByText("Amazon"));

    await waitFor(() => expect(getByText("Receipt Details")).toBeTruthy());
    expect(getByText("USB-C Cable")).toBeTruthy();
    expect(getByText("Phone Case")).toBeTruthy();
    expect(getByText("Your Amazon.com order")).toBeTruthy();
    expect(getByText("ship-confirm@amazon.com", { exact: false })).toBeTruthy();
  });

  it("handles API failure gracefully", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { getByText } = render(<EmailReceiptsScreen />);

    await waitFor(() => expect(getByText("No receipts yet")).toBeTruthy());
  });
});
