import { prepareReceiptImageForUpload } from "../prepare-receipt-image";

describe("prepareReceiptImageForUpload", () => {
  it("passes through PDF unchanged", async () => {
    const out = await prepareReceiptImageForUpload("file:///doc.pdf", {
      mimeType: "application/pdf",
      name: "receipt.pdf",
    });
    expect(out).toEqual({
      uri: "file:///doc.pdf",
      mimeType: "application/pdf",
      name: "receipt.pdf",
    });
  });

  it("passes through image uri and mime", async () => {
    const out = await prepareReceiptImageForUpload("file:///photo.heic", {
      mimeType: "image/heic",
      name: "receipt.heic",
    });
    expect(out).toEqual({
      uri: "file:///photo.heic",
      mimeType: "image/heic",
      name: "receipt.heic",
    });
  });
});
