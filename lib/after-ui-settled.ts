/**
 * Run work after the current frame / interactions settle.
 * Replaces deprecated InteractionManager.runAfterInteractions.
 */
export function afterUiSettled(callback: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback());
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

export function afterUiSettledAsync(): Promise<void> {
  return new Promise((resolve) => afterUiSettled(resolve));
}
