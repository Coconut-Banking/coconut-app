import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type FeatureToggles = {
  showEmailReceipts: boolean;
  showInsights: boolean;
  showBankSync: boolean;
};

const DEFAULTS: FeatureToggles = {
  showEmailReceipts: true,
  showInsights: true,
  showBankSync: true,
};

const STORAGE_KEY = "@coconut_feature_toggles";

type FeatureToggleContextType = {
  toggles: FeatureToggles;
  setToggle: (key: keyof FeatureToggles, value: boolean) => void;
};

const FeatureToggleContext = createContext<FeatureToggleContextType>({
  toggles: DEFAULTS,
  setToggle: () => {},
});

export function FeatureToggleProvider({ children }: { children: React.ReactNode }) {
  const [toggles, setToggles] = useState<FeatureToggles>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          setToggles({ ...DEFAULTS, ...JSON.parse(stored) });
        } catch {}
      }
    });
  }, []);

  const setToggle = (key: keyof FeatureToggles, value: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo(() => ({ toggles, setToggle }), [toggles]);

  return (
    <FeatureToggleContext.Provider value={value}>
      {children}
    </FeatureToggleContext.Provider>
  );
}

export function useFeatureToggles() {
  return useContext(FeatureToggleContext);
}
