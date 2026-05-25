import { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { font } from "../../lib/theme";
import { sfx } from "../../lib/sounds";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const FRAME_W = Math.min(SCREEN_W - 48, 340);
const FRAME_H = Math.min(SCREEN_H * 0.48, 460);
const CORNER = 28;
const CORNER_STROKE = 3;

type Props = {
  onClose: () => void;
  onPhotoCaptured: (uri: string) => void;
  onPickGallery: () => void;
  busy?: boolean;
};

function CircleIconButton({
  icon,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconCircle, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </TouchableOpacity>
  );
}

function ScanCorners() {
  const corner = (position: object) => [styles.corner, position];
  return (
    <>
      <View style={corner(styles.cornerTL)} />
      <View style={corner(styles.cornerTR)} />
      <View style={corner(styles.cornerBL)} />
      <View style={corner(styles.cornerBR)} />
    </>
  );
}

export function ReceiptScanCamera({
  onClose,
  onPhotoCaptured,
  onPickGallery,
  busy = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    if (capturing || busy || !cameraRef.current) return;
    setCapturing(true);
    void sfx.pop();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        exif: false,
        // Let iOS process to JPEG; skipProcessing leaves HEIC bytes that break OCR upload.
        skipProcessing: false,
      });
      if (photo?.uri) onPhotoCaptured(photo.uri);
    } finally {
      setCapturing(false);
    }
  }, [busy, capturing, onPhotoCaptured]);

  if (!permission) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.centered, { paddingHorizontal: 32 }]}>
        <Ionicons name="camera-outline" size={48} color="#fff" style={{ marginBottom: 16 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>Allow camera access to scan receipts.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permBack} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.permBackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isBusy = busy || capturing;

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flash}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <CircleIconButton icon="chevron-back" onPress={onClose} accessibilityLabel="Go back" />
        <View style={styles.topTitles}>
          <Text style={styles.topTitle}>Scan Receipt</Text>
          <Text style={styles.topSub}>Smart bill splitting</Text>
        </View>
        <CircleIconButton
          icon={flash ? "flash" : "flash-outline"}
          onPress={() => setFlash((f) => !f)}
          accessibilityLabel={flash ? "Turn flash off" : "Turn flash on"}
        />
      </View>

      {/* Center guide */}
      <View style={styles.centerGuide} pointerEvents="none">
        <View style={[styles.frameBox, { width: FRAME_W, height: FRAME_H }]}>
          <ScanCorners />
          <View style={styles.centerCopy}>
            <Ionicons name="camera-outline" size={36} color="rgba(255,255,255,0.9)" />
            <Text style={styles.guideTitle}>Point camera at receipt</Text>
            <Text style={styles.guideSub}>Make sure all text is visible and clear</Text>
          </View>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.controlsRow}>
          <CircleIconButton
            icon="images-outline"
            onPress={onPickGallery}
            disabled={isBusy}
            accessibilityLabel="Import from photos"
          />
          <TouchableOpacity
            style={[styles.shutter, isBusy && { opacity: 0.7 }]}
            onPress={() => void handleCapture()}
            disabled={isBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            {isBusy ? (
              <ActivityIndicator color="#1a1a1a" />
            ) : (
              <Ionicons name="camera" size={30} color="#1a1a1a" />
            )}
          </TouchableOpacity>
          <View style={styles.iconCircleSpacer} />
        </View>
        <Text style={styles.bottomHint}>Tap to scan or choose from Photos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topTitles: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  topTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
  },
  topSub: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleSpacer: {
    width: 44,
    height: 44,
  },
  centerGuide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 100,
  },
  frameBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: "#fff",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_STROKE,
    borderLeftWidth: CORNER_STROKE,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_STROKE,
    borderRightWidth: CORNER_STROKE,
  },
  centerCopy: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  guideTitle: {
    fontFamily: font.bold,
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginTop: 4,
  },
  guideSub: {
    fontFamily: font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 20,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: "center",
    gap: 14,
    paddingTop: 12,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.35)",
  },
  bottomHint: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  permTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  permSub: {
    fontFamily: font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  permBtnText: {
    fontFamily: font.bold,
    fontSize: 16,
    color: "#1a1a1a",
  },
  permBack: {
    padding: 12,
  },
  permBackText: {
    fontFamily: font.medium,
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
  },
});
