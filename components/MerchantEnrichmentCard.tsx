import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radii, darkUI } from "../lib/theme";

type MerchantDetails = Record<string, unknown>;

type Props = {
  merchantType: string;
  merchantDetails: MerchantDetails;
};

function RideshareCard({ details }: { details: MerchantDetails }) {
  const pickup = String(details.pickup ?? "");
  const dropoff = String(details.dropoff ?? "");
  const duration = details.duration ? String(details.duration) : null;
  const distance = details.distance ? String(details.distance) : null;
  const driverName = details.driver_name ? String(details.driver_name) : null;
  const vehicle = details.vehicle ? String(details.vehicle) : null;

  const metaParts: string[] = [];
  if (duration) metaParts.push(duration);
  if (distance) metaParts.push(distance);
  const metaLine = metaParts.join(" \u00B7 ");

  return (
    <View style={styles.card}>
      {metaLine ? (
        <Text style={styles.metaLine}>{metaLine}</Text>
      ) : null}

      {pickup ? (
        <View style={styles.stopRow}>
          <View style={[styles.dot, styles.dotPickup]} />
          <Text style={styles.stopText} numberOfLines={2}>{pickup}</Text>
        </View>
      ) : null}

      {pickup && dropoff ? (
        <View style={styles.routeLine} />
      ) : null}

      {dropoff ? (
        <View style={styles.stopRow}>
          <View style={[styles.dot, styles.dotDropoff]} />
          <Text style={styles.stopText} numberOfLines={2}>{dropoff}</Text>
        </View>
      ) : null}

      {driverName ? (
        <Text style={styles.driverLine}>
          {driverName}{vehicle ? ` \u00B7 ${vehicle}` : ""}
        </Text>
      ) : null}
    </View>
  );
}

function EcommerceCard({ details }: { details: MerchantDetails }) {
  const estimatedDelivery = details.estimated_delivery
    ? String(details.estimated_delivery)
    : null;
  const orderNumber = details.order_number ? String(details.order_number) : null;

  return (
    <View style={styles.card}>
      {estimatedDelivery ? (
        <Text style={styles.headerLine}>Arrives {estimatedDelivery}</Text>
      ) : orderNumber ? (
        <Text style={styles.headerLine}>Order {orderNumber}</Text>
      ) : null}
    </View>
  );
}

