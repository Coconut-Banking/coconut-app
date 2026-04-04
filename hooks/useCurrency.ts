import { useUser } from "@clerk/expo";
import { useCallback, useMemo } from "react";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "🇨🇭" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", flag: "🇲🇽" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const DEFAULT_CODE: CurrencyCode = "USD";

export function getCurrencyInfo(code: string) {
  const upper = code.trim().toUpperCase();
  return SUPPORTED_CURRENCIES.find((c) => c.code === upper) ?? SUPPORTED_CURRENCIES[0];
}

export function useCurrency() {
  const { user } = useUser();

  const currencyCode: CurrencyCode = useMemo(() => {
    const stored = (user?.unsafeMetadata as { currency?: string } | undefined)?.currency;
    if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
      return stored as CurrencyCode;
    }
    return DEFAULT_CODE;
  }, [user?.unsafeMetadata]);

  const info = useMemo(() => getCurrencyInfo(currencyCode), [currencyCode]);

  const setCurrency = useCallback(
    async (code: CurrencyCode) => {
      if (!user) return;
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, currency: code },
      });
    },
    [user]
  );

  return { currencyCode, symbol: info.symbol, flag: info.flag, name: info.name, setCurrency };
}
