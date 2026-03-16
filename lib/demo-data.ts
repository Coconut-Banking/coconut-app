import type {
  GroupsSummary,
  GroupDetail,
  PersonDetail,
  RecentActivityItem,
} from "../hooks/useGroups";

// DEMO_MODE is now a runtime toggle (default off). See lib/demo-mode-context.tsx

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// ── Friends ──

const DEMO_FRIENDS = [
  { key: "f1", displayName: "Sarah Chen", balance: 45.5 },
  { key: "f2", displayName: "Mike Johnson", balance: -32.0 },
  { key: "f3", displayName: "Priya Patel", balance: 120.75 },
  { key: "f4", displayName: "Alex Rivera", balance: 0 },
  { key: "f5", displayName: "Jordan Lee", balance: -18.25 },
];

// ── Groups ──

const DEMO_GROUPS = [
  {
    id: "g1",
    name: "NYC Trip",
    memberCount: 4,
    myBalance: 87.25,
    lastActivityAt: daysAgo(1),
  },
  {
    id: "g2",
    name: "Roommates",
    memberCount: 3,
    myBalance: -32.0,
    lastActivityAt: daysAgo(0),
  },
  {
    id: "g3",
    name: "Dinner Club",
    memberCount: 5,
    myBalance: 0,
    lastActivityAt: daysAgo(5),
  },
  {
    id: "g4",
    name: "Road Trip 2026",
    memberCount: 4,
    myBalance: 53.5,
    lastActivityAt: daysAgo(3),
  },
];

// ── Summary ──

export const DEMO_SUMMARY: GroupsSummary = {
  groups: DEMO_GROUPS,
  friends: DEMO_FRIENDS,
  totalOwedToMe: 166.25,
  totalIOwe: 50.25,
  netBalance: 116.0,
};

// ── Group Details ──

const NYC_MEMBERS = [
  { id: "m1", user_id: "me", email: "me@co.co", display_name: "You" },
  { id: "m2", user_id: null, email: "sarah@email.com", display_name: "Sarah Chen" },
  { id: "m3", user_id: null, email: "priya@email.com", display_name: "Priya Patel" },
  { id: "m4", user_id: null, email: "alex@email.com", display_name: "Alex Rivera" },
];

