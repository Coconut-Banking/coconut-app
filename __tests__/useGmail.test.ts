import { renderHook, act, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { useGmail } from "../hooks/useGmail";

const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

function createMockApiFetch(responses: Record<string, { ok: boolean; json: () => Promise<any> }>) {
  return jest.fn(async (path: string) => {
    const key = Object.keys(responses).find((k) => path.includes(k));
    if (key) return responses[key];
    return { ok: false, json: async () => ({}) };
  });
}

describe("useGmail hook", () => {
  it("checks Gmail status on mount and reports disconnected", async () => {
    const apiFetch = createMockApiFetch({
      "/api/gmail/status": { ok: true, json: async () => ({ connected: false }) },
    });

    const { result } = renderHook(() => useGmail(apiFetch));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);
    expect(result.current.email).toBeNull();
  });

  it("reports connected with email when status returns connected", async () => {
    const apiFetch = createMockApiFetch({
      "/api/gmail/status": {
        ok: true,
        json: async () => ({
          connected: true,
          email: "user@gmail.com",
          lastScanAt: "2026-03-01T00:00:00Z",
        }),
      },
    });

    const { result } = renderHook(() => useGmail(apiFetch));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(true);
    expect(result.current.email).toBe("user@gmail.com");
    expect(result.current.lastScan).toBe("2026-03-01T00:00:00Z");
  });

  it("opens auth session and refreshes status on connect", async () => {
    let statusCallCount = 0;
    const apiFetch = jest.fn(async (path: string) => {
      if (path.includes("/api/gmail/status")) {
        statusCallCount++;
        return {
          ok: true,
          json: async () =>
            statusCallCount === 1
              ? { connected: false }
              : { connected: true, email: "user@gmail.com" },
        };
      }
      if (path.includes("/api/gmail/auth")) {
        return { ok: true, json: async () => ({ authUrl: "https://accounts.google.com/auth" }) };
      }
      return { ok: false, json: async () => ({}) };
    });

    mockOpenAuth.mockResolvedValueOnce({ type: "success", url: "coconut://gmail-callback?connected=true" });

    const { result } = renderHook(() => useGmail(apiFetch));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connected).toBe(false);

    await act(async () => {
      await result.current.connect();
    });

    expect(mockOpenAuth).toHaveBeenCalledWith("https://accounts.google.com/auth", "coconut://gmail-callback");
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.email).toBe("user@gmail.com");
  });

  it("disconnects and resets state", async () => {
    const apiFetch = jest.fn(async (path: string, opts?: any) => {
      if (path.includes("/api/gmail/status")) {
        return { ok: true, json: async () => ({ connected: true, email: "user@gmail.com" }) };
      }
      if (path.includes("/api/gmail/disconnect")) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    });

    const { result } = renderHook(() => useGmail(apiFetch));

    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.email).toBeNull();
  });

  it("scans receipts and returns results", async () => {
    const apiFetch = jest.fn(async (path: string, opts?: any) => {
      if (path.includes("/api/gmail/status")) {
        return { ok: true, json: async () => ({ connected: true, email: "user@gmail.com" }) };
      }
      if (path.includes("/api/gmail/scan")) {
        return { ok: true, json: async () => ({ scanned: 5, matched: 3 }) };
      }
      return { ok: false, json: async () => ({}) };
    });

    const { result } = renderHook(() => useGmail(apiFetch));

    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.scanning).toBe(false);
    expect(result.current.scanResult).toEqual({ scanned: 5, matched: 3 });
  });

  it("sets tokenError when scan returns authError", async () => {
    const apiFetch = jest.fn(async (path: string, opts?: any) => {
      if (path.includes("/api/gmail/status")) {
        return { ok: true, json: async () => ({ connected: true, email: "user@gmail.com" }) };
      }
      if (path.includes("/api/gmail/scan")) {
        return { ok: false, json: async () => ({ authError: true }) };
      }
      return { ok: false, json: async () => ({}) };
    });

    const { result } = renderHook(() => useGmail(apiFetch));

    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.tokenError).toBe(true);
    expect(result.current.scanning).toBe(false);
  });
});
