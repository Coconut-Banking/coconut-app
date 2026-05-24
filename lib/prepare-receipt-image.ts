/**
 * Normalize receipt upload metadata before POST /api/receipt/parse.
 * HEIC→JPEG conversion runs on coconut-web (heic-convert); no native module required.
 */
export async function prepareReceiptImageForUpload(
  uri: string,
  opts?: { mimeType?: string; name?: string }
): Promise<{ uri: string; mimeType: string; name: string }> {
  const mimeType = opts?.mimeType ?? "image/jpeg";
  const name = opts?.name ?? "receipt.jpg";
  return { uri, mimeType, name };
}