function FoodDeliveryCard({ details }: { details: MerchantDetails }) {
  const restaurant = details.restaurant_name ? String(details.restaurant_name) : null;
  const deliveryAddress = details.delivery_address ? String(details.delivery_address) : null;

  if (!restaurant && !deliveryAddress) return null;

  return (
    <View style={styles.card}>
      {restaurant ? (
        <View style={styles.stopRow}>
          <Ionicons name="restaurant-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.stopText} numberOfLines={1}>{restaurant}</Text>
        </View>
      ) : null}
      {deliveryAddress ? (
        <View style={styles.stopRow}>
          <Ionicons name="location-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.stopText} numberOfLines={2}>{deliveryAddress}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SaasCard({ details }: { details: MerchantDetails }) {
  const planName = details.plan_name ? String(details.plan_name) : null;
  const serviceName = details.service_name ? String(details.service_name) : null;
  const billingPeriod = details.billing_period ? String(details.billing_period) : null;
  const nextBillingDate = details.next_billing_date ? String(details.next_billing_date) : null;
  const seats = details.seats ? Number(details.seats) : null;

  return (
    <View style={styles.card}>
      {planName || serviceName ? (
        <Text style={styles.headerLine}>{planName ?? serviceName}</Text>
      ) : null}
      <View style={styles.saasRow}>
        {billingPeriod ? (
          <View style={styles.saasChip}>
            <Ionicons name="refresh-outline" size={12} color={darkUI.labelSecondary} />
            <Text style={styles.saasChipText}>{billingPeriod.charAt(0).toUpperCase() + billingPeriod.slice(1)}</Text>
          </View>
        ) : null}
        {seats && seats > 1 ? (
          <View style={styles.saasChip}>
            <Ionicons name="people-outline" size={12} color={darkUI.labelSecondary} />
            <Text style={styles.saasChipText}>{seats} seats</Text>
          </View>
        ) : null}
      </View>
      {nextBillingDate ? (
        <Text style={styles.metaLine}>Next charge {nextBillingDate}</Text>
      ) : null}
    </View>
  );
}

function RetailCard({ details }: { details: MerchantDetails }) {
  const storeName = details.store_name ? String(details.store_name) : null;
  const storeLocation = details.store_location ? String(details.store_location) : null;
  const paymentMethod = details.payment_method ? String(details.payment_method) : null;

  if (!storeName && !storeLocation && !paymentMethod) return null;

  return (
    <View style={styles.card}>
      {storeLocation ? (
        <View style={styles.stopRow}>
          <Ionicons name="location-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.stopText} numberOfLines={2}>{storeLocation}</Text>
        </View>
      ) : storeName ? (
        <Text style={styles.headerLine}>{storeName}</Text>
      ) : null}
      {paymentMethod ? (
        <View style={styles.stopRow}>
          <Ionicons name="card-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.metaLine} numberOfLines={1}>{paymentMethod}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EcommerceItemsCard({ items }: { items: Array<Record<string, unknown>> }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Ionicons name="cube-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.itemText} numberOfLines={2}>
            {item.quantity && Number(item.quantity) > 1 ? `${item.quantity} × ` : ""}
            {String(item.name ?? "Item")}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MerchantEnrichmentCard({ merchantType, merchantDetails }: Props) {
  if (!merchantDetails) return null;

  switch (merchantType) {
    case "rideshare":
      return <RideshareCard details={merchantDetails} />;
    case "food_delivery":
      return <FoodDeliveryCard details={merchantDetails} />;
    case "ecommerce":
      return <EcommerceCard details={merchantDetails} />;
    case "saas":
      return <SaasCard details={merchantDetails} />;
    case "retail":
      return <RetailCard details={merchantDetails} />;
    default:
      return null;
  }
}

/**
 * Standalone card for showing line items with product icons (ecommerce style).
 * Used when merchant_type is ecommerce and we have receipt_items.
 */
export function MerchantItemsList({
  items,
  estimatedDelivery,
}: {
  items: Array<{ name: string; quantity?: number }>;
  estimatedDelivery?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      {estimatedDelivery ? (
        <Text style={styles.headerLine}>Arrived {estimatedDelivery}</Text>
      ) : null}
      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Ionicons name="cube-outline" size={14} color={darkUI.labelSecondary} />
          <Text style={styles.itemText} numberOfLines={2}>
            {item.quantity && item.quantity > 1 ? `${item.quantity} × ` : ""}
            {item.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: darkUI.cardElevated,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: darkUI.stroke,
  },
  metaLine: {
    fontFamily: font.medium,
    fontSize: 13,
    color: darkUI.labelSecondary,
    marginBottom: 10,
  },
  headerLine: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: darkUI.label,
    marginBottom: 4,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotPickup: {
    backgroundColor: "#3A7D44",
  },
  dotDropoff: {
    backgroundColor: darkUI.label,
    borderRadius: 2,
  },
  routeLine: {
    width: 2,
    height: 14,
    backgroundColor: darkUI.strokeSoft,
    marginLeft: 4,
    marginBottom: 6,
  },
  stopText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    color: darkUI.label,
  },
  driverLine: {
    fontFamily: font.regular,
    fontSize: 13,
    color: darkUI.labelMuted,
    marginTop: 6,
  },
  saasRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  saasChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: darkUI.strokeSoft,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saasChipText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: darkUI.labelSecondary,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  itemText: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    color: darkUI.label,
  },
});
