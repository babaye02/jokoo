// Push notifications — Emergent-managed relay.
// Handles: permission request, native device token retrieval, backend registration.
//
// Playbook constraints:
//  • Use `getDevicePushTokenAsync()` — NOT `getExpoPushTokenAsync()`
//  • Re-register on every app open (tokens rotate)
//  • Push failure never blocks auth/app flow
//  • Guard everything with Platform.OS !== "web"

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "@/src/api";

export type RegisterResult = {
  status: "granted" | "denied" | "unsupported" | "error";
  canAskAgain?: boolean;
  error?: string;
};

/**
 * Ask for notification permission then register the native token with our backend.
 * Idempotent — safe to call on every app open.
 */
export async function registerForPush(userId: string): Promise<RegisterResult> {
  if (Platform.OS === "web") {
    return { status: "unsupported" };
  }
  if (!Device.isDevice) {
    // Push notifications require a physical device (or dev-client on simulator with APNs sandbox).
    return { status: "unsupported" };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    let canAskAgain = existing.canAskAgain;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      status = req.status;
      canAskAgain = req.canAskAgain;
    }
    if (status !== "granted") {
      return { status: "denied", canAskAgain };
    }
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    if (!tokenResp?.data) {
      return { status: "error", error: "empty device token" };
    }
    await api.post("/register-push", {
      user_id: userId,
      platform: Platform.OS, // "ios" | "android"
      device_token: tokenResp.data,
    });
    return { status: "granted" };
  } catch (e: any) {
    return { status: "error", error: e?.message || String(e) };
  }
}

/**
 * Utility: check the current permission state without requesting.
 * Useful for the settings screen toggle.
 */
export async function getPushPermissionStatus() {
  if (Platform.OS === "web") return { status: "unsupported" as const };
  const r = await Notifications.getPermissionsAsync();
  return { status: r.status, canAskAgain: r.canAskAgain };
}
