export type ReceiptUploadErrorCode =
  | "not_a_receipt"
  | "session_unavailable"
  | "generic";

function isSessionUnavailableMessage(msg: string | undefined): boolean {
  const m = msg?.toLowerCase() ?? "";
  return (
    m.includes("session token") ||
    m.includes("sign in") ||
    m.includes("unauthorized")
  );
}

export function parseReceiptUploadError(
  data: { error?: string; code?: string },
  httpStatus?: number,
): { message: string; code: ReceiptUploadErrorCode } {
  if (data.code === "not_a_receipt") {
    return {
      code: "not_a_receipt",
      message:
        data.error?.trim() ||
        "We couldn't find a receipt in this image. Try a clear photo of your receipt or e-receipt.",
    };
  }
  if (
    httpStatus === 425 ||
    httpStatus === 401 ||
    isSessionUnavailableMessage(data.error)
  ) {
    return {
      code: "session_unavailable",
      message:
        "Still connecting your session. Wait a moment, then choose the photo again.",
    };
  }
  return {
    code: "generic",
    message: data.error?.trim() || "Upload failed",
  };
}
