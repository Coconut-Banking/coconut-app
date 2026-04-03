import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { font } from "../lib/theme";

const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];

/**
 * Shared avatar component for group members / friends.
 * Shows Clerk profile photo when available, falls back to colored initials.
 */
export const MemberAvatar = React.memo(function MemberAvatar({
  name,
  size = 32,
  imageUrl,
  variant = "solid",
}: {
  name: string;
  size?: number;
  imageUrl?: string | null;
  /** "solid" = opaque background (group detail), "soft" = translucent tint (home pills) */
  variant?: "solid" | "soft";
}) {
  const [imgError, setImgError] = useState(false);
  const idx = (name?.charCodeAt(0) ?? 0) % MEMBER_COLORS.length;
  const color = MEMBER_COLORS[idx];
  const initials = (name ?? "").slice(0, 2).toUpperCase();
  const radius = size * 0.3;

  const hasPhoto = Boolean(imageUrl) && !imgError;

  if (hasPhoto) {
    return (
      <Image
        source={{ uri: imageUrl! }}
        style={[s.img, { width: size, height: size, borderRadius: radius }]}
        contentFit="cover"
        cachePolicy="disk"
        onError={() => setImgError(true)}
      />
    );
  }

  if (variant === "soft") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}33`,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: `${color}55`,
        }}
      >
        <Text style={{ color, fontFamily: font.bold, fontSize: size * 0.3 }}>
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.circle, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <Text style={[s.initials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
});

const s = StyleSheet.create({
  img: {
    overflow: "hidden",
  },
  circle: {
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: font.bold,
  },
});
