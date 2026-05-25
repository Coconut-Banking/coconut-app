import { prepareReceiptImageForUpload } from "../prepare-receipt-image";

const mockManipulateAsync = jest.fn(async (uri: string) => ({
  uri: `file:///resized-${uri.split("/").pop()}`,
  width: 1280,
  height: 960,
}));

jest.mock("react-native", () => ({
  Image: {
    getSize: (
      _uri: string,
      ok: (w: number, h: number) => void,
      _err?: (e: Error) => void
    ) => ok(4032, 3024),
  },
}));

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
}));

describe("prepareReceiptImageForUpload", () => {
  beforeEach(() => {
    mockManipulateAsync.mockClear();
  });

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
    expect(mockManipulateAsync).not.toHaveBeenCalled();
  });

  it("resizes images to JPEG for faster upload", async () => {
    const out = await prepareReceiptImageForUpload("file:///photo.heic", {
      mimeType: "image/heic",
      name: "receipt.heic",
    });
    expect(out).toEqual({
      uri: "file:///resized-photo.heic",
      mimeType: "image/jpeg",
      name: "receipt.jpg",
    });
    expect(mockManipulateAsync).toHaveBeenCalled();
  });
});
