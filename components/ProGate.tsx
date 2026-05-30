import React from "react";
import { SUBSCRIPTIONS_ENABLED } from "../lib/subscriptions-enabled";

type Props = {
  children: React.ReactNode;
  featureName?: string;
  fallback?: React.ReactNode;
};

/** Pro gating disabled until subscriptions ship. */
export function ProGate({ children, fallback }: Props) {
  if (!SUBSCRIPTIONS_ENABLED) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return <>{children}</>;
}
