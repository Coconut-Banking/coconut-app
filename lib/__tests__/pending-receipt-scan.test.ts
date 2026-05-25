import {
  hasPendingReceiptScan,
  setPendingReceiptScan,
  takePendingReceiptScan,
} from "../pending-receipt-scan";

describe("pending-receipt-scan", () => {
  it("hands off once per set", () => {
    setPendingReceiptScan({ uri: "file://a.jpg", mimeType: "image/jpeg", name: "a.jpg" });
    expect(hasPendingReceiptScan()).toBe(true);
    expect(takePendingReceiptScan()).toEqual({
      uri: "file://a.jpg",
      mimeType: "image/jpeg",
      name: "a.jpg",
    });
    expect(takePendingReceiptScan()).toBeNull();
    expect(hasPendingReceiptScan()).toBe(false);
  });

  it("allows a new scan after consume", () => {
    setPendingReceiptScan({ uri: "file://1.jpg", mimeType: "image/jpeg", name: "1.jpg" });
    takePendingReceiptScan();
    setPendingReceiptScan({ uri: "file://2.jpg", mimeType: "image/jpeg", name: "2.jpg" });
    expect(takePendingReceiptScan()?.uri).toBe("file://2.jpg");
  });
});
