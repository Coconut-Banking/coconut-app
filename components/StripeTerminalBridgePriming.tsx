import { useLayoutEffect } from "react";
import { NativeEventEmitter, NativeModules, type NativeModule } from "react-native";

type TerminalNativeModule = NativeModule & { getConstants: () => Record<string, string> };

const terminalModule = NativeModules.StripeTerminalReactNative as TerminalNativeModule | undefined;

const terminalEvents = terminalModule ? new NativeEventEmitter(terminalModule) : null;

/**
 * iOS RCTEventEmitter only forwards events when native `_listenerCount > 0`; otherwise it
 * warns and drops the payload. StripeTerminalProvider subscribes in useEffect (after paint).
 * Subscribing here in useLayoutEffect bumps the count earlier so Tap to Pay reader prompts
 * are not dropped on the first collect (which otherwise often surfaces as CANCELED).
 */
export function StripeTerminalBridgePriming() {
  useLayoutEffect(() => {
    if (!terminalModule || !terminalEvents) return;
    let key: string;
    try {
      const c = terminalModule.getConstants();
      key = c.REQUEST_READER_INPUT;
      if (!key) return;
    } catch {
      return;
    }
    const sub = terminalEvents.addListener(key, () => {});
    return () => sub.remove();
  }, []);

  return null;
}
