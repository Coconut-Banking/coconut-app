export type HomeFeedFilter = "all" | "bills" | "splits" | "payments";

export const HOME_FEED_TABS: {
  id: HomeFeedFilter;
  label: string;
  icon?: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
}[] = [
  { id: "all", label: "All" },
  { id: "bills", label: "Bills", icon: "receipt-outline" },
  { id: "splits", label: "Splits", icon: "people-outline" },
  { id: "payments", label: "Payments", icon: "swap-horizontal-outline" },
];