export const DEMO_GROUP_DETAILS: Record<string, GroupDetail> = {
  g1: {
    id: "g1",
    name: "NYC Trip",
    members: NYC_MEMBERS,
    activity: [
      { id: "a1", merchant: "Uber to JFK", amount: 68.0, paidBy: "m1", splitCount: 4, createdAt: daysAgo(1) },
      { id: "a2", merchant: "Joe's Pizza", amount: 42.5, paidBy: "m2", splitCount: 4, createdAt: daysAgo(1) },
      { id: "a3", merchant: "Museum of Modern Art", amount: 100.0, paidBy: "m1", splitCount: 4, createdAt: daysAgo(2) },
      { id: "a4", merchant: "Shake Shack", amount: 56.8, paidBy: "m3", splitCount: 4, createdAt: daysAgo(2) },
      { id: "a5", merchant: "Broadway Tickets", amount: 320.0, paidBy: "m1", splitCount: 4, createdAt: daysAgo(3) },
    ],
    balances: [
      { memberId: "m1", paid: 488.0, owed: 146.83, total: 341.17 },
      { memberId: "m2", paid: 42.5, owed: 146.83, total: -104.33 },
      { memberId: "m3", paid: 56.8, owed: 146.83, total: -90.03 },
      { memberId: "m4", paid: 0, owed: 146.83, total: -146.83 },
    ],
    suggestions: [
      { fromMemberId: "m4", toMemberId: "m1", amount: 146.83 },
      { fromMemberId: "m2", toMemberId: "m1", amount: 104.33 },
      { fromMemberId: "m3", toMemberId: "m1", amount: 90.03 },
    ],
    totalSpend: 587.3,
  },
  g2: {
    id: "g2",
    name: "Roommates",
    members: [
      { id: "m1", user_id: "me", email: "me@co.co", display_name: "You" },
      { id: "m5", user_id: null, email: "mike@email.com", display_name: "Mike Johnson" },
      { id: "m6", user_id: null, email: "jordan@email.com", display_name: "Jordan Lee" },
    ],
    activity: [
      { id: "a6", merchant: "Electric Bill", amount: 142.0, paidBy: "m5", splitCount: 3, createdAt: daysAgo(0) },
      { id: "a7", merchant: "Internet", amount: 89.99, paidBy: "m1", splitCount: 3, createdAt: daysAgo(5) },
      { id: "a8", merchant: "Cleaning Supplies", amount: 34.5, paidBy: "m6", splitCount: 3, createdAt: daysAgo(7) },
      { id: "a9", merchant: "Groceries", amount: 156.2, paidBy: "m1", splitCount: 3, createdAt: daysAgo(10) },
    ],
    balances: [
      { memberId: "m1", paid: 246.19, owed: 105.67, total: 140.52 },
      { memberId: "m5", paid: 142.0, owed: 105.67, total: 36.33 },
      { memberId: "m6", paid: 34.5, owed: 105.67, total: -71.17 },
    ],
    suggestions: [
      { fromMemberId: "m6", toMemberId: "m1", amount: 71.17 },
    ],
    totalSpend: 422.69,
  },
  g3: {
    id: "g3",
    name: "Dinner Club",
    members: [
      { id: "m1", user_id: "me", email: "me@co.co", display_name: "You" },
      { id: "m2", user_id: null, email: "sarah@email.com", display_name: "Sarah Chen" },
      { id: "m5", user_id: null, email: "mike@email.com", display_name: "Mike Johnson" },
      { id: "m3", user_id: null, email: "priya@email.com", display_name: "Priya Patel" },
      { id: "m7", user_id: null, email: "emma@email.com", display_name: "Emma Wilson" },
    ],
    activity: [
      { id: "a10", merchant: "Nobu", amount: 285.0, paidBy: "m2", splitCount: 5, createdAt: daysAgo(5) },
      { id: "a11", merchant: "Le Bernardin", amount: 420.0, paidBy: "m1", splitCount: 5, createdAt: daysAgo(12) },
    ],
    balances: [
      { memberId: "m1", paid: 420.0, owed: 141.0, total: 279.0 },
      { memberId: "m2", paid: 285.0, owed: 141.0, total: 144.0 },
      { memberId: "m3", paid: 0, owed: 141.0, total: -141.0 },
      { memberId: "m5", paid: 0, owed: 141.0, total: -141.0 },
      { memberId: "m7", paid: 0, owed: 141.0, total: -141.0 },
    ],
    suggestions: [],
    totalSpend: 705.0,
  },
  g4: {
    id: "g4",
    name: "Road Trip 2026",
    members: [
      { id: "m1", user_id: "me", email: "me@co.co", display_name: "You" },
      { id: "m4", user_id: null, email: "alex@email.com", display_name: "Alex Rivera" },
      { id: "m5", user_id: null, email: "mike@email.com", display_name: "Mike Johnson" },
      { id: "m6", user_id: null, email: "jordan@email.com", display_name: "Jordan Lee" },
    ],
    activity: [
      { id: "a12", merchant: "Gas Station", amount: 62.4, paidBy: "m1", splitCount: 4, createdAt: daysAgo(3) },
      { id: "a13", merchant: "Airbnb", amount: 340.0, paidBy: "m1", splitCount: 4, createdAt: daysAgo(3) },
      { id: "a14", merchant: "Hiking Gear Rental", amount: 120.0, paidBy: "m4", splitCount: 4, createdAt: daysAgo(4) },
    ],
    balances: [
      { memberId: "m1", paid: 402.4, owed: 130.6, total: 271.8 },
      { memberId: "m4", paid: 120.0, owed: 130.6, total: -10.6 },
      { memberId: "m5", paid: 0, owed: 130.6, total: -130.6 },
      { memberId: "m6", paid: 0, owed: 130.6, total: -130.6 },
    ],
    suggestions: [
      { fromMemberId: "m5", toMemberId: "m1", amount: 130.6 },
      { fromMemberId: "m6", toMemberId: "m1", amount: 130.6 },
      { fromMemberId: "m4", toMemberId: "m1", amount: 10.6 },
    ],
    totalSpend: 522.4,
  },
};

// ── Person Details ──

