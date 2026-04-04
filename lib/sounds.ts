/**
 * Micro-interaction haptic feedback system.
 *
 * Crafted haptic patterns via expo-haptics. Each named event maps to a
 * specific tactile "shape" so the app feels responsive and alive. Short
 * audio can be wired in later via expo-av + bundled assets if needed.
 */

let Haptics: typeof import("expo-haptics") | null = null;
try {
  Haptics = require("expo-haptics");
} catch {}

const canHaptic = !!Haptics?.impactAsync;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Haptic pattern primitives ──

const selectionTick = () => Haptics?.selectionAsync().catch(() => {});
const impactLight = () =>
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const impactMedium = () =>
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
const impactHeavy = () =>
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
const notifSuccess = () =>
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
const notifWarning = () =>
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
const notifError = () =>
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );

// ── Named feedback events ──

/** Minimal crisp tick when switching tabs. */
async function tabTap() {
  if (!canHaptic) return;
  selectionTick();
}

/** Satisfying press for the FAB / "+" button. */
async function fabPress() {
  if (!canHaptic) return;
  impactMedium();
  await delay(60);
  impactLight();
}

/** Quick pop for selecting chips, toggling options. */
async function pop() {
  if (!canHaptic) return;
  impactLight();
}

/** Double-pulse "coin drop" when an expense is saved. */
async function coin() {
  if (!canHaptic) return;
  impactMedium();
  await delay(100);
  notifSuccess();
}

/** Soft tap when adding line items or quick-add actions. */
async function add() {
  if (!canHaptic) return;
  impactLight();
}

/** Medium "thunk" plus light follow-through when settling debts / balances. */
async function settle() {
  if (!canHaptic) return;
  impactMedium();
  await delay(70);
  impactLight();
}

/** Notification success — toasts, payment completion, confirmations. */
async function success() {
  if (!canHaptic) return;
  notifSuccess();
}

/** Subtle alert buzz. */
async function warning() {
  if (!canHaptic) return;
  notifWarning();
}

/** Sharp error pulse. */
async function error() {
  if (!canHaptic) return;
  notifError();
}

/** Gentle thud for modal / sheet appearance. */
async function sheetOpen() {
  if (!canHaptic) return;
  impactLight();
}

/** Tiny tick for toggling a switch or radio. */
async function toggle() {
  if (!canHaptic) return;
  selectionTick();
}

/** Firm press for payment / Tap to Pay actions. */
async function paymentTap() {
  if (!canHaptic) return;
  impactHeavy();
  await delay(80);
  impactMedium();
}

export const sfx = {
  tabTap,
  fabPress,
  pop,
  coin,
  add,
  settle,
  success,
  warning,
  error,
  sheetOpen,
  toggle,
  paymentTap,
};
