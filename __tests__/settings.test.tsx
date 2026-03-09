import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("../hooks/useGmail");
jest.mock("../lib/api", () => ({
  useApiFetch: () => jest.fn(),
}));

import SettingsScreen from "../app/(tabs)/settings";
import { useGmail } from "../hooks/useGmail";

const mockUseGmail = useGmail as jest.Mock;

function gmailState(overrides: Record<string, any> = {}) {
  return {
    connected: false,
    email: null,
    lastScan: null,
    loading: false,
    scanning: false,
    scanResult: null,
    tokenError: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    scan: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

describe("SettingsScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows loading state while checking connection", () => {
    mockUseGmail.mockReturnValue(gmailState({ loading: true }));
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Checking connection...")).toBeTruthy();
  });

  it("shows connect button when Gmail is not connected", () => {
    mockUseGmail.mockReturnValue(gmailState());
    const { getByText } = render(<SettingsScreen />);

    expect(getByText("No email connected")).toBeTruthy();
    expect(getByText("Connect Gmail")).toBeTruthy();
  });

  it("calls connect when Connect Gmail is pressed", () => {
    const connect = jest.fn();
    mockUseGmail.mockReturnValue(gmailState({ connect }));
    const { getByText } = render(<SettingsScreen />);

    fireEvent.press(getByText("Connect Gmail"));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("shows connected state with email and actions", () => {
    mockUseGmail.mockReturnValue(
      gmailState({
        connected: true,
        email: "user@gmail.com",
        lastScan: "2026-03-01T00:00:00Z",
      })
    );
    const { getByText } = render(<SettingsScreen />);

    expect(getByText("user@gmail.com")).toBeTruthy();
    expect(getByText("Connected")).toBeTruthy();
    expect(getByText("Scan for receipts")).toBeTruthy();
    expect(getByText("View receipts")).toBeTruthy();
    expect(getByText("Disconnect Gmail")).toBeTruthy();
  });

  it("shows 'Not yet scanned' when connected but never scanned", () => {
    mockUseGmail.mockReturnValue(gmailState({ connected: true, email: "a@b.com" }));
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Not yet scanned")).toBeTruthy();
  });

  it("shows scanning state", () => {
    mockUseGmail.mockReturnValue(gmailState({ connected: true, email: "a@b.com", scanning: true }));
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Scanning...")).toBeTruthy();
  });

  it("shows scan results", () => {
    mockUseGmail.mockReturnValue(
      gmailState({
        connected: true,
        email: "a@b.com",
        scanResult: { scanned: 5, matched: 3 },
      })
    );
    const { getByText } = render(<SettingsScreen />);
    expect(getByText(/Found 5 receipts, matched 3 to transactions/)).toBeTruthy();
  });

  it("shows token error state with reconnect option", () => {
    mockUseGmail.mockReturnValue(
      gmailState({ connected: true, email: "a@b.com", tokenError: true })
    );
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Gmail access has expired. Please reconnect.")).toBeTruthy();
    expect(getByText("Reconnect Gmail")).toBeTruthy();
  });

  it("shows confirmation alert when disconnecting", () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockUseGmail.mockReturnValue(gmailState({ connected: true, email: "a@b.com" }));
    const { getByText } = render(<SettingsScreen />);

    fireEvent.press(getByText("Disconnect Gmail"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Disconnect Gmail",
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Disconnect" }),
      ])
    );
  });

  it("shows sign out option", () => {
    mockUseGmail.mockReturnValue(gmailState());
    const { getByText } = render(<SettingsScreen />);
    expect(getByText("Sign out")).toBeTruthy();
  });

  it("shows privacy notice", () => {
    mockUseGmail.mockReturnValue(gmailState());
    const { getByText } = render(<SettingsScreen />);
    expect(getByText(/only reads receipt emails/)).toBeTruthy();
  });
});
