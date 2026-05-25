import { parseReceiptUploadError } from "../receipt-upload-errors";

describe("parseReceiptUploadError", () => {
  it("maps not_a_receipt code", () => {
    const r = parseReceiptUploadError({
      code: "not_a_receipt",
      error: "This looks like a regular photo.",
    });
    expect(r.code).toBe("not_a_receipt");
    expect(r.message).toBe("This looks like a regular photo.");
  });

  it("defaults generic", () => {
    const r = parseReceiptUploadError({ error: "Server error" });
    expect(r.code).toBe("generic");
    expect(r.message).toBe("Server error");
  });
});
