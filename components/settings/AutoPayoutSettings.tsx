import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Switch, Alert } from "react-native";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import { settingsStyles as s } from "./styles";

const THRESHOLDS = [25, 50, 100] as const;
type Threshold = (typeof THRESHOLDS)[number];

type AutoPayoutState = {
  enabled: boolean;
  thresholdUsd: Threshold | null;
  canConfigure: boolean;
};

export function AutoPayoutSettings({ payoutsReady }: { payoutsReady: boolean }) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<AutoPayoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!payoutsReady) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/stripe/connect/auto-payout");
      if (!res.ok) {
        setState(null);
        return;
      }
      const data = (await res.json()) as {
        enabled?: boolean;
        thresholdUsd?: number | null;
        canConfigure?: boolean;
        defaultThresholdUsd?: number;
      };
      const threshold =
        data.thresholdUsd === 50 || data.thresholdUsd === 100
          ? data.thresholdUsd
          : 25;
      setState({
        enabled: Boolean(data.enabled),
        thresholdUsd: threshold,
        canConfigure: Boolean(data.canConfigure),
      });
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, payoutsReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (enabled: boolean, thresholdUsd: Threshold) => {
      setSaving(true);
      try {
        const res = await apiFetch("/api/stripe/connect/auto-payout", {
          method: "PATCH",
          body: { enabled, thresholdUsd },
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          enabled?: boolean;
          thresholdUsd?: number;
        };
        if (!res.ok) {
          Alert.alert("Could not save", data.error ?? "Try again.");
          return;
        }
        const nextThreshold =
          data.thresholdUsd === 50 || data.thresholdUsd === 100 ? data.thresholdUsd : 25;
        setState({
          enabled: Boolean(data.enabled),
          thresholdUsd: nextThreshold,
          canConfigure: true,
        });
        invalidateApiCache("/api/stripe/wallet");
        invalidateApiCache("/api/stripe/connect/auto-payout");
      } catch {
        Alert.alert("Could not save", "Check your connection and try again.");
      } finally {
        setSaving(false);
      }
    },
    [apiFetch],
  );

  if (!payoutsReady) {
    return null;
  }

  if (loading && !state) {
    return <ActivityIndicator style={{ marginTop: 12 }} color={theme.text} />;
  }

  if (!state) {
    return null;
  }

  const threshold = state.thresholdUsd ?? 25;

  return (
    <View
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: radii.md,
        backgroundColor: theme.surfaceTertiary,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 15, fontFamily: font.semibold, color: theme.text }}>
            Automatic bank transfers
          </Text>
          <Text style={{ fontSize: 12, fontFamily: font.regular, color: theme.textTertiary, marginTop: 4 }}>
            Off by default. When on, we send your balance to your bank when it reaches the amount you pick (usually
            2–4 business days).
          </Text>
        </View>
        <Switch
          value={state.enabled}
          disabled={saving}
          onValueChange={(on) => {
            if (on) {
              void save(true, threshold);
            } else {
              void save(false, threshold);
            }
          }}
          trackColor={{ false: theme.border, true: theme.primary }}
        />
      </View>

      {state.enabled ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontFamily: font.medium, color: theme.textSecondary }}>
            Transfer when balance is over
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {THRESHOLDS.map((t) => {
              const selected = threshold === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.primaryLight : theme.surface,
                    alignItems: "center",
                  }}
                  disabled={saving}
                  onPress={() => void save(true, t)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: selected ? font.semibold : font.medium,
                      color: selected ? theme.primary : theme.text,
                    }}
                  >
                    {formatSplitCurrencyAmount(t, "USD")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
