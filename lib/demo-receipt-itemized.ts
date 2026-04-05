import type { ReceiptItem } from "./receipt-split";

type ReceiptPayload = {
  items: ReceiptItem[];
  merchantName: string;
  merchantType: string | null;
  merchantDetails: Record<string, unknown> | null;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  extras: Array<{ name: string; amount: number }>;
  rideshare?: Record<string, unknown>;
};

/** Matches prototype Uber ride — used when receiptId === "__demo__" on home strip. */
export function getDemoItemizedReceipt(): ReceiptPayload {
  return {
    items: [],
    merchantName: "Uber",
    merchantType: "rideshare",
    merchantDetails: {
      provider: "uber",
      pickup: "Nobu Restaurant, Hayes St",
      dropoff: "Mission Dist, 18th & Valencia",
      duration: "22 min",
      distance: "4.2 mi",
      driver_name: "Carlos M.",
    },
    rideshare: {
      pickup: "Nobu Restaurant, Hayes St",
      dropoff: "Mission Dist, 18th & Valencia",
      duration: "22 min",
      distance: "4.2 mi",
      driver_name: "Carlos M.",
      fare_breakdown: { base_fare: 8.5, distance_charge: 12.0, city_fee: 1.0, tip: 4.0 },
    },
    subtotal: 21.5,
    tax: 2.8,
    tip: 4.0,
    total: 31.75,
    extras: [{ name: "Booking fee", amount: 2.25 }, { name: "City fee", amount: 1.0 }],
  };
}

export function getDemoFoodDeliveryReceipt(): ReceiptPayload {
  const items: ReceiptItem[] = [
    { id: "f1", name: "Big Mac Combo", quantity: 1, unitPrice: 12.99, totalPrice: 12.99 },
    { id: "f2", name: "McFlurry", quantity: 1, unitPrice: 4.99, totalPrice: 4.99 },
    { id: "f3", name: "Chicken McNuggets 10pc", quantity: 2, unitPrice: 7.99, totalPrice: 15.98 },
  ];
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  return {
    items,
    merchantName: "DoorDash",
    merchantType: "food_delivery",
    merchantDetails: {
      provider: "doordash",
      restaurant_name: "McDonald's",
      delivery_address: "789 Oak Ave, San Francisco",
      delivery_fee: 3.99,
      service_fee: 2.5,
      tip: 4.0,
    },
    subtotal,
    tax: 3.37,
    tip: 4.0,
    total: 39.82,
    extras: [{ name: "Delivery fee", amount: 3.99 }, { name: "Service fee", amount: 2.5 }],
  };
}

export function getDemoEcommerceReceipt(): ReceiptPayload {
  const items: ReceiptItem[] = [
    { id: "e1", name: "Apple AirPods Pro (2nd Gen)", quantity: 1, unitPrice: 199.0, totalPrice: 199.0 },
    { id: "e2", name: "USB-C Charging Cable 2-pack", quantity: 1, unitPrice: 14.99, totalPrice: 14.99 },
    { id: "e3", name: "Clorox Disinfecting Wipes", quantity: 2, unitPrice: 8.49, totalPrice: 16.98 },
  ];
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  return {
    items,
    merchantName: "Amazon",
    merchantType: "ecommerce",
    merchantDetails: {
      provider: "amazon",
      order_number: "111-2345678-9012345",
      shipping_cost: 0,
      estimated_delivery: "Apr 1, 2026",
    },
    subtotal,
    tax: 19.89,
    tip: 0,
    total: subtotal + 19.89,
    extras: [],
  };
}

export function getDemoSaasReceipt(): ReceiptPayload {
  return {
    items: [],
    merchantName: "Spotify",
    merchantType: "saas",
    merchantDetails: {
      service_name: "Spotify",
      plan_name: "Premium Individual",
      billing_period: "monthly",
      next_billing_date: "Apr 19, 2026",
      seats: 1,
    },
    subtotal: 9.99,
    tax: 1.3,
    tip: 0,
    total: 11.29,
    extras: [],
  };
}

export function getDemoRetailReceipt(): ReceiptPayload {
  const items: ReceiptItem[] = [
    { id: "r1", name: "Air Max 270 React", quantity: 1, unitPrice: 150.0, totalPrice: 150.0 },
    { id: "r2", name: "Dri-FIT T-Shirt", quantity: 2, unitPrice: 35.0, totalPrice: 70.0 },
  ];
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  return {
    items,
    merchantName: "Nike",
    merchantType: "retail",
    merchantDetails: {
      store_name: "Nike",
      store_location: "Yorkdale Mall, Toronto, ON",
      payment_method: "Visa ending in 4242",
    },
    subtotal,
    tax: 28.6,
    tip: 0,
    total: subtotal + 28.6,
    extras: [],
  };
}
