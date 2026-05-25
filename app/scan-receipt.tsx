import { useState, useCallback } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { receiptImagePickerOptions } from "../lib/receipt-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ReceiptScanCamera } from "../components/receipt/ReceiptScanCamera";
import { setPendingReceiptScan } from "../lib/pending-receipt-scan";

function goToReceiptWithFile(uri: string, mimeType: string, name: string) {
  setPendingReceiptScan({ uri, mimeType, name });
  // replace() from a stack modal resets the tab navigator to Home; dismiss + push keeps receipt visible.
  const openReceipt = () => router.push("/(tabs)/receipt");
  if (router.canDismiss()) {
    router.dismiss();
    setTimeout(openReceipt, 0);
  } else {
    openReceipt();
  }
}

export default function ScanReceiptScreen() {
  const [busy, setBusy] = useState(false);

  const onPhotoCaptured = useCallback((uri: string) => {
    goToReceiptWithFile(uri, "image/jpeg", "receipt.jpg");
  }, []);

  const onPickGallery = useCallback(async () => {
    setBusy(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo access to import a receipt.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(receiptImagePickerOptions());
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const ext = (mimeType.split("/")[1] ?? "jpg").replace("heif", "heic");
      goToReceiptWithFile(asset.uri, mimeType, `receipt.${ext}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onPickFiles = useCallback(async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const doc = result.assets[0];
      if (!doc?.uri) return;
      const mimeType = doc.mimeType ?? "application/pdf";
      const name = doc.name ?? (mimeType === "application/pdf" ? "receipt.pdf" : "receipt.jpg");
      goToReceiptWithFile(doc.uri, mimeType, name);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <ReceiptScanCamera
        onClose={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)");
        }}
        onPhotoCaptured={onPhotoCaptured}
        onPickGallery={onPickGallery}
        onPickFiles={onPickFiles}
        busy={busy}
      />
    </>
  );
}