export const DEMO_PERSON_DETAILS: Record<string, PersonDetail> = {
  f1: {
    displayName: "Sarah Chen",
    balance: 45.5,
    email: "sarah@email.com",
    key: "f1",
    activity: [
      { id: "pa1", merchant: "Uber to JFK", amount: 68.0, groupName: "NYC Trip", paidByMe: true, paidByThem: false, myShare: 17.0, theirShare: 17.0, effectOnBalance: 17.0, createdAt: daysAgo(1) },
      { id: "pa2", merchant: "Joe's Pizza", amount: 42.5, groupName: "NYC Trip", paidByMe: false, paidByThem: true, myShare: 10.63, theirShare: 10.63, effectOnBalance: -10.63, createdAt: daysAgo(1) },
      { id: "pa3", merchant: "Nobu", amount: 285.0, groupName: "Dinner Club", paidByMe: false, paidByThem: true, myShare: 57.0, theirShare: 57.0, effectOnBalance: -57.0, createdAt: daysAgo(5) },
      { id: "pa4", merchant: "Le Bernardin", amount: 420.0, groupName: "Dinner Club", paidByMe: true, paidByThem: false, myShare: 84.0, theirShare: 84.0, effectOnBalance: 84.0, createdAt: daysAgo(12) },
    ],
    settlements: [{ groupId: "g1", fromMemberId: "m2", toMemberId: "m1", amount: 45.5 }],
  },
  f2: {
    displayName: "Mike Johnson",
    balance: -32.0,
    email: "mike@email.com",
    key: "f2",
    activity: [
      { id: "pa5", merchant: "Electric Bill", amount: 142.0, groupName: "Roommates", paidByMe: false, paidByThem: true, myShare: 47.33, theirShare: 47.33, effectOnBalance: -47.33, createdAt: daysAgo(0) },
      { id: "pa6", merchant: "Internet", amount: 89.99, groupName: "Roommates", paidByMe: true, paidByThem: false, myShare: 30.0, theirShare: 30.0, effectOnBalance: 30.0, createdAt: daysAgo(5) },
    ],
    settlements: [{ groupId: "g2", fromMemberId: "m1", toMemberId: "m5", amount: 32.0 }],
  },
  f3: {
    displayName: "Priya Patel",
    balance: 120.75,
    email: "priya@email.com",
    key: "f3",
    activity: [
      { id: "pa7", merchant: "Shake Shack", amount: 56.8, groupName: "NYC Trip", paidByMe: false, paidByThem: true, myShare: 14.2, theirShare: 14.2, effectOnBalance: -14.2, createdAt: daysAgo(2) },
      { id: "pa8", merchant: "Broadway Tickets", amount: 320.0, groupName: "NYC Trip", paidByMe: true, paidByThem: false, myShare: 80.0, theirShare: 80.0, effectOnBalance: 80.0, createdAt: daysAgo(3) },
    ],
    settlements: [{ groupId: "g1", fromMemberId: "m3", toMemberId: "m1", amount: 120.75 }],
  },
  f4: {
    displayName: "Alex Rivera",
    balance: 0,
    email: "alex@email.com",
    key: "f4",
    activity: [
      { id: "pa9", merchant: "Hiking Gear Rental", amount: 120.0, groupName: "Road Trip 2026", paidByMe: false, paidByThem: true, myShare: 30.0, theirShare: 30.0, effectOnBalance: -30.0, createdAt: daysAgo(4) },
      { id: "pa10", merchant: "Gas Station", amount: 62.4, groupName: "Road Trip 2026", paidByMe: true, paidByThem: false, myShare: 15.6, theirShare: 15.6, effectOnBalance: 15.6, createdAt: daysAgo(3) },
    ],
    settlements: [],
  },
  f5: {
    displayName: "Jordan Lee",
    balance: -18.25,
    email: "jordan@email.com",
    key: "f5",
    activity: [
      { id: "pa11", merchant: "Cleaning Supplies", amount: 34.5, groupName: "Roommates", paidByMe: false, paidByThem: true, myShare: 11.5, theirShare: 11.5, effectOnBalance: -11.5, createdAt: daysAgo(7) },
      { id: "pa12", merchant: "Groceries", amount: 156.2, groupName: "Roommates", paidByMe: true, paidByThem: false, myShare: 52.07, theirShare: 52.07, effectOnBalance: 52.07, createdAt: daysAgo(10) },
    ],
    settlements: [{ groupId: "g2", fromMemberId: "m1", toMemberId: "m6", amount: 18.25 }],
  },
};

// ── Recent Activity ──

export const DEMO_ACTIVITY: RecentActivityItem[] = [
  { id: "ra1", who: "Mike Johnson", action: "added", what: "Electric Bill", in: "Roommates", direction: "owe", amount: 47.33, time: "Today" },
  { id: "ra2", who: "You", action: "added", what: "Uber to JFK", in: "NYC Trip", direction: "get_back", amount: 51.0, time: "Yesterday" },
  { id: "ra3", who: "Sarah Chen", action: "added", what: "Joe's Pizza", in: "NYC Trip", direction: "owe", amount: 10.63, time: "Yesterday" },
  { id: "ra4", who: "You", action: "added", what: "Museum of Modern Art", in: "NYC Trip", direction: "get_back", amount: 75.0, time: "2 days ago" },
  { id: "ra5", who: "You", action: "added", what: "Gas Station", in: "Road Trip 2026", direction: "get_back", amount: 46.8, time: "3 days ago" },
  { id: "ra6", who: "You", action: "added", what: "Airbnb", in: "Road Trip 2026", direction: "get_back", amount: 255.0, time: "3 days ago" },
  { id: "ra7", who: "Alex Rivera", action: "added", what: "Hiking Gear Rental", in: "Road Trip 2026", direction: "owe", amount: 30.0, time: "4 days ago" },
  { id: "ra8", who: "Sarah Chen", action: "added", what: "Nobu", in: "Dinner Club", direction: "owe", amount: 57.0, time: "5 days ago" },
  { id: "ra9", who: "Jordan Lee", action: "settled", what: "", in: "Roommates", direction: "settled", amount: 18.25, time: "1 week ago" },
];
