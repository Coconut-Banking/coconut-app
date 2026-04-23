import { Share, Platform } from "react-native";
import { File, Paths } from "expo-file-system";

interface PersonShare {
  name: string;
  totalOwed: number;
  items: Array<{ itemName: string; shareAmount: number }>;
}

/**
 * Call the server to generate a PDF, save it locally, and open the share sheet.
 */
export async function exportReceiptPdf(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  merchant: string,
  personShares: PersonShare[]
): Promise<void> {
  const res = await apiFetch("/api/receipt/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchant, personShares }),
  });

  if (!res.ok) throw new Error("PDF generation failed");

  const blob = await res.blob();
  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const slug = (merchant || "receipt").replace(/\s+/g, "-").toLowerCase();
  const filename = `receipt-split-${slug}.pdf`;

  const file = new File(Paths.cache, filename);
  file.create();
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  file.write(bytes);

  if (Platform.OS === "ios") {
    await Share.share({ url: file.uri });
  } else {
    await Share.share({ message: file.uri, title: filename });
  }
}

/**
 * Build clean share text for the receipt split.
 */
export function buildShareText(
  merchant: string,
  personShares: PersonShare[],
  grandTotal: number
): string {
  const lines: string[] = [];
  lines.push(`${merchant || "Receipt"} Split — $${grandTotal.toFixed(2)} total`);
  lines.push("");
  for (const p of personShares) {
    lines.push(`${p.name}: $${p.totalOwed.toFixed(2)}`);
    for (const item of p.items) {
      lines.push(`  ${item.itemName} — $${item.shareAmount.toFixed(2)}`);
    }
    lines.push("");
  }
  lines.push("Sent via Coconut");
  return lines.join("\n");
}
