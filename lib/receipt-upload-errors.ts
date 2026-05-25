export type ReceiptUploadErrorCode = "not_a_receipt" | "generic";

export function parseReceiptUploadError(data: {
  error?: string;
  code?: string;
}): { message: string; code: ReceiptUploadErrorCode } {
  if (data.code === "not_a_receipt") {
    return {
      code: "not_a_receipt",
      message:
        data.error?.trim() ||
        "We couldn't find a receipt in this image. Try a clear photo of your receipt or e-receipt.",
    };
  }
  return {
    code: "generic",
    message: data.error?.trim() || "Upload failed",
  };
}
