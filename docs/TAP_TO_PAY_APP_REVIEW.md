# Tap to Pay — App Review Implementation Guide

This document tracks implementation status for Apple's Tap to Pay on iPhone production checklist (Case ID: 18856933).

## Checklist Status

### 1. General Requirements

| ID | Status | Implementation |
|----|--------|----------------|
| 1.4 | Done | `pay.tsx`: Handle `TAP_TO_PAY_UNSUPPORTED_DEVICE`, `TAP_TO_PAY_UNSUPPORTED_ANDROID_VERSION` → show "Please update iOS" message |
| 1.5 | Done | `pay.tsx`: Reader warm-up on app launch (initialize) and AppState "active" (re-discover) |
| 1.6 | Done | Stripe Terminal SDK retrieves merchant T&C from Apple; no local storage |
| 1.7 | Done | Clerk uses Face ID / Touch ID for app login |

### 2. Onboarding Merchants

| ID | Status | Notes |
|----|--------|-------|
| 2.1–2.3 | Demonstrated | New user flow: sign up → connect bank → Pay tab → Tap to Pay |

### 3. Enabling Tap to Pay

| ID | Status | Implementation |
|----|--------|----------------|
| 3.1 | Done | Pay tab in bottom nav; Tap to Pay prominent on Pay screen |
| 3.2 | Done | TTP splash/banner shown once to eligible users (Home or Pay) |
| 3.5 | Done | Connect button = T&C acceptance (Stripe SDK handles) |
| 3.6 | Done | Settings → Tap to Pay section → opens Pay tab |

### 4. Educating Merchants

| ID | Status | Implementation |
|----|--------|----------------|
| 4.2 | Done | Educational copy on Pay screen after connect |
| 4.3 | Done | Settings → Tap to Pay → Help/education link |

### 5. Checkout

| ID | Status | Implementation |
|----|--------|----------------|
| 5.1–5.3 | Done | Prominent "Collect payment" button; never greyed (opens T&C if not enabled) |
| 5.5 | Done | Use `hardware-chip-outline` (Ionicons) — for production consider SF Symbol `wave.3.right.circle` |
| 5.6 | Done | Reader warmed at launch/foreground; UI appears quickly |
| 5.7 | Done | "Initializing" state shown when configuring |
| 5.8 | Done | "Processing" state shown after card read |
| 5.9 | Done | Outcome shown: Approved / Declined / Timed out |
| 5.10 | Done | Share sheet for digital receipt (approved and declined) |

### 6. Marketing

| ID | Status | Notes |
|----|--------|-------|
| 6.1 | Planned | Launch email at go-live |
| 6.2 | Done | In-app TTP banner shown once |
| 6.3 | Planned | Push notification at launch |

## Before Submitting to Apple

1. Fill Tab 1: Team ID, Date, Number of Devices
2. Confirm Tab 2 matches app (refunds, receipts)
3. Record videos: New User, Existing User, Checkout
4. Attach checklist to Case ID 18856933
