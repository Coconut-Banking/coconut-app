import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useUser } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";

export function ProfileHeader() {
  const { theme } = useTheme();
  const { user } = useUser();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleProfilePhoto = useCallback(async () => {
    if (!user) return;
    Alert.alert("Profile Photo", undefined, [
      {
        text: "Choose from Library",
        onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
              base64: true,
            });
            if (result.canceled || !result.assets?.[0]?.base64) return;
            setUploadingPhoto(true);
            const asset = result.assets[0];
            const mimeType = asset.mimeType || "image/jpeg";
            const dataUri = `data:${mimeType};base64,${asset.base64}`;
            await user.setProfileImage({ file: dataUri });
            await user.reload();
          } catch (e) {
            Alert.alert(
              "Upload failed",
              e instanceof Error ? e.message : "Please try again",
            );
          } finally {
            setUploadingPhoto(false);
          }
        },
      },
      ...(user.imageUrl && !user.imageUrl.includes("default")
        ? [
            {
              text: "Remove Photo",
              style: "destructive" as const,
              onPress: async () => {
                try {
                  setUploadingPhoto(true);
                  await user.setProfileImage({ file: null });
                  await user.reload();
                } catch (e) {
                  Alert.alert(
                    "Failed",
                    e instanceof Error ? e.message : "Please try again",
                  );
                } finally {
                  setUploadingPhoto(false);
                }
              },
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" },
    ]);
  }, [user]);

  if (!user) return null;

  return (
    <TouchableOpacity
      onPress={handleProfilePhoto}
      activeOpacity={0.7}
      style={styles.container}
    >
      <View style={styles.photoWrap}>
        {uploadingPhoto ? (
          <View
            style={[
              styles.photo,
              {
                backgroundColor: theme.surfaceSecondary,
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <ActivityIndicator size="small" color={theme.text} />
          </View>
        ) : user.imageUrl && !user.imageUrl.includes("default") ? (
          <Image
            source={{ uri: user.imageUrl }}
            style={styles.photo}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.photo, { backgroundColor: theme.primary }]}>
            <Text style={styles.initials}>
              {(user.fullName || user.username || "U")
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Ionicons name="camera" size={12} color={theme.textSecondary} />
        </View>
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={[styles.name, { color: theme.text }]}>
          {user.fullName || user.username || "Account"}
        </Text>
        <Text
          style={[styles.email, { color: theme.textTertiary }]}
          numberOfLines={1}
        >
          {user.primaryEmailAddress?.emailAddress ?? ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  photoWrap: { position: "relative" },
  photo: { width: 56, height: 56, borderRadius: 28, overflow: "hidden" },
  initials: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: font.bold,
    textAlign: "center",
    lineHeight: 56,
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 18, fontFamily: font.semibold },
  email: { fontSize: 14, fontFamily: font.regular, marginTop: 2 },
});
