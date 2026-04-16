import { renderHook, act } from "@testing-library/react";
import { useReceiptSplit } from "./useReceiptSplit";

function makeApiFetch(overrides?: Partial<Response>): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Response);
}

describe("useReceiptSplit — saveAssignments", () => {
  it("throws when apiFetch returns a non-ok response", async () => {
    const apiFetch = makeApiFetch({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "Server error" }),
    });

    const { result } = renderHook(() => useReceiptSplit(apiFetch));

    // Set a receiptId so saveAssignments does not early-return
    act(() => {
      // Directly manipulate via the hook's uploadReceipt would require full flow;
      // instead we patch receiptId via the returned state setter indirectly by
      // triggering setReceiptId through a successful uploadReceipt mock.
    });

    // We need to exercise the branch where receiptId is set.
    // Re-render the hook with a mock apiFetch that simulates a successful parse
    // so receiptId gets populated, then test saveAssignments.
    const parsedApiFetch = jest.fn().mockImplementation((path: string) => {
      if (path === "/api/receipt/parse") {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: "receipt-123",
            receipt_items: [],
            subtotal: 0,
            tax: 0,
            tip: 0,
            extras: [],
            total: 0,
            merchant_name: "Test",
          }),
        } as unknown as Response);
      }
      // assign endpoint returns 500
      return Promise.resolve({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: "Server error" }),
      } as unknown as Response);
    });

    const { result: result2 } = renderHook(() => useReceiptSplit(parsedApiFetch));

    // Trigger uploadReceipt to populate receiptId
    await act(async () => {
      await result2.current.uploadReceipt("file://test.jpg");
    });

    expect(result2.current.receiptId).toBe("receipt-123");

    // Now call saveAssignments — should throw due to !res.ok
    await expect(
      act(async () => {
        await result2.current.saveAssignments();
      })
    ).rejects.toThrow("Server error");
  });

  it("resolves without throwing when apiFetch returns ok response", async () => {
    const parsedApiFetch = jest.fn().mockImplementation((path: string) => {
      if (path === "/api/receipt/parse") {
        return Promise.resolve({
          ok: true,
          json: jest.fn().mockResolvedValue({
            id: "receipt-456",
            receipt_items: [],
            subtotal: 0,
            tax: 0,
            tip: 0,
            extras: [],
            total: 0,
            merchant_name: "Test",
          }),
        } as unknown as Response);
      }
      // assign endpoint returns 200
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      } as unknown as Response);
    });

    const { result } = renderHook(() => useReceiptSplit(parsedApiFetch));

    await act(async () => {
      await result.current.uploadReceipt("file://test.jpg");
    });

    expect(result.current.receiptId).toBe("receipt-456");

    await expect(
      act(async () => {
        await result.current.saveAssignments();
      })
    ).resolves.not.toThrow();
  });
});
